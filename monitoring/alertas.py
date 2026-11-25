#!/usr/bin/env python3
"""Crea en OpenObserve la plantilla, el destino y las alertas operativas del proyecto.

Las alertas disparadas se envian al propio OpenObserve (stream "alertas_disparadas"),
de modo que aparecen en el tablero sin depender de un servicio externo.
Uso: OO_URL=... OO_AUTH=... python3 monitoring/alertas.py
"""
import json, os, urllib.error, urllib.request

URL = os.environ['OO_URL'].rstrip('/')
AUTH = os.environ['OO_AUTH']
CAB = {'Authorization': f'Basic {AUTH}', 'Content-Type': 'application/json'}


def api(metodo, ruta, cuerpo=None):
    req = urllib.request.Request(f'{URL}{ruta}', data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                 headers=CAB, method=metodo)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


PLANTILLA = 'plantilla_alerta_proyecto'
DESTINO = 'destino_tablero_alertas'
api('POST', '/api/default/alerts/templates', {
    'name': PLANTILLA, 'type': 'http', 'title': '',
    'body': json.dumps({'alerta': '{alert_name}', 'stream': '{stream_name}', 'tipo_stream': '{stream_type}',
                        'filas': '{alert_count}', 'inicio': '{alert_start_time}', 'fin': '{alert_end_time}',
                        'enlace': '{alert_url}'}),
})
destino = {'name': DESTINO, 'url': f'{URL}/api/default/alertas_disparadas/_json', 'method': 'post',
           'template': PLANTILLA, 'type': 'http', 'headers': {'Authorization': f'Basic {AUTH}'}}
print('destino', api('POST', '/api/default/alerts/destinations', destino)[0], api('PUT', f'/api/default/alerts/destinations/{DESTINO}', destino)[0])


def alerta(nombre, descripcion, stream, stream_type, *, sql=None, promql=None, umbral=None, periodo=5, frecuencia=1):
    qc = {'type': 'promql' if promql else 'sql',
          'conditions': {'version': 2, 'conditions': {'filterType': 'group', 'logicalOperator': 'AND', 'conditions': []}},
          'sql': sql, 'promql': promql, 'aggregation': None, 'vrl_function': None, 'search_event_type': None,
          'multi_time_range': [],
          'promql_condition': {'column': 'value', 'operator': '>=', 'value': umbral} if promql else None}
    return {'name': nombre, 'description': descripcion, 'stream_type': stream_type, 'stream_name': stream,
            'is_real_time': False, 'query_condition': qc,
            'trigger_condition': {'period': periodo, 'operator': '>=', 'threshold': 1, 'frequency': frecuencia, 'cron': '',
                                  'frequency_type': 'minutes', 'silence': 10, 'timezone': 'UTC', 'align_time': True},
            'destinations': [DESTINO], 'context_attributes': {}, 'row_template': '', 'enabled': True}


ALERTAS = [
    alerta('api_errores_5xx', 'La API respondio con errores 5xx en los ultimos 5 minutos', 'default', 'logs',
           sql="SELECT count(*) AS errores FROM \"default\" WHERE service_name = 'api' AND status_code >= 500 HAVING count(*) >= 1"),
    alerta('api_tasa_error_alta', 'Mas del 20% de las peticiones a la API fallaron (4xx/5xx) en 5 minutos', 'default', 'logs',
           sql="SELECT count(*) AS total, sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errores FROM \"default\" "
               "WHERE service_name = 'api' AND body = 'peticion http' HAVING count(*) >= 10 AND sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100 / count(*) > 20"),
    alerta('api_latencia_alta', 'La latencia promedio de un endpoint supero 500 ms en 5 minutos', 'default', 'logs',
           sql="SELECT route, avg(duration_ms) AS latencia_ms FROM \"default\" WHERE service_name = 'api' AND body = 'peticion http' GROUP BY route HAVING avg(duration_ms) > 500"),
    alerta('pipeline_fallido', 'Una ejecucion del pipeline CI/CD fallo y el despliegue quedo bloqueado', 'cicd_pipeline', 'logs',
           sql="SELECT evento, resultado, commit_corto, rama, actor FROM \"cicd_pipeline\" WHERE resultado = 'fallo'", periodo=10),
    alerta('ec2_cpu_alta', 'Uso de CPU de la instancia EC2 mayor o igual a 80%', 'system_cpu_utilization', 'metrics',
           promql='100 - 100 * avg(system_cpu_utilization{state="idle"})', umbral=80),
    alerta('ec2_ram_alta', 'Uso de memoria RAM de la instancia EC2 mayor o igual a 90%', 'system_memory_utilization', 'metrics',
           promql='100 * sum(system_memory_utilization{state="used"})', umbral=90),
    alerta('ec2_disco_lleno', 'El disco raiz de la instancia EC2 supera el 90%', 'system_filesystem_utilization', 'metrics',
           promql='100 * sum(system_filesystem_utilization{mountpoint="/"})', umbral=90),
]

existentes = api('GET', '/api/v2/default/alerts')[1]
por_nombre = {a['name']: a.get('alert_id') or a.get('id') for a in (existentes.get('list', []) if isinstance(existentes, dict) else [])}
for a in ALERTAS:
    if a['name'] in por_nombre:
        print(a['name'], 'actualizar', api('PUT', f"/api/v2/default/alerts/{por_nombre[a['name']]}", a))
    else:
        print(a['name'], 'crear', api('POST', '/api/v2/default/alerts?folder=default', a))
