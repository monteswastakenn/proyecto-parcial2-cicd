#!/usr/bin/env python3
"""Genera los tableros de OpenObserve (formato v8) y los sube por la API REST.

Uso: OO_URL=http://3.16.70.203:6061 OO_AUTH=<base64 usuario:clave> python3 monitoring/tableros.py
Los JSON generados quedan en monitoring/tableros/ para versionarlos o importarlos a mano.
"""
import copy, json, os, pathlib, urllib.request

AQUI = pathlib.Path(__file__).parent
PLANTILLA = json.loads((AQUI / 'plantilla-openobserve.json').read_text())
CONFIG_BASE = PLANTILLA['tabs'][0]['panels'][0]['config']
ANCHO = 192  # la cuadricula de OpenObserve mide 192 columnas


def panel(pid, tipo, titulo, consulta, *, promql=False, stream='default', stream_type='logs', x=None, y=None,
          leyenda='', unidad=None, desc='', breakdown=None):
    config = copy.deepcopy(CONFIG_BASE)
    config['show_legends'] = tipo in ('line', 'area', 'bar') and bool(promql or breakdown)
    if unidad:
        config['unit'] = unidad
    config['decimals'] = 2
    eje = lambda alias, etiqueta, tiempo=False: {'label': etiqueta, 'alias': alias, 'column': alias, 'color': None,
                                                  'treatAsNonTimestamp': not tiempo, 'showFieldAsJson': False}
    campos = {'stream': stream, 'stream_type': 'metrics' if promql else stream_type,
              'x': [eje(a, e, a.startswith('x_')) for a, e in (x or [])],
              'y': [eje(a, e) for a, e in (y or [])],
              'z': [], 'breakdown': [eje(a, e) for a, e in (breakdown or [])],
              'filter': {'filterType': 'group', 'logicalOperator': 'AND', 'conditions': []}}
    return {
        'id': pid, 'type': tipo, 'title': titulo, 'description': desc, 'config': config,
        'queryType': 'promql' if promql else 'sql',
        'queries': [{'query': consulta, 'vrlFunctionQuery': '', 'customQuery': True, 'fields': campos,
                     'config': {'promql_legend': leyenda, 'layer_type': 'scatter', 'weight_fixed': 1, 'limit': 0,
                                'min': 0, 'max': 100, 'time_shift': [], 'query_label': ''}, 'joins': []}],
        'layout': {}, 'htmlContent': '', 'markdownContent': '', 'customChartContent': '',
    }


def acomodar(paneles):
    """Coloca los paneles en filas; cada elemento es (panel, ancho_en_tercios, alto)."""
    x = y = alto_fila = 0
    salida = []
    for i, (p, tercios, alto) in enumerate(paneles, start=1):
        w = ANCHO * tercios // 3
        if x + w > ANCHO:
            x, y, alto_fila = 0, y + alto_fila, 0
        p['layout'] = {'x': x, 'y': y, 'w': w, 'h': alto, 'i': i}
        x += w
        alto_fila = max(alto_fila, alto)
        salida.append(p)
    return salida


def tablero(ident, titulo, desc, paneles, periodo='30m'):
    return {'version': 8, 'dashboardId': ident, 'title': titulo, 'description': desc, 'role': '', 'owner': '',
            'created': '2026-11-25T00:00:00.000Z',
            'tabs': [{'tabId': 'principal', 'name': 'Principal', 'panels': acomodar(paneles)}],
            'variables': {'list': [], 'showDynamicFilters': False},
            'defaultDatetimeDuration': {'type': 'relative', 'relativeTimePeriod': periodo, 'startTime': 0, 'endTime': 0}}


