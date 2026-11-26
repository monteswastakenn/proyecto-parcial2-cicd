// Frontend del sistema: login, CRUD de usuarios y CRUD de productos (JavaScript sin dependencias).
const $ = (s) => document.querySelector(s);
const estado = { token: localStorage.getItem('token'), usuario: JSON.parse(localStorage.getItem('usuario') || 'null'), seccion: 'usuarios', registros: [], editando: null };

const SECCIONES = {
  usuarios: {
    titulo: 'Usuarios',
    url: '/api/usuarios',
    singular: 'usuario',
    columnas: [['id', 'Id'], ['nombre', 'Nombre'], ['email', 'Correo'], ['rol', 'Rol']],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'text' },
      { nombre: 'email', etiqueta: 'Correo', tipo: 'email' },
      { nombre: 'password', etiqueta: 'Contraseña', tipo: 'password', ayudaEditar: 'Déjala vacía para no cambiarla' },
      { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: ['usuario', 'admin'] },
    ],
    validar(d, editando) {
      const e = {};
      if (!d.nombre || d.nombre.trim().length < 2) e.nombre = 'El nombre debe tener al menos 2 caracteres';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email || '')) e.email = 'El correo no es válido';
      if ((!editando || d.password) && (d.password || '').length < 6) e.password = 'La contraseña debe tener al menos 6 caracteres';
      return e;
    },
  },
  productos: {
    titulo: 'Productos',
    url: '/api/productos',
    singular: 'producto',
    columnas: [['id', 'Id'], ['sku', 'SKU'], ['nombre', 'Nombre'], ['precio', 'Precio'], ['stock', 'Stock']],
    campos: [
      { nombre: 'sku', etiqueta: 'SKU', tipo: 'text' },
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'text' },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea' },
      { nombre: 'precio', etiqueta: 'Precio', tipo: 'number', paso: '0.01' },
      { nombre: 'stock', etiqueta: 'Stock', tipo: 'number', paso: '1' },
    ],
    validar(d) {
      const e = {};
      if (!/^[A-Za-z0-9-]{3,40}$/.test(d.sku || '')) e.sku = 'El SKU debe tener de 3 a 40 letras, números o guiones';
      if (!d.nombre || d.nombre.trim().length < 2) e.nombre = 'El nombre debe tener al menos 2 caracteres';
      if (d.precio === '' || Number.isNaN(Number(d.precio)) || Number(d.precio) < 0) e.precio = 'El precio debe ser un número mayor o igual a 0';
      if (d.stock === '' || !Number.isInteger(Number(d.stock)) || Number(d.stock) < 0) e.stock = 'El stock debe ser un entero mayor o igual a 0';
      return e;
    },
  },
};

async function api(url, opciones = {}) {
  const r = await fetch(url, {
    ...opciones,
    headers: { 'content-type': 'application/json', ...(estado.token ? { authorization: `Bearer ${estado.token}` } : {}) },
  });
  if (r.status === 401 && estado.token) {
    cerrarSesion();
    throw new Error('Tu sesión expiró');
  }
  const cuerpo = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    const error = new Error((cuerpo && cuerpo.error) || `Error ${r.status}`);
    error.campos = cuerpo && cuerpo.campos;
    throw error;
  }
  return cuerpo;
}

function toast(texto, esError = false) {
  const t = $('#toast');
  t.textContent = texto;
  t.className = esError ? 'error' : '';
  t.hidden = false;
  clearTimeout(toast.temporizador);
  toast.temporizador = setTimeout(() => (t.hidden = true), 3000);
}

function mostrarErrores(contenedor, errores) {
  contenedor.querySelectorAll('[data-error]').forEach((el) => (el.textContent = ''));
  contenedor.querySelectorAll('.invalido').forEach((el) => el.classList.remove('invalido'));
  Object.entries(errores || {}).forEach(([campo, msg]) => {
    const el = contenedor.querySelector(`[data-error="${campo}"]`);
    if (el) el.textContent = msg;
    const input = contenedor.querySelector(`[name="${campo}"]`);
    if (input) input.classList.add('invalido');
  });
}

