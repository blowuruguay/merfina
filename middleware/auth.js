/**
 * Autenticación del panel.
 * Token JWT en el header Authorization: Bearer <token>.
 * El front lo guarda en localStorage bajo la clave merfina_token.
 */
const jwt = require('jsonwebtoken');

const SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  console.error('Falta JWT_SECRET. Generá uno con: openssl rand -hex 32');
  process.exit(1);
}

function firmar(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre, tipo: 'panel' },
    SECRETO,
    { expiresIn: '12h' }
  );
}

function exigirToken(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta el token' });

  try {
    const datos = jwt.verify(token, SECRETO);
    if (datos.tipo !== 'panel') {
      return res.status(403).json({ error: 'Este token no sirve para el panel' });
    }
    req.usuario = datos;

    // Sesión que se renueva sola mientras se use.
    const restante = datos.exp - Math.floor(Date.now() / 1000);
    if (restante > 0 && restante < 6 * 3600) {
      res.setHeader('X-Token-Nuevo', firmar({
        id: datos.id, email: datos.email, rol: datos.rol, nombre: datos.nombre
      }));
      res.setHeader('Access-Control-Expose-Headers', 'X-Token-Nuevo');
    }

    next();
  } catch (err) {
    const expirado = err.name === 'TokenExpiredError';
    res.status(401).json({ error: expirado ? 'La sesión venció' : 'Token inválido', expirado });
  }
}

function exigirDueño(req, res, next) {
  if (req.usuario?.rol !== 'dueño') {
    return res.status(403).json({ error: 'No tenés permiso para esto' });
  }
  next();
}

module.exports = { firmar, exigirToken, exigirDueño };
