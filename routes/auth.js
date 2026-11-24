/**
 * Autenticación del panel.
 * POST /api/auth/login        { email, password } -> { token, usuario }
 * GET  /api/auth/yo           devuelve el usuario del token
 * PUT  /api/auth/mi-cuenta    { nombre }
 * PUT  /api/auth/contrasena   { actual, nueva }
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { firmar, exigirToken } = require('../middleware/auth');

const router = express.Router();

// Freno simple contra fuerza bruta: 5 intentos fallidos por IP cada 15 min.
const intentos = new Map();
const LIMITE = 5;
const VENTANA = 15 * 60 * 1000;

function bloqueado(ip) {
  const reg = intentos.get(ip);
  if (!reg) return false;
  if (Date.now() - reg.desde > VENTANA) { intentos.delete(ip); return false; }
  return reg.fallos >= LIMITE;
}
function anotarFallo(ip) {
  const reg = intentos.get(ip);
  if (!reg || Date.now() - reg.desde > VENTANA) intentos.set(ip, { fallos: 1, desde: Date.now() });
  else reg.fallos++;
}

router.post('/login', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  if (bloqueado(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Faltan email y contraseña' });

  try {
    const { rows } = await db.query(
      `select id, email, password, nombre, rol, activo from usuarios where email = $1`,
      [email]
    );
    const u = rows[0];

    if (!u || !u.activo || !(await bcrypt.compare(password, u.password))) {
      anotarFallo(ip);
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    intentos.delete(ip);
    await db.query(`update usuarios set ultimo_ingreso = now() where id = $1`, [u.id]);

    res.json({
      token: firmar(u),
      usuario: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol }
    });
  } catch (err) {
    console.error('Error en login', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/yo', exigirToken, (req, res) => {
  res.json({ usuario: req.usuario });
});

router.put('/mi-cuenta', exigirToken, async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim().slice(0, 80);
  if (!nombre) return res.status(400).json({ error: 'Escribí tu nombre' });

  try {
    const { rows } = await db.query(
      `update usuarios set nombre = $1 where id = $2
       returning id, email, nombre, rol`, [nombre, req.usuario.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontramos tu usuario' });
    res.json({ usuario: rows[0] });
  } catch (err) {
    console.error('Error guardando la cuenta', err);
    res.status(500).json({ error: 'No pudimos guardar' });
  }
});

router.put('/contrasena', exigirToken, async (req, res) => {
  const actual = String(req.body?.actual || '');
  const nueva  = String(req.body?.nueva  || '');

  if (!actual || !nueva) return res.status(400).json({ error: 'Completá las dos contraseñas' });
  if (nueva.length < 10)  return res.status(400).json({ error: 'La contraseña nueva tiene que tener al menos 10 caracteres' });
  if (nueva === actual)   return res.status(400).json({ error: 'La contraseña nueva tiene que ser distinta de la actual' });

  try {
    const { rows } = await db.query(
      `select id, email, password from usuarios where id = $1`, [req.usuario.id]);
    const u = rows[0];
    if (!u) return res.status(404).json({ error: 'No encontramos tu usuario' });

    if (!(await bcrypt.compare(actual, u.password))) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    }
    if (nueva.toLowerCase().includes(u.email.split('@')[0].toLowerCase())) {
      return res.status(400).json({ error: 'La contraseña no puede contener tu correo' });
    }

    const hash = await bcrypt.hash(nueva, 10);
    await db.query(`update usuarios set password = $1 where id = $2`, [hash, u.id]);
    console.log(`[auth] ${u.email} cambió su contraseña`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error cambiando la contraseña', err);
    res.status(500).json({ error: 'No pudimos cambiar la contraseña' });
  }
});

module.exports = router;
