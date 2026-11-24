/**
 * Envío de correos.
 *
 * Al inicio NO se envía nada por SMTP: se deja asentado en el log y
 * se guarda en la base (contactos, pedidos). Cuando esté la cuenta de
 * Resend (RESEND_API_KEY + MAIL_DESDE + MAIL_INTERNO), se conecta acá
 * sin tocar el resto del código.
 */
const MAIL_INTERNO = process.env.MAIL_INTERNO || '';
const MAIL_DESDE   = process.env.MAIL_DESDE   || 'Merfina <hola@merfina.uy>';
const CLAVE        = process.env.RESEND_API_KEY || '';

async function enviar({ para, asunto, html, replyTo }) {
  if (!CLAVE || !para) {
    // Sin cuenta configurada: lo dejamos en el log para no perderlo.
    console.log(`[mail] (no enviado) para=${para} asunto="${asunto}"`);
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLAVE}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: MAIL_DESDE,
        to: para,
        subject: asunto,
        html,
        reply_to: replyTo || undefined
      })
    });
    if (!r.ok) {
      console.error(`[mail] Resend falló: ${r.status} ${await r.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mail] error inesperado:', err.message);
    return false;
  }
}

async function contacto({ nombre, email, telefono, asunto, mensaje }) {
  if (!MAIL_INTERNO) {
    console.log(`[mail] contacto sin MAIL_INTERNO: ${nombre} <${email}>`);
    return true; // no bloquear: ya se guardó en la base
  }
  const html = `
    <h2>Nuevo mensaje en merfina.uy</h2>
    <p><strong>Nombre:</strong> ${esc(nombre)}</p>
    <p><strong>Correo:</strong> ${esc(email)}</p>
    ${telefono ? `<p><strong>Teléfono:</strong> ${esc(telefono)}</p>` : ''}
    ${asunto ? `<p><strong>Asunto:</strong> ${esc(asunto)}</p>` : ''}
    <p><strong>Mensaje:</strong></p>
    <p>${esc(mensaje).replace(/\n/g, '<br>')}</p>
  `;
  return enviar({ para: MAIL_INTERNO, asunto: `Merfina — ${asunto || 'consulta nueva'}`, html, replyTo: email });
}

function esc(t) {
  return String(t || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

module.exports = { enviar, contacto };
