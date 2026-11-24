/**
 * POST /api/contacto
 *
 * Guarda la consulta en la base y la reenvía al mail interno. A
 * diferencia de Trona, acá sí se guarda en tabla: Merfina quiere ver
 * el historial desde el panel.
 */
const express = require('express');
const db = require('../db');
const mail = require('../services/mail');

const router = express.Router();

const MAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

const golpes = new Map();
const VENTANA = 10 * 60 * 1000;
const MAXIMO = 4;

function demasiados(ip) {
  const ahora = Date.now();
  const previos = (golpes.get(ip) || []).filter(t => ahora - t < VENTANA);
  previos.push(ahora);
  golpes.set(ip, previos);
  if (golpes.size > 5000) {
    for (const [k, v] of golpes) if (!v.some(t => ahora - t < VENTANA)) golpes.delete(k);
  }
  return previos.length > MAXIMO;
}

router.post('/', async (req, res) => {
  try {
    const nombre   = String(req.body?.nombre   ?? '').trim().slice(0, 120);
    const email    = String(req.body?.email    ?? '').trim().slice(0, 160);
    const telefono = String(req.body?.telefono ?? '').trim().slice(0, 40);
    const asunto   = String(req.body?.asunto   ?? '').trim().slice(0, 160);
    const mensaje  = String(req.body?.mensaje  ?? '').trim().slice(0, 4000);

    if (!nombre)           return res.status(400).json({ error: 'Escribí tu nombre' });
    if (!MAIL.test(email)) return res.status(400).json({ error: 'Revisá el correo: parece que falta algo' });
    if (mensaje.length < 4) return res.status(400).json({ error: 'Contanos qué necesitás y te respondemos' });

    if (demasiados(req.ip)) {
      return res.status(429).json({ error: 'Esperá unos minutos antes de mandar otro mensaje' });
    }

    await db.query(
      `insert into contactos (nombre, email, telefono, asunto, mensaje)
       values ($1, $2, nullif($3,''), nullif($4,''), $5)`,
      [nombre, email, telefono, asunto, mensaje]);

    // El mail es best-effort: ya quedó guardado en la base.
    mail.contacto({ nombre, email, telefono, asunto, mensaje }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error('[contacto]', err.message);
    res.status(500).json({ error: 'No pudimos guardar el mensaje. Probá de nuevo.' });
  }
});

module.exports = router;
