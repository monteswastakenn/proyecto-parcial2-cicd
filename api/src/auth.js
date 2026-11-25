const jwt = require('jsonwebtoken');
const SECRETO = process.env.JWT_SECRET || 'secreto-de-desarrollo';

function firmar(usuario) {
  return jwt.sign({ id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre }, SECRETO, { expiresIn: '8h' });
}

/** Middleware: exige un token Bearer valido. */
function requiereSesion(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) return res.status(401).json({ error: 'Se requiere iniciar sesion' });
  try {
    req.usuario = jwt.verify(token, SECRETO);
    next();
  } catch {
    res.status(401).json({ error: 'Sesion invalida o expirada' });
  }
}

module.exports = { firmar, requiereSesion };