R = 'service_name="api"'
APP = tablero('aplicacion_endpoints', '1. Aplicación: endpoints (OpenTelemetry)',
    'Latencia, peticiones por segundo y errores HTTP por endpoint de la API desplegada en EC2.', [
    (panel('p1', 'metric', 'Peticiones por segundo (total)', f'sum(rate(app_http_requests_total{{{R}}}[2m]))', promql=True, unidad='default'), 1, 7),
    (panel('p2', 'metric', 'Tasa de error HTTP (%)', f'100 * sum(rate(app_http_errors_total{{{R}}}[5m])) / sum(rate(app_http_requests_total{{{R}}}[5m]))', promql=True, unidad='percent'), 1, 7),
    (panel('p3', 'metric', 'Latencia p95 global (ms)', f'histogram_quantile(0.95, sum by (le) (rate(app_http_request_duration_ms_bucket{{{R}}}[5m])))', promql=True), 1, 7),
    (panel('p4', 'line', 'Peticiones por segundo por endpoint', f'sum by (http_method, http_route) (rate(app_http_requests_total{{{R}}}[2m]))', promql=True, leyenda='{http_method} {http_route}'), 3, 10),
    (panel('p5', 'line', 'Latencia p95 por endpoint (ms)', f'histogram_quantile(0.95, sum by (le, http_route) (rate(app_http_request_duration_ms_bucket{{{R}}}[5m])))', promql=True, leyenda='{http_route}'), 3, 10),
    (panel('p6', 'line', 'Latencia promedio por endpoint (ms)', f'sum by (http_route) (rate(app_http_request_duration_ms_sum{{{R}}}[5m])) / sum by (http_route) (rate(app_http_request_duration_ms_count{{{R}}}[5m]))', promql=True, leyenda='{http_route}'), 3, 10),
    (panel('p7', 'line', 'Errores HTTP por endpoint y código (por segundo)', f'sum by (http_route, http_status_code) (rate(app_http_errors_total{{{R}}}[2m]))', promql=True, leyenda='{http_route} {http_status_code}'), 3, 10),
    (panel('p8', 'bar', 'Peticiones por código de estado (statusCode)',
           'SELECT histogram(_timestamp) AS x_axis_1, CAST(status_code AS VARCHAR) AS breakdown_1, count(*) AS y_axis_1 FROM "default" '
           "WHERE service_name = 'api' AND body = 'peticion http' GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1",
           x=[('x_axis_1', 'Tiempo')], y=[('y_axis_1', 'Peticiones')], breakdown=[('breakdown_1', 'statusCode')]), 3, 10),
    (panel('p9', 'line', 'Duración de consultas a PostgreSQL p95 (s)', 'histogram_quantile(0.95, sum by (le, service_name) (rate(db_client_operation_duration_bucket[5m])))', promql=True, leyenda='{service_name}'), 3, 9),
    (panel('p10', 'table', 'Últimos logs de advertencia y error',
           'SELECT _timestamp AS x_axis_1, service_name AS servicio, severity AS nivel, body AS mensaje, method AS metodo, path AS ruta, status_code AS codigo, duration_ms AS ms, trace_id '
           "FROM \"default\" WHERE severity IN ('WARN', 'ERROR') ORDER BY _timestamp DESC LIMIT 50",
           x=[('x_axis_1', 'Fecha')], y=[]), 3, 12),
])

H = 'host_type="t3.micro"'
SERVIDOR = tablero('servidor_ec2', '2. Servidor EC2: recursos de infraestructura',
    'CPU, memoria RAM, ancho de banda, disco y temperatura de la instancia t3.micro (OpenTelemetry Collector, hostmetrics).', [
    (panel('s1', 'metric', 'CPU usada (%)', '100 - 100 * avg(system_cpu_utilization{state="idle"})', promql=True, unidad='percent'), 1, 7),
    (panel('s2', 'metric', 'RAM usada (%)', '100 * sum(system_memory_utilization{state="used"})', promql=True, unidad='percent'), 1, 7),
    (panel('s3', 'metric', 'Disco / usado (%)', '100 * sum(system_filesystem_utilization{mountpoint="/"})', promql=True, unidad='percent'), 1, 7),
    (panel('s4', 'line', 'Consumo de CPU por estado (%)', '100 * avg by (state) (system_cpu_utilization{state=~"user|system|iowait|steal"})', promql=True, leyenda='{state}'), 3, 10),
    (panel('s5', 'area', 'Memoria RAM (bytes)', 'sum by (state) (system_memory_usage{state=~"used|cached|buffered|free"})', promql=True, leyenda='{state}', unidad='bytes'), 3, 10),
    (panel('s6', 'line', 'Ancho de banda de red ens5 (bytes/s)', 'sum by (direction) (rate(system_network_io{device="ens5"}[2m]))', promql=True, leyenda='{direction}', unidad='bytes'), 3, 10),
    (panel('s7', 'line', 'Carga promedio (1, 5 y 15 min)', 'system_cpu_load_average_1m or system_cpu_load_average_5m or system_cpu_load_average_15m', promql=True, leyenda='{__name__}'), 3, 10),
    (panel('s8', 'line', 'Temperatura de los sensores (°C)',
           'SELECT histogram(_timestamp) AS x_axis_1, sensor AS breakdown_1, avg(celsius) AS y_axis_1 FROM "temperatura_servidor" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1',
           stream='temperatura_servidor', x=[('x_axis_1', 'Tiempo')], y=[('y_axis_1', '°C')], breakdown=[('breakdown_1', 'Sensor')],
           desc='Sensores que expone el kernel (hwmon/thermal_zone). En EC2 el hipervisor Nitro no expone la temperatura de la CPU.'), 2, 10),
    (panel('s9', 'table', 'Última lectura de temperatura',
           'SELECT max(_timestamp) AS x_axis_1, sensor, archivo, last_value(celsius) AS celsius, last_value(valido) AS valido FROM "temperatura_servidor" GROUP BY sensor, archivo',
           stream='temperatura_servidor', x=[('x_axis_1', 'Fecha')], y=[]), 1, 10),
    (panel('s10', 'line', 'Swap usado (bytes)', 'sum(system_paging_usage{state="used"})', promql=True, leyenda='swap', unidad='bytes'), 3, 9),
], periodo='30m')

