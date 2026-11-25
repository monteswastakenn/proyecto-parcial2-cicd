// Logs estructurados y metricas HTTP propias (latencia, volumen y errores por endpoint).
// Desde @opentelemetry/api 1.10 la API de logs vive en el paquete principal
const { metrics, trace, logs } = require('@opentelemetry/api');

const servicio = process.env.OTEL_SERVICE_NAME || 'api';
const otelLogger = logs.getLogger(servicio);
const meter = metrics.getMeter(servicio);

// Numeros de severidad del modelo de logs de OpenTelemetry
const severidades = { debug: 5, info: 9, warn: 13, error: 17 };

/** Log estructurado: sale por consola (JSON) y por OTLP hacia OpenObserve. */
function log(nivel, mensaje, atributos = {}) {
  const span = trace.getActiveSpan();
  const ctx = span ? span.spanContext() : undefined;
  const registro = { timestamp: new Date().toISOString(), level: nivel, service: servicio, message: mensaje, ...atributos };
  if (ctx) Object.assign(registro, { trace_id: ctx.traceId, span_id: ctx.spanId });
  if (process.env.NODE_ENV !== 'test') console.log(JSON.stringify(registro));
  otelLogger.emit({
    severityNumber: severidades[nivel] || 9,
    severityText: nivel.toUpperCase(),
    body: mensaje,
    attributes: atributos,
  });
}

const peticiones = meter.createCounter('app_http_requests_total', { description: 'Peticiones HTTP recibidas por endpoint' });
const errores = meter.createCounter('app_http_errors_total', { description: 'Respuestas HTTP con codigo >= 400 por endpoint' });
const latencia = meter.createHistogram('app_http_request_duration_ms', {
  description: 'Tiempo de respuesta por endpoint',
  unit: 'ms',
  advice: { explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] },
});

/** Middleware de Express que mide cada peticion y la registra. */
function medirPeticiones(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const ruta = req.route ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'sin_ruta';
    const atributos = { 'http.method': req.method, 'http.route': ruta, 'http.status_code': res.statusCode };
    peticiones.add(1, atributos);
    latencia.record(ms, atributos);
    if (res.statusCode >= 400) errores.add(1, { ...atributos, 'error.type': res.statusCode >= 500 ? 'servidor' : 'cliente' });
    log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'peticion http', {
      method: req.method,
      route: ruta,
      path: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: Math.round(ms * 100) / 100,
    });
  });
  next();
}

module.exports = { log, medirPeticiones };
