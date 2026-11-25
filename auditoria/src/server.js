// Microservicio de auditoria: recibe eventos de la API y los guarda en PostgreSQL.
// Sus spans aparecen dentro de la misma traza que la peticion original (propagacion W3C).
const express = require('express');
const { Pool } = require('pg');
const { log, medirPeticiones } = require('./observabilidad');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://app:app@localhost:5432/app', max: 5 });
const app = express();
app.use(express.json());
app.use(medirPeticiones);

app.get('/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ estado: 'ok' });
});

app.post('/eventos', async (req, res) => {
  const { accion, entidad, entidadId, usuario, detalle } = req.body || {};
  if (!accion || !entidad) return res.status(400).json({ error: 'accion y entidad son obligatorias' });
  const { rows } = await pool.query(
    'INSERT INTO auditoria (accion, entidad, entidad_id, usuario, detalle) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [accion, entidad, entidadId ?? null, usuario ?? null, detalle ?? {}],
  );
  log('info', 'evento de auditoria registrado', { accion, entidad, entidad_id: entidadId, usuario });
  res.status(201).json({ id: rows[0].id });
});

app.get('/eventos', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM auditoria ORDER BY id DESC LIMIT 100');
  res.json(rows);
});

app.use((err, req, res, next) => {
  log('error', 'excepcion no controlada', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Error interno' });
});

const PUERTO = Number(process.env.PORT || 4000);
app.listen(PUERTO, () => log('info', 'auditoria iniciada', { puerto: PUERTO }));
