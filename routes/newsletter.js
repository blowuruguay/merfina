/**
 * POST /api/newsletter        alta
 * GET  /baja-correos?e=...    baja por link del mail
 */
const express = require('express');
const db = require('../db');

const router = express.Router();
const MAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

router.post('/', async (req, res) => {
  const email  = String(req.body?.email  || '').trim().toLowerCase().slice(0, 160);
  const origen = String(req.body?.origen || 'home').slice(0, 30);
  if (!MAIL.test(email)) return res.status(400).json({ error: 'Revisá el correo' });

  try {
    await db.query(
      `insert into newsletter (email, origen)
       values ($1, $2)
       on conflict (email) do update
         set activo = true, baja_en = null`,
      [email, origen]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[newsletter]', err.message);
    res.status(500).json({ error: 'No pudimos sumarte. Probá de nuevo.' });
  }
});

async function bajaCorreos(req, res) {
  const email = String(req.query?.e || '').trim().toLowerCase();
  if (!MAIL.test(email)) return res.status(400).send('Enlace inválido');
  try {
    await db.query(
      `update newsletter set activo = false, baja_en = now() where email = $1`,
      [email]);
    res.send(`<!doctype html><meta charset="utf-8">
      <title>Merfina</title>
      <body style="font-family:Georgia,serif;padding:48px;max-width:560px;margin:auto;color:#2B251E">
      <h1 style="font-weight:400">Listo.</h1>
      <p>No vas a recibir más mails de Merfina en <strong>${email}</strong>.</p>
      <p><a href="https://merfina.uy" style="color:#B89766">Volver al sitio</a></p>
      </body>`);
  } catch (err) {
    res.status(500).send('No pudimos procesar la baja');
  }
}

module.exports = router;
module.exports.bajaCorreos = bajaCorreos;
