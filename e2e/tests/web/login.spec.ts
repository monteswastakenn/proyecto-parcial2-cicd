import { test, expect } from '@playwright/test';
import { ADMIN, entrar } from '../apoyo';

test.describe('Login (frontend)', () => {
  test.beforeEach(async ({ page }) => page.goto('/'));

  test('muestra el formulario de inicio de sesion', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sistema de Inventario' })).toBeVisible();
    await expect(page.getByLabel('Correo')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toHaveAttribute('type', 'password');
    await expect(page).toHaveURL(/#\/login/);
  });

  test('sin datos marca los dos campos como obligatorios', async ({ page }) => {
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('[data-error=email]')).toHaveText('El correo es obligatorio');
    await expect(page.locator('[data-error=password]')).toHaveText('La contraseña es obligatoria');
  });

  test('credenciales incorrectas muestran un aviso', async ({ page }) => {
    await page.getByLabel('Correo').fill(ADMIN.email);
    await page.getByLabel('Contraseña').fill('incorrecta');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Credenciales incorrectas');
  });

  test('credenciales correctas abren el panel de usuarios', async ({ page }) => {
    await entrar(page);
    await expect(page).toHaveURL(/#\/usuarios/);
    await expect(page.locator('#usuario-actual')).toHaveText('Administrador');
  });

  test('Enter en la contrasena envia el formulario', async ({ page }) => {
    await page.getByLabel('Correo').fill(ADMIN.email);
    await page.getByLabel('Contraseña').fill(ADMIN.password);
    await page.getByLabel('Contraseña').press('Enter');
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  });

  test('la sesion se conserva al recargar la pagina', async ({ page }) => {
    await entrar(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  });

  test('cerrar sesion regresa al login y protege las rutas', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await page.goto('/#/productos');
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('un token invalido manda de vuelta al login', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('token', 'token.falso.123');
      localStorage.setItem('usuario', JSON.stringify({ nombre: 'Falso' }));
    });
    await page.goto('/#/usuarios');
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });
});
