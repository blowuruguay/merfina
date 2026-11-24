/**
 * Envío de correos transaccionales.
 *
 * Usa la API de Resend (si está configurada con RESEND_API_KEY).
 * Si no, deja constancia en el log y responde ok para no bloquear.
 *
 * Tipos:
 *   contacto(datos)                  — form de contacto público
 *   nuevoPedidoAdmin(pedido)         — aviso interno al dueño cuando se crea
 *   pedidoConfirmado(pedido)         — cliente: tu compra fue confirmada
 *   pedidoPreparando(pedido)         — cliente: ya la estamos preparando
 *   pedidoEnviado(pedido, tracking)  — cliente: salió, con tracking si hay
 *   pedidoEntregado(pedido)          — cliente: llegó, invitación a reseña
 */
const db = require('../db');

const MAIL_INTERNO = () => process.env.MAIL_INTERNO || '';
const MAIL_DESDE   = () => process.env.MAIL_DESDE   || 'Merfina <hola@merfina.uy>';
const CLAVE        = () => process.env.RESEND_API_KEY || '';

async function enviar({ para, asunto, html, replyTo }) {
  const clave = CLAVE();
  if (!clave || !para) {
    console.log(`[mail] (no enviado · sin clave o destinatario) asunto="${asunto}"`);
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clave}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: MAIL_DESDE(),
        to: para,
        subject: asunto,
        html,
        reply_to: replyTo || undefined
      })
    });
    if (!r.ok) {
      console.error(`[mail] Resend ${r.status}: ${(await r.text()).slice(0,300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mail] error inesperado:', err.message);
    return false;
  }
}

function esc(t) {
  return String(t || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
function precio(n) {
  return '$ ' + Number(n || 0).toLocaleString('es-UY');
}

// ============================================================
// Plantilla base al cliente (cream + gold + Cormorant)
// ============================================================
function wrap({ preHeader, titulo, cuerpoHtml }) {
  return `
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
</head>
<body style="margin:0;padding:0;background:#F8F3EA;font-family:'Cormorant Garamond',Georgia,serif;color:#2B251E;-webkit-text-size-adjust:none">
  <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${esc(preHeader || '')}</span>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F3EA;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e6ddcf">

        <tr><td align="center" style="padding:38px 28px 20px">
          <img src="https://merfina.uy/img/logo-gold.png" alt="Merfina" width="40" style="display:block;margin:0 auto 10px;height:auto">
          <div style="font-family:Georgia,serif;font-size:14px;letter-spacing:.42em;color:#8F7349">MERFINA</div>
          <div style="height:1px;background:#e6ddcf;margin:18px auto 0;width:48px"></div>
        </td></tr>

        ${cuerpoHtml}

        <tr><td style="padding:36px 32px 32px;border-top:1px solid #e6ddcf;background:#FBF7F0">
          <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:.3em;color:#8F7349;text-transform:uppercase;text-align:center;margin-bottom:12px">Merfina Joyas</div>
          <div style="text-align:center;font-size:13px;color:#6a6054;line-height:1.7">
            <a href="https://merfina.uy" style="color:#8F7349;text-decoration:none">merfina.uy</a>
            &nbsp;·&nbsp;
            <a href="https://wa.me/59891900341" style="color:#8F7349;text-decoration:none">WhatsApp 091 900 341</a>
            &nbsp;·&nbsp;
            <a href="https://instagram.com/merfinajoyas" style="color:#8F7349;text-decoration:none">@merfinajoyas</a>
          </div>
          <div style="text-align:center;font-size:11px;color:#a39a8c;margin-top:16px;letter-spacing:.15em">
            Montevideo, Uruguay
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================================
// Plantilla INTERNA (más ejecutiva, para que Merfina actúe rápido)
// Mantiene la paleta pero densifica info: badge dorado, datos en
// grilla, CTAs claros.
// ============================================================
function wrapInterno({ preHeader, titulo, badge, cuerpoHtml }) {
  return `
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
</head>
<body style="margin:0;padding:0;background:#F3EADA;font-family:'Cormorant Garamond',Georgia,serif;color:#2B251E;-webkit-text-size-adjust:none">
  <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${esc(preHeader || '')}</span>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EADA;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 20px -8px rgba(60,40,10,.15)">

        <!-- Header oscuro con logo -->
        <tr><td style="background:#141210;padding:30px 36px 28px;text-align:center">
          <img src="https://merfina.uy/img/logo-cream.png" alt="Merfina" width="36" style="display:block;margin:0 auto 10px;height:auto">
          <div style="font-family:Georgia,serif;font-size:13px;letter-spacing:.42em;color:#C9A979">MERFINA</div>
          <div style="font-size:10px;letter-spacing:.3em;color:#8B7E6A;text-transform:uppercase;margin-top:6px">Panel · aviso interno</div>
        </td></tr>

        <!-- Badge dorado (opcional) -->
        ${badge ? `
        <tr><td align="center" style="padding:28px 36px 0">
          <div style="display:inline-block;padding:7px 18px;background:#F3EADA;border:1px solid #d6c8ad;border-radius:999px;font-family:Arial,sans-serif;font-size:10.5px;letter-spacing:.32em;color:#8F7349;text-transform:uppercase;font-weight:600">${esc(badge)}</div>
        </td></tr>` : ''}

        ${cuerpoHtml}

        <!-- Footer interno -->
        <tr><td style="padding:24px 32px 28px;border-top:1px solid #e6ddcf;background:#FBF7F0;text-align:center">
          <div style="font-family:Georgia,serif;font-size:10.5px;letter-spacing:.3em;color:#8F7349;text-transform:uppercase;margin-bottom:8px">Merfina Joyas · Panel interno</div>
          <div style="font-size:11px;color:#a39a8c;line-height:1.5">
            Este aviso lo recibís como administrador de merfina.uy.<br>
            Para gestionar pedidos, entrá al <a href="https://admin.merfina.uy" style="color:#8F7349;text-decoration:none">panel</a>.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function botonCTA(href, texto) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto">
      <tr><td align="center" style="background:#141210;padding:14px 32px">
        <a href="${esc(href)}" style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#F8F3EA;text-decoration:none;font-weight:500">${esc(texto)}</a>
      </td></tr>
    </table>`;
}

function tituloBloque(titulo, lead) {
  return `
    <tr><td style="padding:28px 36px 8px;text-align:center">
      <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:34px;color:#141210;margin:0;line-height:1.1">${esc(titulo)}</h1>
      ${lead ? `<div style="font-family:Georgia,serif;font-style:italic;font-size:17px;color:#6a6054;margin:14px 0 0;line-height:1.5">${esc(lead)}</div>` : ''}
    </td></tr>`;
}

// Tabla con los items del pedido
async function cargarItems(pedidoId) {
  const { rows } = await db.query(
    `select nombre, precio_unit, cantidad from pedido_items where pedido_id = $1 order by id`,
    [pedidoId]);
  return rows;
}

function bloqueItems(items, totales) {
  const filas = items.map(i => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f1e9de">
        <div style="font-family:Georgia,serif;font-size:17px;color:#141210">${esc(i.nombre)}</div>
        <div style="font-size:12px;color:#8a8276">${i.cantidad > 1 ? '× ' + i.cantidad : ''}</div>
      </td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #f1e9de;font-family:Georgia,serif;font-size:17px;color:#8F7349;font-style:italic">
        ${precio(i.precio_unit * i.cantidad)}
      </td>
    </tr>`).join('');

  return `
    <tr><td style="padding:10px 36px 20px">
      <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276;margin-bottom:10px">Tu pedido</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${filas}
        <tr>
          <td style="padding:14px 0 6px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#141210">Total</td>
          <td align="right" style="padding:14px 0 6px;font-family:Georgia,serif;font-size:24px;color:#8F7349;font-style:italic">${precio(totales.total)}</td>
        </tr>
      </table>
    </td></tr>`;
}

function bloqueDireccion(pedido) {
  if (!pedido.direccion) return '';
  let d = pedido.direccion;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return ''; } }
  const partes = [];
  if (d.calle)   partes.push(d.calle + (d.apto ? ' · Apto ' + d.apto : ''));
  if (d.barrio)  partes.push(d.barrio);
  if (d.ciudad)  partes.push(d.ciudad);
  if (d.depto)   partes.push(d.depto);
  if (d.cp)      partes.push('CP ' + d.cp);
  if (d.agencia) partes.push('Agencia: ' + d.agencia);
  if (!partes.length) return '';

  const tipoTxt = pedido.envio_tipo === 'interior'
    ? (pedido.envio_modalidad === 'agencia' ? 'Retiro en agencia DAC' : 'Envío al interior a domicilio')
    : 'Envío a Montevideo';

  return `
    <tr><td style="padding:10px 36px 20px">
      <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276;margin-bottom:8px">${esc(tipoTxt)}</div>
      <div style="font-family:Georgia,serif;font-size:16px;color:#2B251E;line-height:1.5">
        ${esc(partes.join(' · '))}
      </div>
      <div style="font-size:12px;color:#8a8276;margin-top:8px;font-style:italic">
        El costo del envío va a cargo del comprador.
      </div>
    </td></tr>`;
}

// ============================================================
// Correos específicos
// ============================================================

async function contacto({ nombre, email, telefono, asunto, mensaje }) {
  if (!MAIL_INTERNO()) {
    console.log(`[mail] contacto sin MAIL_INTERNO: ${nombre} <${email}>`);
    return true;
  }
  const html = wrap({
    preHeader: `Consulta de ${nombre}`,
    titulo: 'Nuevo mensaje en merfina.uy',
    cuerpoHtml: `
      ${tituloBloque('Nueva consulta', `De ${nombre}`)}
      <tr><td style="padding:20px 36px 10px">
        <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276">Correo</div>
        <div style="font-family:Georgia,serif;font-size:16px;color:#2B251E">${esc(email)}</div>
        ${telefono ? `
          <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276;margin-top:14px">Teléfono</div>
          <div style="font-family:Georgia,serif;font-size:16px;color:#2B251E">${esc(telefono)}</div>` : ''}
        ${asunto ? `
          <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276;margin-top:14px">Asunto</div>
          <div style="font-family:Georgia,serif;font-size:16px;color:#2B251E">${esc(asunto)}</div>` : ''}
      </td></tr>
      <tr><td style="padding:14px 36px 32px">
        <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276;margin-bottom:10px">Mensaje</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#2B251E;line-height:1.7;white-space:pre-wrap">${esc(mensaje)}</div>
      </td></tr>
    `
  });
  return enviar({
    para: MAIL_INTERNO(),
    asunto: `Merfina — ${asunto || 'consulta nueva'}`,
    html,
    replyTo: email
  });
}

async function nuevoPedidoAdmin(pedido) {
  if (!MAIL_INTERNO()) return true;
  const items = await cargarItems(pedido.id);
  const metodoTxt = pedido.metodo_pago === 'transferencia' ? 'Transferencia bancaria' : 'Mercado Pago';
  const html = wrap({
    preHeader: `Nuevo pedido #${pedido.numero} · ${precio(pedido.total)}`,
    titulo: `Nuevo pedido #${pedido.numero}`,
    cuerpoHtml: `
      ${tituloBloque(`Pedido #${pedido.numero}`, `${pedido.nombre}${pedido.apellido ? ' ' + pedido.apellido : ''} · ${metodoTxt}`)}
      <tr><td align="center" style="padding:10px 36px 0">
        ${botonCTA(`https://admin.merfina.uy/#pedidos`, 'Abrir en el panel')}
      </td></tr>
      ${bloqueItems(items, { total: pedido.total })}
      ${bloqueDireccion(pedido)}
      <tr><td style="padding:10px 36px 30px">
        <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276">Contacto</div>
        <div style="font-family:Georgia,serif;font-size:16px;color:#2B251E;line-height:1.5">
          ${esc(pedido.email || '')}<br>${esc(pedido.telefono || '')}
        </div>
      </td></tr>
    `
  });
  return enviar({
    para: MAIL_INTERNO(),
    asunto: `🛍️ Nuevo pedido #${pedido.numero} · ${precio(pedido.total)}`,
    html,
    replyTo: pedido.email || undefined
  });
}

async function pedidoConfirmado(pedido) {
  if (!pedido.email) return true;
  const items = await cargarItems(pedido.id);
  const html = wrap({
    preHeader: `Confirmamos tu pedido #${pedido.numero}`,
    titulo: `Pedido #${pedido.numero} confirmado`,
    cuerpoHtml: `
      ${tituloBloque('Gracias, ' + (pedido.nombre || '') + '.', 'Tu pedido quedó confirmado. Lo estamos preparando con cariño.')}
      <tr><td align="center" style="padding:6px 36px 0">
        <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276">Número de pedido</div>
        <div style="font-family:Georgia,serif;font-size:32px;color:#141210;margin:6px 0 10px">#${pedido.numero}</div>
      </td></tr>
      ${bloqueItems(items, { total: pedido.total })}
      ${bloqueDireccion(pedido)}
      <tr><td align="center" style="padding:10px 36px 30px">
        <div style="font-family:Georgia,serif;font-style:italic;color:#6a6054;font-size:16px;line-height:1.6">
          Te vamos a avisar por este mismo correo cuando el envío esté en camino.
        </div>
        ${botonCTA('https://wa.me/59891900341', 'Hablar con nosotros')}
      </td></tr>
    `
  });
  return enviar({
    para: pedido.email,
    asunto: `Merfina · Confirmamos tu pedido #${pedido.numero}`,
    html,
    replyTo: MAIL_INTERNO() || undefined
  });
}

async function pedidoPreparando(pedido) {
  if (!pedido.email) return true;
  const html = wrap({
    preHeader: `Estamos preparando tu pedido #${pedido.numero}`,
    titulo: `Preparando #${pedido.numero}`,
    cuerpoHtml: `
      ${tituloBloque('Ya la estamos preparando.', 'Tu pedido está en nuestras manos. Pronto va a salir hacia vos.')}
      <tr><td align="center" style="padding:0 36px 30px">
        <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276;margin-top:16px">Pedido</div>
        <div style="font-family:Georgia,serif;font-size:28px;color:#141210;margin:6px 0 0">#${pedido.numero}</div>
        <div style="font-family:Georgia,serif;font-style:italic;color:#6a6054;font-size:16px;line-height:1.6;margin-top:18px;max-width:420px">
          Cada pieza es revisada a mano antes de salir. Te escribimos de vuelta cuando esté en camino.
        </div>
      </td></tr>
    `
  });
  return enviar({
    para: pedido.email,
    asunto: `Merfina · Preparando tu pedido #${pedido.numero}`,
    html,
    replyTo: MAIL_INTERNO() || undefined
  });
}

async function pedidoEnviado(pedido) {
  if (!pedido.email) return true;
  const tracking = (pedido.tracking || '').trim();
  const tipoTxt = pedido.envio_tipo === 'interior'
    ? (pedido.envio_modalidad === 'agencia' ? 'Retiro en agencia DAC' : 'Envío al interior a domicilio')
    : 'Envío a Montevideo';

  const html = wrap({
    preHeader: `Tu pedido #${pedido.numero} está en camino`,
    titulo: `Pedido #${pedido.numero} en camino`,
    cuerpoHtml: `
      ${tituloBloque('Tu pedido va en camino.', 'Lo despachamos hoy. En breve va a estar en tus manos.')}
      <tr><td align="center" style="padding:6px 36px 0">
        <div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276">Pedido</div>
        <div style="font-family:Georgia,serif;font-size:28px;color:#141210;margin:6px 0 0">#${pedido.numero}</div>
      </td></tr>
      ${tracking ? `
      <tr><td align="center" style="padding:24px 36px 0">
        <div style="background:#FBF7F0;border:1px solid #e6ddcf;padding:22px 24px;display:inline-block;text-align:left;min-width:280px">
          <div style="font-size:10.5px;letter-spacing:.3em;text-transform:uppercase;color:#8a8276">Nº de seguimiento</div>
          <div style="font-family:Georgia,serif;font-size:22px;color:#141210;margin:6px 0">${esc(tracking)}</div>
          <div style="font-size:12px;color:#8a8276;font-family:Georgia,serif;font-style:italic">${esc(tipoTxt)}</div>
        </div>
      </td></tr>` : ''}
      <tr><td align="center" style="padding:24px 36px 30px">
        <div style="font-family:Georgia,serif;font-style:italic;color:#6a6054;font-size:16px;line-height:1.6;max-width:420px">
          Si tenés dudas sobre el envío, escribinos por WhatsApp.
        </div>
        ${botonCTA('https://wa.me/59891900341', 'Escribirnos')}
      </td></tr>
    `
  });
  return enviar({
    para: pedido.email,
    asunto: `Merfina · Pedido #${pedido.numero} en camino` + (tracking ? ` (${tracking})` : ''),
    html,
    replyTo: MAIL_INTERNO() || undefined
  });
}

async function pedidoEntregado(pedido) {
  if (!pedido.email) return true;
  const html = wrap({
    preHeader: `Tu pedido #${pedido.numero} fue entregado`,
    titulo: `Pedido #${pedido.numero} entregado`,
    cuerpoHtml: `
      ${tituloBloque('Llegó.', 'Gracias por elegirnos para transformar tu look.')}
      <tr><td align="center" style="padding:6px 36px 20px">
        <div style="font-family:Georgia,serif;font-style:italic;color:#6a6054;font-size:17px;line-height:1.7;max-width:420px">
          Si querés, etiquetanos en Instagram como <a href="https://instagram.com/merfinajoyas" style="color:#8F7349">@merfinajoyas</a>.
          Nos encanta ver cómo las llevan.
        </div>
      </td></tr>
      <tr><td align="center" style="padding:10px 36px 30px">
        ${botonCTA('https://instagram.com/merfinajoyas', 'Seguinos en Instagram')}
      </td></tr>
    `
  });
  return enviar({
    para: pedido.email,
    asunto: `Merfina · ¿Llegó tu pedido #${pedido.numero}?`,
    html,
    replyTo: MAIL_INTERNO() || undefined
  });
}

module.exports = {
  enviar,
  contacto,
  nuevoPedidoAdmin,
  pedidoConfirmado,
  pedidoPreparando,
  pedidoEnviado,
  pedidoEntregado
};
