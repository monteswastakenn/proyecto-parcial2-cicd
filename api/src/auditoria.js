// Cliente del microservicio de auditoria: la llamada HTTP propaga el contexto de la traza.
const { log } = require('./observabilidad');
const URL_AUDITORIA = process.env.AUDITORIA_URL || 'http://auditoria:4000';

async function registrar(accion, entidad, entidadId, usuario, detalle = {}) {
  try {
    const r = await fetch(`${URL_AUDITORIA}/eventos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion, entidad, entidadId, usuario, detalle }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw new Error(`auditoria respondio ${r.status}`);
  } catch (e) {
    log('warn', 'no se pudo registrar la auditoria', { accion, entidad, error: e.message });
  }
}

module.exports = { registrar };
