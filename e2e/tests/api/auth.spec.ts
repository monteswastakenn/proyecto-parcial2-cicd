import { test, expect } from '@playwright/test';
import { ADMIN, tokenAdmin } from '../apoyo';

test.describe('API - salud y autenticacion', () => {
  test('GET /api/health responde ok', async ({ request }) => {
    const r = await request.get('/api/health');
    expect(r.status()).toBe(200);
    expect(await r.json()).toMatchObject({ estado: 'ok', bd: 'ok' });
  });

  test('login correcto devuelve un token JWT', async ({ request }) => {
    const r = await request.post('/api/auth/login', { data: ADMIN });
    expect(r.status()).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.token.split('.')).toHaveLength(3);
    expect(cuerpo.usuario.rol).toBe('admin');
  });

  test('login con contrasena incorrecta responde 401', async ({ request }) => {
    const r = await request.post('/api/auth/login', { data: { ...ADMIN, password: 'mala' } });
    expect(r.status()).toBe(401);
  });

  test('login sin datos responde 400', async ({ request }) => {
    expect((await request.post('/api/auth/login', { data: {} })).status()).toBe(400);
  });

  for (const ruta of ['/api/usuarios', '/api/productos']) {
    test(`${ruta} sin token responde 401`, async ({ request }) => {
      expect((await request.get(ruta)).status()).toBe(401);
    });
  }

  test('/api/auth/me identifica al usuario del token', async ({ request }) => {
    const token = await tokenAdmin(request);
    const r = await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    expect((await r.json()).usuario.email).toBe(ADMIN.email);
  });

  test('una ruta de API inexistente responde 404', async ({ request }) => {
    expect((await request.get('/api/inexistente')).status()).toBe(404);
  });
});
