const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { firmar, requiereSesion } = require('../auth');
const { log } = require('../observabilidad');

const r = Router();

r.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Correo y contrasena son obligatorios' });
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [String(email).trim().toLowerCase()]);
  const usuario = rows[0];
  if (!usuario || !(await bcrypt.compare(String(password), usuario.password_hash))) {
    log('warn', 'inicio de sesion rechazado', { email });
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  log('info', 'inicio de sesion correcto', { email, usuario_id: usuario.id });
  res.json({ token: firmar(usuario), usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } });
});

r.get('/me', requiereSesion, (req, res) => res.json({ usuario: req.usuario }));

module.exports = r;
