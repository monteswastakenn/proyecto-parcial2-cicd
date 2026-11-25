const express = require('express');
const { pool } = require('./db');
const { requiereSesion } = require('./auth');
const { log, medirPeticiones } = require('./observabilidad');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(medirPeticiones);

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', version: process.env.APP_VERSION || 'dev', bd: 'ok' });
  } catch (e) {
    res.status(503).json({ estado: 'error', bd: e.message });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', requiereSesion, require('./routes/usuarios'));
app.use('/api/productos', requiereSesion, require('./routes/productos'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// JSON mal formado y errores no controlados
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalido' });
  log('error', 'excepcion no controlada', { error: err.message, stack: err.stack, path: req.originalUrl });
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