// ---------- Sesion ----------
$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const errores = {};
  if (!email) errores.email = 'El correo es obligatorio';
  if (!password) errores.password = 'La contraseña es obligatoria';
  mostrarErrores($('#form-login'), errores);
  $('#login-error').hidden = true;
  if (Object.keys(errores).length) return;
  try {
    const { token, usuario } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    estado.token = token;
    estado.usuario = usuario;
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(usuario));
    $('#form-login').reset();
    location.hash = '#/usuarios';
    render();
  } catch (e) {
    $('#login-error').textContent = e.message;
    $('#login-error').hidden = false;
  }
});

function cerrarSesion() {
  estado.token = null;
  estado.usuario = null;
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  location.hash = '#/login';
  render();
}
$('#btn-logout').addEventListener('click', cerrarSesion);

// ---------- Listado ----------
cargar.ultima = 0;
async function cargar() {
  const sec = SECCIONES[estado.seccion];
  const q = $('#buscar').value.trim();
  const peticion = ++cargar.ultima; // descarta respuestas viejas si llegan fuera de orden
  let registros;
  try {
    registros = await api(`${sec.url}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  } catch (e) {
    registros = [];
    toast(e.message, true);
  }
  if (peticion !== cargar.ultima) return;
  estado.registros = registros;
  pintarTabla();
}

function pintarTabla() {
  const sec = SECCIONES[estado.seccion];
  $('#tabla-encabezado').innerHTML = `<tr>${sec.columnas.map(([, t]) => `<th>${t}</th>`).join('')}<th>Acciones</th></tr>`;
  const cuerpo = $('#tabla-cuerpo');
  cuerpo.innerHTML = '';
  for (const reg of estado.registros) {
    const tr = document.createElement('tr');
    tr.dataset.id = reg.id;
    for (const [campo] of sec.columnas) {
      const td = document.createElement('td');
      td.dataset.col = campo;
      td.textContent = campo === 'precio' ? `$${Number(reg[campo]).toFixed(2)}` : reg[campo];
      tr.appendChild(td);
    }
    const acciones = document.createElement('td');
    acciones.className = 'acciones-fila';
    acciones.innerHTML = '<button class="secundario" data-accion="editar">Editar</button><button class="peligro" data-accion="eliminar">Eliminar</button>';
    acciones.querySelector('[data-accion=editar]').addEventListener('click', () => abrirFormulario(reg));
    acciones.querySelector('[data-accion=eliminar]').addEventListener('click', () => confirmarEliminar(reg));
    tr.appendChild(acciones);
    cuerpo.appendChild(tr);
  }
  $('#sin-registros').hidden = estado.registros.length > 0;
  $('#contador').textContent = `${estado.registros.length} registro(s)`;
}

let temporizadorBusqueda;
$('#buscar').addEventListener('input', () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(cargar, 250);
});

// ---------- Formulario ----------
function abrirFormulario(registro = null) {
  const sec = SECCIONES[estado.seccion];
  estado.editando = registro;
  $('#modal-titulo').textContent = `${registro ? 'Editar' : 'Nuevo'} ${sec.singular}`;
  $('#form-error').hidden = true;
  $('#campos').innerHTML = sec.campos
    .map((c) => {
      const id = `campo-${c.nombre}`;
      let control;
      if (c.tipo === 'select') control = `<select id="${id}" name="${c.nombre}">${c.opciones.map((o) => `<option value="${o}">${o}</option>`).join('')}</select>`;
      else if (c.tipo === 'textarea') control = `<textarea id="${id}" name="${c.nombre}" rows="2"></textarea>`;
      else control = `<input id="${id}" name="${c.nombre}" type="${c.tipo}" ${c.paso ? `step="${c.paso}"` : ''}>`;
      const ayuda = registro && c.ayudaEditar ? `<small>${c.ayudaEditar}</small>` : '';
      return `<label for="${id}">${c.etiqueta}</label>${control}${ayuda}<small class="error-campo" data-error="${c.nombre}"></small>`;
    })
    .join('');
  if (registro) for (const c of sec.campos) if (c.nombre !== 'password') $(`#campo-${c.nombre}`).value = registro[c.nombre] ?? '';
  $('#modal-form').showModal();
  $(`#campo-${sec.campos[0].nombre}`).focus();
}

$('#btn-nuevo').addEventListener('click', () => abrirFormulario());
$('#btn-cancelar').addEventListener('click', () => $('#modal-form').close());

$('#form-registro').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const sec = SECCIONES[estado.seccion];
  const datos = Object.fromEntries(new FormData($('#form-registro')).entries());
  const errores = sec.validar(datos, Boolean(estado.editando));
  mostrarErrores($('#form-registro'), errores);
  $('#form-error').hidden = true;
  if (Object.keys(errores).length) return;
  if (datos.precio !== undefined) datos.precio = Number(datos.precio);
  if (datos.stock !== undefined) datos.stock = Number(datos.stock);
  try {
    if (estado.editando) await api(`${sec.url}/${estado.editando.id}`, { method: 'PUT', body: JSON.stringify(datos) });
    else await api(sec.url, { method: 'POST', body: JSON.stringify(datos) });
    $('#modal-form').close();
    toast(`${sec.singular[0].toUpperCase()}${sec.singular.slice(1)} ${estado.editando ? 'actualizado' : 'creado'} correctamente`);
    await cargar();
  } catch (e) {
    mostrarErrores($('#form-registro'), e.campos);
    $('#form-error').textContent = e.message;
    $('#form-error').hidden = false;
  }
});

