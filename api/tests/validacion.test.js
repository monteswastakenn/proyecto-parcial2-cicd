// Pruebas unitarias de las reglas de validacion (sin base de datos).
const { validarUsuario, validarProducto } = require('../src/validacion');

describe('validarUsuario', () => {
  const valido = { nombre: 'Ana Perez', email: 'ana@correo.com', password: 'secreta1' };

  test('acepta un usuario completo', () => {
    expect(validarUsuario(valido)).toEqual({});
  });

  test.each([
    ['nombre vacio', { nombre: '' }, 'nombre'],
    ['nombre de 1 caracter', { nombre: 'A' }, 'nombre'],
    ['nombre de 101 caracteres', { nombre: 'a'.repeat(101) }, 'nombre'],
    ['correo sin arroba', { email: 'anacorreo.com' }, 'email'],
    ['correo sin dominio', { email: 'ana@' }, 'email'],
    ['contrasena corta', { password: '123' }, 'password'],
    ['rol inexistente', { rol: 'jefe' }, 'rol'],
  ])('rechaza %s', (_, cambio, campo) => {
    expect(validarUsuario({ ...valido, ...cambio })).toHaveProperty(campo);
  });

  test('en modo parcial solo valida los campos enviados', () => {
    expect(validarUsuario({ nombre: 'Luis' }, { parcial: true })).toEqual({});
    expect(validarUsuario({ email: 'malo' }, { parcial: true })).toHaveProperty('email');
  });

  test('sin datos marca nombre, correo y contrasena', () => {
    expect(Object.keys(validarUsuario({})).sort()).toEqual(['email', 'nombre', 'password']);
  });
});

describe('validarProducto', () => {
  const valido = { sku: 'LAP-001', nombre: 'Laptop', precio: 15000.5, stock: 3 };

  test('acepta un producto completo', () => {
    expect(validarProducto(valido)).toEqual({});
  });

  test.each([
    ['SKU corto', { sku: 'AB' }, 'sku'],
    ['SKU con espacios', { sku: 'LAP 001' }, 'sku'],
    ['nombre vacio', { nombre: ' ' }, 'nombre'],
    ['precio negativo', { precio: -1 }, 'precio'],
    ['precio no numerico', { precio: 'abc' }, 'precio'],
    ['precio vacio', { precio: '' }, 'precio'],
    ['stock decimal', { stock: 1.5 }, 'stock'],
    ['stock negativo', { stock: -2 }, 'stock'],
    ['descripcion no textual', { descripcion: 5 }, 'descripcion'],
  ])('rechaza %s', (_, cambio, campo) => {
    expect(validarProducto({ ...valido, ...cambio })).toHaveProperty(campo);
  });

  test('precio 0 y stock 0 son validos', () => {
    expect(validarProducto({ ...valido, precio: 0, stock: 0 })).toEqual({});
  });
});
