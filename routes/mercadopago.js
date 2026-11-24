/**
 * Webhook de Mercado Pago.
 *
 * MP manda una notificación cada vez que cambia el estado de un pago.
 * El body viene en JSON. Si hay MP_WEBHOOK_SECRET, validamos la firma
 * HMAC. Si no, se acepta (modo bootstrap).
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const mp = require('../services/mercadopago');
const mail = require('../services/mail');

const router = express.Router();

function validarFirma(req) {
  const secreto = process.env.MP_WEBHOOK_SECRET;
  if (!secreto) return true;

  const firma = String(req.headers['x-signature'] || '');
  const requestId = String(req.headers['x-request-id'] || '');
  const paymentId = String(req.query['data.id'] || req.body?.data?.id || '');

  // Formato: "ts=xxx,v1=yyy"
  const partes = Object.fromEntries(firma.split(',').map(x => x.split('=').map(s => s.trim())));
  if (!partes.v1 || !partes.ts) return false;

  const manifest = `id:${paymentId};request-id:${requestId};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', secreto).update(manifest).digest('hex');
  return esperado === partes.v1;
}

async function procesarPago(paymentId) {
  const pago = await mp.consultarPago(paymentId);
  const externalRef = pago.external_reference;
  if (!externalRef) {
    console.log(`[webhook-mp] pago ${paymentId} sin external_reference, ignoro`);
    return;
  }

  const { rows } = await db.query(
    `select id, estado from pedidos where id = $1`, [externalRef]);
  const pedido = rows[0];
  if (!pedido) {
    console.log(`[webhook-mp] pedido ${externalRef} no existe`);
    return;
  }

  // Mapeo de estados de MP a nuestros estados
  let nuevoEstado = pedido.estado;
  if (pago.status === 'approved')      nuevoEstado = 'pagado';
  else if (pago.status === 'cancelled') nuevoEstado = 'cancelado';
  else if (pago.status === 'rejected')  nuevoEstado = 'cancelado';
  // in_process / pending / authorized → se queda como está

  if (nuevoEstado !== pedido.estado) {
    await db.query(
      `update pedidos
          set estado = $2,
              pagado_en = case when $2 = 'pagado' and pagado_en is null then now() else pagado_en end,
              notas_internas = coalesce(notas_internas,'') || $3
        where id = $1`,
      [pedido.id, nuevoEstado, `\n[MP pago ${paymentId}: ${pago.status}]`]);

    // Si quedó pagado, descontamos stock y avisamos por correo
    if (nuevoEstado === 'pagado') {
      await db.query(
        `update productos p
            set stock = greatest(0, stock - i.cantidad)
           from pedido_items i
          where i.pedido_id = $1 and i.producto_id = p.id`,
        [pedido.id]);

      // Mail de confirmación al cliente (best-effort)
      try {
        const { rows: r2 } = await db.query(
          `select id, numero, nombre, apellido, email, telefono,
                  envio_tipo, envio_modalidad, direccion, total, metodo_pago
             from pedidos where id = $1`, [pedido.id]);
        if (r2[0]) await mail.pedidoConfirmado(r2[0]);
      } catch (err) {
        console.error('[webhook-mp] pedidoConfirmado falló:', err.message);
      }
    }
    console.log(`[webhook-mp] pedido ${pedido.id} → ${nuevoEstado}`);
  }
}

router.post('/webhook', async (req, res) => {
  try {
    if (!validarFirma(req)) {
      console.warn('[webhook-mp] firma inválida');
      return res.status(401).send('bad signature');
    }

    const tipo = req.body?.type || req.query.type;
    const dataId = req.body?.data?.id || req.query['data.id'];
    if (tipo !== 'payment' || !dataId) {
      return res.status(200).send('ignored');
    }

    // Respondemos rápido y procesamos en background: MP exige respuesta < 22s
    res.status(200).send('ok');

    procesarPago(String(dataId)).catch(err =>
      console.error('[webhook-mp] error procesando:', err.message));
  } catch (err) {
    console.error('[webhook-mp] error:', err);
    res.status(500).send('error');
  }
});

module.exports = router;