// ---------- Eliminar ----------
let porEliminar = null;
function confirmarEliminar(registro) {
  porEliminar = registro;
  $('#confirmar-texto').textContent = `¿Eliminar "${registro.nombre}"? Esta acción no se puede deshacer.`;
  $('#modal-confirmar').showModal();
}
$('#btn-no').addEventListener('click', () => $('#modal-confirmar').close());
$('#btn-si').addEventListener('click', async () => {
  const sec = SECCIONES[estado.seccion];
  $('#modal-confirmar').close();
  try {
    await api(`${sec.url}/${porEliminar.id}`, { method: 'DELETE' });
    toast(`${sec.singular[0].toUpperCase()}${sec.singular.slice(1)} eliminado correctamente`);
  } catch (e) {
    toast(e.message, true);
  }
  await cargar();
});

// ---------- Enrutado ----------
function render() {
  const conSesion = Boolean(estado.token);
  const ruta = location.hash.replace('#/', '') || (conSesion ? 'usuarios' : 'login');
  if (!conSesion) {
    $('#vista-login').hidden = false;
    $('#vista-app').hidden = true;
    if (location.hash !== '#/login') history.replaceState(null, '', '#/login');
    return;
  }
  $('#vista-login').hidden = true;
  $('#vista-app').hidden = false;
  estado.seccion = SECCIONES[ruta] ? ruta : 'usuarios';
  if (location.hash !== `#/${estado.seccion}`) history.replaceState(null, '', `#/${estado.seccion}`);
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('activo', a.dataset.nav === estado.seccion));
  $('#titulo-seccion').textContent = SECCIONES[estado.seccion].titulo;
  $('#usuario-actual').textContent = estado.usuario ? estado.usuario.nombre : '';
  $('#buscar').value = '';
  cargar();
}

window.addEventListener('hashchange', render);
render();

// Muestra en el pie la version (commit) que reporta la API; cambia en cada despliegue
fetch('/api/health').then((r) => r.json())
  .then((d) => { document.getElementById('version').textContent = d.version || 'local'; })
  .catch(() => { document.getElementById('version').textContent = 'sin conexión'; });
