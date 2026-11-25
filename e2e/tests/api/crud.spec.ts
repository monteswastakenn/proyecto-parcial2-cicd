import { test, expect } from '@playwright/test';
import { tokenAdmin, unico } from '../apoyo';

let headers: Record<string, string>;
test.beforeAll(async ({ request }) => {
  headers = { Authorization: `Bearer ${await tokenAdmin(request)}` };
});

test.describe('API - CRUD de usuarios', () => {
  test('ciclo completo: crear, leer, editar y borrar', async ({ request }) => {
    const email = `${unico('pw-')}@correo.com`;
    const creado = await request.post('/api/usuarios', { headers, data: { nombre: 'Playwright API', email, password: 'secreta1' } });
    expect(creado.status()).toBe(201);
    const { id } = await creado.json();

    const leido = await request.get(`/api/usuarios/${id}`, { headers });
    expect(await leido.json()).toMatchObject({ id, email, rol: 'usuario' });

    const editado = await request.put(`/api/usuarios/${id}`, { headers, data: { nombre: 'Playwright Editado' } });
    expect((await editado.json()).nombre).toBe('Playwright Editado');

    expect((await request.delete(`/api/usuarios/${id}`, { headers })).status()).toBe(204);
    expect((await request.get(`/api/usuarios/${id}`, { headers })).status()).toBe(404);
  });

  test('correo duplicado responde 409', async ({ request }) => {
    const email = `${unico('pw-')}@correo.com`;
    const a = await request.post('/api/usuarios', { headers, data: { nombre: 'Uno', email, password: 'secreta1' } });
    const b = await request.post('/api/usuarios', { headers, data: { nombre: 'Dos', email, password: 'secreta1' } });
    expect(b.status()).toBe(409);
    await request.delete(`/api/usuarios/${(await a.json()).id}`, { headers });
  });

  test('datos invalidos responden 400 con errores por campo', async ({ request }) => {
    const r = await request.post('/api/usuarios', { headers, data: { nombre: '', email: 'x', password: '1' } });
    expect(r.status()).toBe(400);
    expect(Object.keys((await r.json()).campos)).toEqual(expect.arrayContaining(['nombre', 'email', 'password']));
  });
});

test.describe('API - CRUD de productos', () => {
  test('ciclo completo: crear, buscar, editar y borrar', async ({ request }) => {
    const sku = unico('PW-').toUpperCase();
    const creado = await request.post('/api/productos', { headers, data: { sku, nombre: 'Mouse', precio: 250.5, stock: 8 } });
    expect(creado.status()).toBe(201);
    const { id } = await creado.json();

    const lista = await (await request.get(`/api/productos?q=${sku}`, { headers })).json();
    expect(lista).toHaveLength(1);

    const editado = await request.put(`/api/productos/${id}`, { headers, data: { stock: 2, precio: 199 } });
    expect(await editado.json()).toMatchObject({ stock: 2, precio: 199 });

    expect((await request.delete(`/api/productos/${id}`, { headers })).status()).toBe(204);
  });

  test('SKU duplicado responde 409', async ({ request }) => {
    const sku = unico('PW-').toUpperCase();
    const a = await request.post('/api/productos', { headers, data: { sku, nombre: 'Prod A', precio: 1, stock: 1 } });
    const b = await request.post('/api/productos', { headers, data: { sku, nombre: 'Prod B', precio: 1, stock: 1 } });
    expect(b.status()).toBe(409);
    await request.delete(`/api/productos/${(await a.json()).id}`, { headers });
  });

  test('precio negativo responde 400', async ({ request }) => {
    const r = await request.post('/api/productos', { headers, data: { sku: 'PW-NEG', nombre: 'Malo', precio: -1, stock: 1 } });
    expect(r.status()).toBe(400);
  });

  test('borrar un producto inexistente responde 404', async ({ request }) => {
    expect((await request.delete('/api/productos/99999999', { headers })).status()).toBe(404);
  });
});
