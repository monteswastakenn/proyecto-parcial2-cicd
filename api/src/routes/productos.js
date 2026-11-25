const { Router } = require('express');
const { pool } = require('../db');
const { validarProducto } = require('../validacion');
const { registrar } = require('../auditoria');

const r = Router();
const CAMPOS = 'id, sku, nombre, descripcion, precio::float AS precio, stock, creado_en, actualizado_en';
const idValido = (id) => /^\d+$/.test(id);

r.get('/', async (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const { rows } = await pool.query(`SELECT ${CAMPOS} FROM productos WHERE nombre ILIKE $1 OR sku ILIKE $1 ORDER BY id`, [q]);
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ error: 'Id invalido' });
  const { rows } = await pool.query(`SELECT ${CAMPOS} FROM productos WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(rows[0]);
});

r.post('/', async (req, res) => {
  const errores = validarProducto(req.body);
  if (Object.keys(errores).length) return res.status(400).json({ error: 'Datos invalidos', campos: errores });
  const { sku, nombre, descripcion = '', precio, stock } = req.body;
  const clave = sku.trim().toUpperCase();
  const dup = await pool.query('SELECT 1 FROM productos WHERE sku = $1', [clave]);
  if (dup.rowCount) return res.status(409).json({ error: 'Ya existe un producto con ese SKU', campos: { sku: 'Ya existe un producto con ese SKU' } });
  const { rows } = await pool.query(
    `INSERT INTO productos (sku, nombre, descripcion, precio, stock) VALUES ($1, $2, $3, $4, $5) RETURNING ${CAMPOS}`,
    [clave, nombre.trim(), descripcion.trim(), Number(precio), Number(stock)],
  );
  await registrar('crear', 'producto', rows[0].id, req.usuario.email, { sku: clave });
  res.status(201).json(rows[0]);
});

r.put('/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ error: 'Id invalido' });
  const errores = validarProducto(req.body, { parcial: true });
  if (Object.keys(errores).length) return res.status(400).json({ error: 'Datos invalidos', campos: errores });
  const actual = await pool.query('SELECT * FROM productos WHERE id = $1', [req.params.id]);
  if (!actual.rowCount) return res.status(404).json({ error: 'Producto no encontrado' });
  const a = actual.rows[0];
  const d = req.body;
  const clave = d.sku !== undefined ? d.sku.trim().toUpperCase() : a.sku;
  const dup = await pool.query('SELECT 1 FROM productos WHERE sku = $1 AND id <> $2', [clave, req.params.id]);
  if (dup.rowCount) return res.status(409).json({ error: 'Ya existe un producto con ese SKU', campos: { sku: 'Ya existe un producto con ese SKU' } });
  const { rows } = await pool.query(
    `UPDATE productos SET sku = $1, nombre = $2, descripcion = $3, precio = $4, stock = $5, actualizado_en = now() WHERE id = $6 RETURNING ${CAMPOS}`,
    [
      clave,
      d.nombre !== undefined ? d.nombre.trim() : a.nombre,
      d.descripcion !== undefined ? d.descripcion.trim() : a.descripcion,
      d.precio !== undefined ? Number(d.precio) : a.precio,
      d.stock !== undefined ? Number(d.stock) : a.stock,
      req.params.id,
    ],
  );
  await registrar('editar', 'producto', rows[0].id, req.usuario.email);
  res.json(rows[0]);
});

r.delete('/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ error: 'Id invalido' });
  const { rowCount } = await pool.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Producto no encontrado' });
  await registrar('eliminar', 'producto', Number(req.params.id), req.usuario.email);
  res.status(204).end();
});

module.exports = r;
