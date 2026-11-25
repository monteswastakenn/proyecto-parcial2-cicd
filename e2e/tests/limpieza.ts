// globalTeardown: borra los usuarios y productos que crearon las pruebas (prefijos ui-/pw- y UI-/PW-)
// para que el sistema desplegado no acumule datos de prueba.
import { request } from '@playwright/test';
import { ADMIN } from './apoyo';

export default async function limpieza() {
  const api = await request.newContext({ baseURL: process.env.BASE_URL || 'http://localhost' });
  try {
    const login = await api.post('/api/auth/login', { data: ADMIN });
    if (!login.ok()) return;
    const headers = { Authorization: `Bearer ${(await login.json()).token}` };
    const usuarios = await (await api.get('/api/usuarios', { headers })).json();
    for (const u of usuarios.filter((u: { email: string }) => /^(ui|pw)-/.test(u.email))) await api.delete(`/api/usuarios/${u.id}`, { headers });
    const productos = await (await api.get('/api/productos', { headers })).json();
    for (const p of productos.filter((p: { sku: string }) => /^(UI|PW)-/.test(p.sku))) await api.delete(`/api/productos/${p.id}`, { headers });
  } finally {
    await api.dispose();
  }
}
