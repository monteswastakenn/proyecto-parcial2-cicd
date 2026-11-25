import { APIRequestContext, Page, expect } from '@playwright/test';

export const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@proyecto.com',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
};

/** Sufijo unico para que las pruebas en paralelo no choquen entre si. */
export const unico = (prefijo = '') => `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function tokenAdmin(request: APIRequestContext) {
  const r = await request.post('/api/auth/login', { data: ADMIN });
  expect(r.status()).toBe(200);
  return (await r.json()).token as string;
}

/** Inicia sesion por la interfaz. */
export async function entrar(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto('/');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
}

/** Fila de la tabla que contiene el texto indicado. */
export const fila = (page: Page, texto: string) => page.locator('#tabla-cuerpo tr', { hasText: texto });

/** Llena el formulario modal a partir de un objeto { etiqueta: valor }. */
export async function llenarFormulario(page: Page, datos: Record<string, string>) {
  const modal = page.locator('#modal-form');
  for (const [etiqueta, valor] of Object.entries(datos)) {
    const campo = modal.getByLabel(etiqueta, { exact: true });
    if ((await campo.evaluate((el) => el.tagName)) === 'SELECT') await campo.selectOption(valor);
    else await campo.fill(valor);
  }
}
