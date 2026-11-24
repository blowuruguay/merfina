/**
 * Cliente de Mercado Pago.
 *
 * Hablamos directo con la API REST con fetch, sin SDK oficial — basta
 * para crear la preference y leer el estado de un pago.
 *
 * Variables de entorno:
 *   MP_ACCESS_TOKEN     token privado de la aplicación de MP
 *   MP_WEBHOOK_SECRET   secreto para validar firma del webhook (opcional)
 *   DOMINIO_PRINCIPAL   dominio público (merfina.uy) para armar back_urls
 */
const TOKEN = () => process.env.MP_ACCESS_TOKEN || '';
const PRINCIPAL = () =>
  (process.env.DOMINIO_PRINCIPAL || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  || 'merfina.uy';

function configurado() { return !!TOKEN(); }

async function crearPreference({ items, pedido, nombre, apellido, email, telefono }) {
  if (!configurado()) throw new Error('MercadoPago no configurado (falta MP_ACCESS_TOKEN)');

  const base = `https://${PRINCIPAL()}`;

  const body = {
    items: items.map(it => ({
      id: it.slug,
      title: it.nombre,
      quantity: it.cantidad,
      currency_id: 'UYU',
      unit_price: Number(it.precio_unit),
      picture_url: it.imagen || undefined
    })),
    payer: {
      name: nombre,
      surname: apellido || '',
      email,
      phone: telefono ? { number: String(telefono) } : undefined
    },
    external_reference: String(pedido.id),
    statement_descriptor: 'MERFINA',
    back_urls: {
      success: `${base}/pedido/exito?id=${pedido.id}`,
      pending: `${base}/pedido/pendiente?id=${pedido.id}`,
      failure: `${base}/pedido/error?id=${pedido.id}`
    },
    auto_return: 'approved',
    notification_url: `${base}/api/mercadopago/webhook`
  };

  // Agregar envío como ítem separado para que quede claro en MP
  if (pedido.envio_costo > 0) {
    body.items.push({
      id: 'envio',
      title: `Envío (${pedido.envio_tipo || 'coordinado'})`,
      quantity: 1,
      currency_id: 'UYU',
      unit_price: Number(pedido.envio_costo)
    });
  }

  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const detalle = await r.text();
    console.error('[MP] preference falló:', r.status, detalle.slice(0, 400));
    throw new Error('Mercado Pago rechazó la operación');
  }
  const data = await r.json();
  return {
    id: data.id,
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point
  };
}

async function consultarPago(paymentId) {
  if (!configurado()) throw new Error('MercadoPago no configurado');
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { 'Authorization': `Bearer ${TOKEN()}` }
  });
  if (!r.ok) throw new Error(`MP /payments/${paymentId} respondió ${r.status}`);
  return r.json();
}

module.exports = { configurado, crearPreference, consultarPago };
