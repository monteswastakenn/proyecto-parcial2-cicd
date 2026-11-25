// Reglas de validacion compartidas por las rutas (funciones puras, probadas con Jest).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validarUsuario(datos, { parcial = false } = {}) {
  const errores = {};
  const { nombre, email, password, rol } = datos || {};
  if (!parcial || nombre !== undefined) {
    if (typeof nombre !== 'string' || nombre.trim().length < 2) errores.nombre = 'El nombre debe tener al menos 2 caracteres';
    else if (nombre.trim().length > 100) errores.nombre = 'El nombre admite como maximo 100 caracteres';
  }
  if (!parcial || email !== undefined) {
    if (typeof email !== 'string' || !EMAIL.test(email.trim())) errores.email = 'El correo no es valido';
  }
  if (!parcial || password !== undefined) {
    if (typeof password !== 'string' || password.length < 6) errores.password = 'La contrasena debe tener al menos 6 caracteres';
  }
  if (rol !== undefined && !['admin', 'usuario'].includes(rol)) errores.rol = 'El rol debe ser admin o usuario';
  return errores;
}

function validarProducto(datos, { parcial = false } = {}) {
  const errores = {};
  const { sku, nombre, precio, stock, descripcion } = datos || {};
  if (!parcial || sku !== undefined) {
    if (typeof sku !== 'string' || !/^[A-Za-z0-9-]{3,40}$/.test(sku.trim())) errores.sku = 'El SKU debe tener de 3 a 40 letras, numeros o guiones';
  }
  if (!parcial || nombre !== undefined) {
    if (typeof nombre !== 'string' || nombre.trim().length < 2) errores.nombre = 'El nombre debe tener al menos 2 caracteres';
    else if (nombre.trim().length > 120) errores.nombre = 'El nombre admite como maximo 120 caracteres';
  }
  if (!parcial || precio !== undefined) {
    const p = Number(precio);
    if (precio === '' || precio === null || Number.isNaN(p) || p < 0) errores.precio = 'El precio debe ser un numero mayor o igual a 0';
  }
  if (!parcial || stock !== undefined) {
    const s = Number(stock);
    if (stock === '' || stock === null || !Number.isInteger(s) || s < 0) errores.stock = 'El stock debe ser un entero mayor o igual a 0';
  }
  if (descripcion !== undefined && typeof descripcion !== 'string') errores.descripcion = 'La descripcion debe ser texto';
  return errores;
}

module.exports = { validarUsuario, validarProducto };
