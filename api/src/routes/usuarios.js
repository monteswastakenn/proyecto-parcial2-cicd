const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { validarUsuario } = require('../validacion');
const { registrar } = require('../auditoria');

const r = Router();
const CAMPOS = 'id, nombre, email, rol, creado_en, actualizado_en';
const idValido = (id) => /^\d+$/.test(id);

r.get('/', async (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const { rows } = await pool.query(`SELECT ${CAMPOS} FROM usuarios WHERE nombre ILIKE $1 OR email ILIKE $1 ORDER BY id`, [q]);
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ error: 'Id invalido' });
  const { rows } = await pool.query(`SELECT ${CAMPOS} FROM usuarios WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
});

r.post('/', async (req, res) => {
  const errores = validarUsuario(req.body);
  if (Object.keys(errores).length) return res.status(400).json({ error: 'Datos invalidos', campos: errores });
  const { nombre, email, password, rol = 'usuario' } = req.body;
  const correo = email.trim().toLowerCase();
  const dup = await pool.query('SELECT 1 FROM usuarios WHERE email = $1', [correo]);
  if (dup.rowCount) return res.status(409).json({ error: 'Ya existe un usuario con ese correo', campos: { email: 'Ya existe un usuario con ese correo' } });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING ${CAMPOS}`,
    [nombre.trim(), correo, hash, rol],
  );
  await registrar('crear', 'usuario', rows[0].id, req.usuario.email, { email: correo });
  res.status(201).json(rows[0]);
});

r.put('/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ error: 'Id invalido' });
  const datos = { ...req.body };
  if (datos.password === '') delete datos.password; // contrasena vacia = no cambiarla
  const errores = validarUsuario(datos, { parcial: true });
  if (Object.keys(errores).length) return res.status(400).json({ error: 'Datos invalidos', campos: errores });
  const actual = await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
  if (!actual.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
  const correo = datos.email !== undefined ? datos.email.trim().toLowerCase() : actual.rows[0].email;
  const dup = await pool.query('SELECT 1 FROM usuarios WHERE email = $1 AND id <> $2', [correo, req.params.id]);
  if (dup.rowCount) return res.status(409).json({ error: 'Ya existe un usuario con ese correo', campos: { email: 'Ya existe un usuario con ese correo' } });
  const hash = datos.password ? await bcrypt.hash(datos.password, 10) : actual.rows[0].password_hash;
  const { rows } = await pool.query(
    `UPDATE usuarios SET nombre = $1, email = $2, rol = $3, password_hash = $4, actualizado_en = now() WHERE id = $5 RETURNING ${CAMPOS}`,
    [datos.nombre !== undefined ? datos.nombre.trim() : actual.rows[0].nombre, correo, datos.rol || actual.rows[0].rol, hash, req.params.id],
  );
  await registrar('editar', 'usuario', rows[0].id, req.usuario.email);
  res.json(rows[0]);
});

r.delete('/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ error: 'Id invalido' });
  if (Number(req.params.id) === req.usuario.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  const { rowCount } = await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
  await registrar('eliminar', 'usuario', Number(req.params.id), req.usuario.email);
  res.status(204).end();
});

module.exports = r;
