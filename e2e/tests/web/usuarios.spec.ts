import { test, expect } from '@playwright/test';
import { entrar, fila, llenarFormulario, unico } from '../apoyo';

test.describe('CRUD de usuarios (frontend)', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page);
    await page.getByRole('link', { name: 'Usuarios' }).click();
  });

  test('la tabla lista al administrador con sus columnas', async ({ page }) => {
    await expect(page.locator('#tabla-encabezado th')).toHaveText(['Id', 'Nombre', 'Correo', 'Rol', 'Acciones']);
    await expect(fila(page, 'admin@proyecto.com')).toBeVisible();
    await expect(page.locator('#contador')).toContainText('registro(s)');
  });

  test('crear un usuario lo agrega a la tabla', async ({ page }, testInfo) => {
    const email = `${unico('ui-')}@correo.com`;
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo usuario' })).toBeVisible();
    await llenarFormulario(page, { Nombre: 'Usuario UI', Correo: email, 'Contraseña': 'secreta1', Rol: 'usuario' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#toast')).toHaveText('Usuario creado correctamente');
    await expect(fila(page, email)).toContainText('Usuario UI');
    await testInfo.attach('usuario-creado', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('el formulario vacio marca los campos obligatorios', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#modal-form [data-error=nombre]')).not.toBeEmpty();
    await expect(page.locator('#modal-form [data-error=email]')).toHaveText('El correo no es válido');
    await expect(page.locator('#modal-form [data-error=password]')).not.toBeEmpty();
    await expect(page.locator('#modal-form')).toBeVisible();
  });

  test('un correo repetido muestra el error del servidor', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await llenarFormulario(page, { Nombre: 'Repetido', Correo: 'admin@proyecto.com', 'Contraseña': 'secreta1' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#form-error')).toHaveText('Ya existe un usuario con ese correo');
  });

  test('Cancelar cierra el formulario sin guardar', async ({ page }) => {
    const nombre = unico('No se guarda ');
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await llenarFormulario(page, { Nombre: nombre });
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#modal-form')).toBeHidden();
    await page.reload();
    await expect(fila(page, 'admin@proyecto.com')).toBeVisible();
    await expect(fila(page, nombre)).toHaveCount(0);
  });

  test('editar un usuario actualiza la tabla', async ({ page }) => {
    const email = `${unico('ui-')}@correo.com`;
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await llenarFormulario(page, { Nombre: 'Por Editar', Correo: email, 'Contraseña': 'secreta1' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await fila(page, email).getByRole('button', { name: 'Editar' }).click();
    await expect(page.getByRole('heading', { name: 'Editar usuario' })).toBeVisible();
    await expect(page.locator('#modal-form').getByLabel('Correo', { exact: true })).toHaveValue(email);
    await llenarFormulario(page, { Nombre: 'Ya Editado', Rol: 'admin' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#toast')).toHaveText('Usuario actualizado correctamente');
    await expect(fila(page, email)).toContainText('Ya Editado');
    await expect(fila(page, email).locator('[data-col=rol]')).toHaveText('admin');
  });

  test('eliminar pide confirmacion y quita la fila', async ({ page }) => {
    const email = `${unico('ui-')}@correo.com`;
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await llenarFormulario(page, { Nombre: 'Por Borrar', Correo: email, 'Contraseña': 'secreta1' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await fila(page, email).getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.locator('#confirmar-texto')).toContainText('Por Borrar');
    await page.locator('#modal-confirmar').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.locator('#toast')).toHaveText('Usuario eliminado correctamente');
    await expect(fila(page, email)).toHaveCount(0);
  });

  test('cancelar la confirmacion conserva el usuario', async ({ page }) => {
    await fila(page, 'admin@proyecto.com').getByRole('button', { name: 'Eliminar' }).click();
    await page.locator('#modal-confirmar').getByRole('button', { name: 'Cancelar' }).click();
    await expect(fila(page, 'admin@proyecto.com')).toBeVisible();
  });

  test('el administrador no puede borrarse a si mismo', async ({ page }) => {
    await fila(page, 'admin@proyecto.com').getByRole('button', { name: 'Eliminar' }).click();
    await page.locator('#modal-confirmar').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.locator('#toast')).toHaveText('No puedes eliminar tu propio usuario');
    await expect(fila(page, 'admin@proyecto.com')).toBeVisible();
  });

  test('la busqueda filtra por nombre o correo', async ({ page }) => {
    await page.getByPlaceholder('Buscar...').fill('admin@proyecto');
    await expect(page.locator('#tabla-cuerpo tr')).toHaveCount(1);
    await page.getByPlaceholder('Buscar...').fill('zzz-no-existe');
    await expect(page.getByText('No hay registros')).toBeVisible();
  });
});
