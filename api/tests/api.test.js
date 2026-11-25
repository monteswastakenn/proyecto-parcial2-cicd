// Pruebas de integracion de la API con Supertest contra una base de datos PostgreSQL real.
process.env.NODE_ENV = 'test';
process.env.AUDITORIA_URL = process.env.AUDITORIA_URL || 'http://localhost:4999'; // la auditoria es opcional
const request = require('supertest');
const app = require('../src/app');
const { pool, inicializar } = require('../src/db');

const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@proyecto.com', password: process.env.ADMIN_PASSWORD || 'Admin123!' };
const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await inicializar();
  const r = await request(app).post('/api/auth/login').send(ADMIN);
  token = r.body.token;
});

afterAll(async () => {
  await pool.query("DELETE FROM usuarios WHERE email LIKE 'jest-%'");
  await pool.query("DELETE FROM productos WHERE sku LIKE 'JEST-%'");
  await pool.end();
});

describe('salud', () => {
  test('GET /api/health responde ok con la base de datos', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'ok', bd: 'ok' });
  });

  test('una ruta inexistente responde 404 en JSON', async () => {
    const r = await request(app).get('/api/no-existe');
    expect(r.status).toBe(404);
    expect(r.body.error).toBeDefined();
  });

  test('JSON mal formado responde 400', async () => {
    const r = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{malo');
    expect(r.status).toBe(400);
  });
});

describe('autenticacion', () => {
  test('credenciales correctas devuelven token y usuario', async () => {
    const r = await request(app).post('/api/auth/login').send(ADMIN);
    expect(r.status).toBe(200);
    expect(r.body.token).toEqual(expect.any(String));
    expect(r.body.usuario).toMatchObject({ email: ADMIN.email, rol: 'admin' });
    expect(r.body.usuario.password_hash).toBeUndefined();
  });

  test('contrasena incorrecta responde 401', async () => {
    const r = await request(app).post('/api/auth/login').send({ ...ADMIN, password: 'incorrecta' });
    expect(r.status).toBe(401);
  });

  test('correo inexistente responde 401', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: 'nadie@x.com', password: 'loquesea' });
    expect(r.status).toBe(401);
  });

  test('sin datos responde 400', async () => {
    const r = await request(app).post('/api/auth/login').send({});
    expect(r.status).toBe(400);
  });

  test('/me devuelve al usuario del token', async () => {
    const r = await request(app).get('/api/auth/me').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.usuario.email).toBe(ADMIN.email);
  });

  test.each(['/api/usuarios', '/api/productos', '/api/auth/me'])('%s sin token responde 401', async (ruta) => {
    expect((await request(app).get(ruta)).status).toBe(401);
  });

  test('un token alterado responde 401', async () => {
    const r = await request(app).get('/api/usuarios').set({ Authorization: `Bearer ${token}x` });
    expect(r.status).toBe(401);
  });
});