CICD = tablero('pipeline_cicd', '3. Pipeline CI/CD (GitHub Actions)',
    'Resultado de cada ejecución de pruebas y despliegues en EC2, enviados por el pipeline a la API HTTP/JSON.', [
    (panel('c1', 'metric', 'Ejecuciones de pruebas exitosas', "SELECT count(*) AS y_axis_1 FROM \"cicd_pipeline\" WHERE evento = 'pruebas' AND resultado = 'exito'", stream='cicd_pipeline', y=[('y_axis_1', 'Ejecuciones')]), 1, 7),
    (panel('c2', 'metric', 'Ejecuciones de pruebas fallidas', "SELECT count(*) AS y_axis_1 FROM \"cicd_pipeline\" WHERE evento = 'pruebas' AND resultado = 'fallo'", stream='cicd_pipeline', y=[('y_axis_1', 'Ejecuciones')]), 1, 7),
    (panel('c3', 'metric', 'Despliegues completados en EC2', "SELECT count(*) AS y_axis_1 FROM \"cicd_pipeline\" WHERE evento = 'despliegue' AND resultado = 'exito'", stream='cicd_pipeline', y=[('y_axis_1', 'Despliegues')]), 1, 7),
    (panel('c4', 'bar', 'Eventos del pipeline por resultado',
           'SELECT histogram(_timestamp) AS x_axis_1, evento || \' - \' || resultado AS breakdown_1, count(*) AS y_axis_1 FROM "cicd_pipeline" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1',
           stream='cicd_pipeline', x=[('x_axis_1', 'Tiempo')], y=[('y_axis_1', 'Eventos')], breakdown=[('breakdown_1', 'Evento')]), 3, 9),
    (panel('c5', 'table', 'Historial de ejecuciones y despliegues',
           'SELECT _timestamp AS x_axis_1, evento, resultado, rama, actor, commit_corto AS commit, mensaje_commit AS mensaje, detalle, run_numero AS ejecucion, run_url AS enlace '
           'FROM "cicd_pipeline" ORDER BY _timestamp DESC LIMIT 100',
           stream='cicd_pipeline', x=[('x_axis_1', 'Fecha')], y=[]), 3, 14),
], periodo='7d')

ALERTAS = tablero('alertas_operativas', '4. Alertas operativas',
    'Alertas de OpenObserve disparadas (errores, latencia, pipeline, CPU, RAM y disco). Cada disparo se guarda en el stream alertas_disparadas.', [
    (panel('a1', 'metric', 'Alertas disparadas', 'SELECT count(*) AS y_axis_1 FROM "alertas_disparadas"', stream='alertas_disparadas', y=[('y_axis_1', 'Alertas')]), 1, 7),
    (panel('a2', 'bar', 'Alertas disparadas por tipo',
           'SELECT histogram(_timestamp) AS x_axis_1, alerta AS breakdown_1, count(*) AS y_axis_1 FROM "alertas_disparadas" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1',
           stream='alertas_disparadas', x=[('x_axis_1', 'Tiempo')], y=[('y_axis_1', 'Disparos')], breakdown=[('breakdown_1', 'Alerta')]), 2, 7),
    (panel('a3', 'table', 'Historial de alertas',
           'SELECT _timestamp AS x_axis_1, alerta, stream, tipo_stream, filas, inicio, fin FROM "alertas_disparadas" ORDER BY _timestamp DESC LIMIT 100',
           stream='alertas_disparadas', x=[('x_axis_1', 'Fecha')], y=[]), 3, 12),
], periodo='24h')


def subir(t):
    url = os.environ['OO_URL'].rstrip('/')
    cab = {'Authorization': f"Basic {os.environ['OO_AUTH']}", 'Content-Type': 'application/json'}
    lista = json.load(urllib.request.urlopen(urllib.request.Request(f'{url}/api/default/dashboards', headers=cab)))
    for d in lista.get('dashboards', []):
        v = d.get('v8') or d.get('v5') or d.get('v3') or d.get('v2') or d.get('v1') or d
        if v.get('title') == t['title']:
            ident = v.get('dashboardId') or d.get('dashboard_id')
            urllib.request.urlopen(urllib.request.Request(f'{url}/api/default/dashboards/{ident}', headers=cab, method='DELETE'))
    r = urllib.request.urlopen(urllib.request.Request(f'{url}/api/default/dashboards?folder=default', data=json.dumps(t).encode(), headers=cab, method='POST'))
    print(t['title'], '->', r.status)


if __name__ == '__main__':
    salida = AQUI / 'tableros'
    salida.mkdir(exist_ok=True)
    for t in (APP, SERVIDOR, CICD, ALERTAS):
        (salida / f"{t['dashboardId']}.json").write_text(json.dumps(t, indent=2, ensure_ascii=False))
        if os.environ.get('OO_URL'):
            subir(t)
