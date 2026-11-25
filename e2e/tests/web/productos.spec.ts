import { test, expect } from '@playwright/test';
import { entrar, fila, llenarFormulario, unico } from '../apoyo';

test.describe('CRUD de productos (frontend)', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page);
    await page.getByRole('link', { name: 'Productos' }).click();
    await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();
  });

  test('la seccion muestra las columnas de productos', async ({ page }) => {
    await expect(page).toHaveURL(/#\/productos/);
    await expect(page.locator('#tabla-encabezado th')).toHaveText(['Id', 'SKU', 'Nombre', 'Precio', 'Stock', 'Acciones']);
    await expect(page.getByRole('link', { name: 'Productos' })).toHaveClass(/activo/);
  });

  test('crear un producto lo muestra con formato de precio', async ({ page }, testInfo) => {
    const sku = unico('UI-').toUpperCase();
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible();
    await llenarFormulario(page, { SKU: sku, Nombre: 'Monitor 24', 'Descripción': 'Full HD', Precio: '3499.5', Stock: '7' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#toast')).toHaveText('Producto creado correctamente');
    await expect(fila(page, sku).locator('[data-col=precio]')).toHaveText('$3499.50');
    await expect(fila(page, sku).locator('[data-col=stock]')).toHaveText('7');
    await testInfo.attach('producto-creado', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('el formulario vacio marca SKU, nombre, precio y stock', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    for (const campo of ['sku', 'nombre', 'precio', 'stock']) {
      await expect(page.locator(`#modal-form [data-error=${campo}]`)).not.toBeEmpty();
    }
  });

  test('precio negativo y stock decimal se rechazan', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await llenarFormulario(page, { SKU: 'UI-NEG', Nombre: 'Malo', Precio: '-10', Stock: '1.5' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#modal-form [data-error=precio]')).toHaveText('El precio debe ser un número mayor o igual a 0');
    await expect(page.locator('#modal-form [data-error=stock]')).toHaveText('El stock debe ser un entero mayor o igual a 0');
  });

  test('un SKU repetido muestra el error del servidor', async ({ page }) => {
    const sku = unico('UI-').toUpperCase();
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Nuevo' }).click();
      await llenarFormulario(page, { SKU: sku, Nombre: `Prod ${i}`, Precio: '10', Stock: '1' });
      await page.getByRole('button', { name: 'Guardar' }).click();
    }
    await expect(page.locator('#form-error')).toHaveText('Ya existe un producto con ese SKU');
    await expect(page.locator('#modal-form [data-error=sku]')).toHaveText('Ya existe un producto con ese SKU');
  });

  test('editar un producto actualiza precio y stock', async ({ page }) => {
    const sku = unico('UI-').toUpperCase();
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await llenarFormulario(page, { SKU: sku, Nombre: 'Silla', Precio: '1200', Stock: '3' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await fila(page, sku).getByRole('button', { name: 'Editar' }).click();
    await expect(page.locator('#modal-form').getByLabel('SKU')).toHaveValue(sku);
    await llenarFormulario(page, { Precio: '999.99', Stock: '0' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#toast')).toHaveText('Producto actualizado correctamente');
    await expect(fila(page, sku).locator('[data-col=precio]')).toHaveText('$999.99');
    await expect(fila(page, sku).locator('[data-col=stock]')).toHaveText('0');
  });

  test('eliminar un producto con confirmacion', async ({ page }) => {
    const sku = unico('UI-').toUpperCase();
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await llenarFormulario(page, { SKU: sku, Nombre: 'Lampara', Precio: '300', Stock: '2' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await fila(page, sku).getByRole('button', { name: 'Eliminar' }).click();
    await page.locator('#modal-confirmar').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.locator('#toast')).toHaveText('Producto eliminado correctamente');
    await expect(fila(page, sku)).toHaveCount(0);
  });

  test('la busqueda filtra por SKU', async ({ page }) => {
    const sku = unico('UI-').toUpperCase();
    await page.getByRole('button', { name: 'Nuevo' }).click();
    await llenarFormulario(page, { SKU: sku, Nombre: 'Buscable', Precio: '1', Stock: '1' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByPlaceholder('Buscar...').fill(sku);
    await expect(page.locator('#tabla-cuerpo tr')).toHaveCount(1);
    await expect(page.locator('#contador')).toHaveText('1 registro(s)');
  });

  test('la navegacion entre secciones cambia la tabla', async ({ page }) => {
    await page.getByRole('link', { name: 'Usuarios' }).click();
    await expect(page.locator('#tabla-encabezado')).toContainText('Correo');
    await page.getByRole('link', { name: 'Productos' }).click();
    await expect(page.locator('#tabla-encabezado')).toContainText('SKU');
  });
});