describe('CRUD de usuarios', () => {
  const email = `jest-${sufijo}@correo.com`;
  let id;

  test('crea un usuario (201) sin devolver la contrasena', async () => {
    const r = await request(app).post('/api/usuarios').set(auth()).send({ nombre: 'Jest Usuario', email, password: 'secreta1' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ nombre: 'Jest Usuario', email, rol: 'usuario' });
    expect(r.body.password_hash).toBeUndefined();
    id = r.body.id;
  });

  test('el usuario nuevo puede iniciar sesion', async () => {
    const r = await request(app).post('/api/auth/login').send({ email, password: 'secreta1' });
    expect(r.status).toBe(200);
  });

  test('un correo repetido responde 409', async () => {
    const r = await request(app).post('/api/usuarios').set(auth()).send({ nombre: 'Otro', email, password: 'secreta1' });
    expect(r.status).toBe(409);
  });

  test('datos invalidos responden 400 con el detalle por campo', async () => {
    const r = await request(app).post('/api/usuarios').set(auth()).send({ nombre: 'A', email: 'malo', password: '1' });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.campos).sort()).toEqual(['email', 'nombre', 'password']);
  });

  test('lista y busca usuarios', async () => {
    const r = await request(app).get(`/api/usuarios?q=jest-${sufijo}`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.map((u) => u.id)).toEqual([id]);
  });

  test('obtiene un usuario por id', async () => {
    const r = await request(app).get(`/api/usuarios/${id}`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.email).toBe(email);
  });

  test('edita el nombre y el rol', async () => {
    const r = await request(app).put(`/api/usuarios/${id}`).set(auth()).send({ nombre: 'Jest Editado', rol: 'admin' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nombre: 'Jest Editado', rol: 'admin' });
  });

  test('editar con contrasena vacia conserva la anterior', async () => {
    await request(app).put(`/api/usuarios/${id}`).set(auth()).send({ password: '' });
    const r = await request(app).post('/api/auth/login').send({ email, password: 'secreta1' });
    expect(r.status).toBe(200);
  });

  test('editar con el correo de otro usuario responde 409', async () => {
    const r = await request(app).put(`/api/usuarios/${id}`).set(auth()).send({ email: ADMIN.email });
    expect(r.status).toBe(409);
  });

  test('el administrador no puede eliminarse a si mismo', async () => {
    const yo = await request(app).get('/api/auth/me').set(auth());
    const r = await request(app).delete(`/api/usuarios/${yo.body.usuario.id}`).set(auth());
    expect(r.status).toBe(400);
  });

  test('elimina el usuario (204) y despues ya no existe (404)', async () => {
    expect((await request(app).delete(`/api/usuarios/${id}`).set(auth())).status).toBe(204);
    expect((await request(app).get(`/api/usuarios/${id}`).set(auth())).status).toBe(404);
  });

  test('un id no numerico responde 400', async () => {
    expect((await request(app).get('/api/usuarios/abc').set(auth())).status).toBe(400);
  });
});

describe('CRUD de productos', () => {
  const sku = `JEST-${sufijo}`;
  let id;

  test('crea un producto (201) con el SKU en mayusculas', async () => {
    const r = await request(app).post('/api/productos').set(auth()).send({ sku: sku.toLowerCase(), nombre: 'Teclado', descripcion: 'Mecanico', precio: 899.9, stock: 10 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ sku, nombre: 'Teclado', precio: 899.9, stock: 10 });
    id = r.body.id;
  });

  test('un SKU repetido responde 409', async () => {
    const r = await request(app).post('/api/productos').set(auth()).send({ sku, nombre: 'Otro', precio: 1, stock: 1 });
    expect(r.status).toBe(409);
  });

  test('precio negativo y stock decimal responden 400', async () => {
    const r = await request(app).post('/api/productos').set(auth()).send({ sku: 'JEST-X1', nombre: 'Malo', precio: -5, stock: 1.5 });
    expect(r.status).toBe(400);
    expect(r.body.campos).toHaveProperty('precio');
    expect(r.body.campos).toHaveProperty('stock');
  });

  test('busca por SKU', async () => {
    const r = await request(app).get(`/api/productos?q=${sku}`).set(auth());
    expect(r.body.map((p) => p.id)).toEqual([id]);
  });

  test('edita precio y stock', async () => {
    const r = await request(app).put(`/api/productos/${id}`).set(auth()).send({ precio: 750, stock: 4 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ precio: 750, stock: 4, nombre: 'Teclado' });
  });

  test('editar un producto inexistente responde 404', async () => {
    expect((await request(app).put('/api/productos/999999').set(auth()).send({ stock: 1 })).status).toBe(404);
  });

  test('elimina el producto y despues responde 404', async () => {
    expect((await request(app).delete(`/api/productos/${id}`).set(auth())).status).toBe(204);
    expect((await request(app).delete(`/api/productos/${id}`).set(auth())).status).toBe(404);
  });
});
