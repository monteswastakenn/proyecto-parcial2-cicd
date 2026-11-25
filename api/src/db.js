const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { log } = require('./observabilidad');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://app:app@localhost:5432/app',
  max: 10,
});

/** Crea las tablas (si no existen) y el usuario administrador inicial. */
async function inicializar() {
  const esquema = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8');
  await pool.query(esquema);
  const email = process.env.ADMIN_EMAIL || 'admin@proyecto.com';
  const existe = await pool.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
  if (!existe.rowCount) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin123!', 10);
    await pool.query("INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ('Administrador', $1, $2, 'admin')", [email, hash]);
    log('info', 'usuario administrador creado', { email });
  }
}

module.exports = { pool, inicializar };
