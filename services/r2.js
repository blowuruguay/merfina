/**
 * Subida de archivos a Cloudflare R2.
 *
 * R2 habla el mismo protocolo que Amazon S3, que exige firmar cada pedido
 * con un algoritmo llamado AWS Signature V4. Está implementado acá a mano
 * con el módulo crypto de Node, sin librerías: el SDK de AWS pesa varios
 * megas y solo necesitamos subir un archivo.
 *
 * Variables de entorno:
 *   R2_ACCOUNT_ID   el número largo del endpoint (90adfb...)
 *   R2_ACCESS_KEY   Access Key ID del token de R2
 *   R2_SECRET_KEY   Secret Access Key
 *   R2_BUCKET       nombre del bucket (merfina-fotos)
 *   R2_URL          dirección pública (https://pub-xxxx.r2.dev)
 */
const crypto = require('crypto');

const CFG = () => ({
  cuenta: process.env.R2_ACCOUNT_ID || '',
  clave: process.env.R2_ACCESS_KEY || '',
  secreto: process.env.R2_SECRET_KEY || '',
  bucket: process.env.R2_BUCKET || 'merfina-fotos',
  publica: (process.env.R2_URL || '').replace(/\/$/, '')
});

/** ¿Está todo configurado para poder subir? */
function configurado() {
  const c = CFG();
  return !!(c.cuenta && c.clave && c.secreto && c.bucket && c.publica);
}

const sha256 = x => crypto.createHash('sha256').update(x).digest('hex');
const hmac = (clave, dato) => crypto.createHmac('sha256', clave).update(dato).digest();

/**
 * Firma y envía un PUT a R2.
 * @param ruta   dónde queda dentro del bucket (2026/05/foto.jpg)
 * @param cuerpo Buffer con el archivo
 * @param tipo   content-type (image/jpeg)
 */
async function subir(ruta, cuerpo, tipo) {
  const c = CFG();
  if (!configurado()) throw new Error('R2 sin configurar');

  const host = `${c.cuenta}.r2.cloudflarestorage.com`;
  const camino = `/${c.bucket}/${ruta.split('/').map(encodeURIComponent).join('/')}`;

  const ahora = new Date();
  const stamp = ahora.toISOString().replace(/[:-]|\.\d{3}/g, '');   // 20260826T170000Z
  const dia = stamp.slice(0, 8);
  const hash = sha256(cuerpo);

  // --- Pedido canónico ---
  /* Cache-Control va FIRMADO, no agregado después.

     La firma de AWS V4 cubre exactamente las cabeceras listadas en
     `firmadas`. Si se manda una cabecera de más sin incluirla ahí, R2
     responde 403 con SignatureDoesNotMatch. Por eso va acá arriba y también
     en la lista de abajo: los dos lugares tienen que coincidir, en orden
     alfabético.

     Un año e `immutable`: las fotos no se pisan, cada subida crea un archivo
     con su propio nombre. Así el navegador de quien ya visitó la tienda no
     vuelve a pedirlas nunca, y Cloudflare las guarda en el borde en vez de ir
     al bucket en Estados Unidos. Sin esta cabecera, cada uno decide por su
     cuenta cuánto guardarlas y suele ser mucho menos. */
  const CACHE = 'public, max-age=31536000, immutable';

  const cabeceras = [
    `cache-control:${CACHE}`,
    `content-type:${tipo}`,
    `host:${host}`,
    `x-amz-content-sha256:${hash}`,
    `x-amz-date:${stamp}`
  ].join('\n');
  const firmadas = 'cache-control;content-type;host;x-amz-content-sha256;x-amz-date';

  const canonico = ['PUT', camino, '', cabeceras, '', firmadas, hash].join('\n');

  // --- Cadena a firmar ---
  const alcance = `${dia}/auto/s3/aws4_request`;
  const aFirmar = ['AWS4-HMAC-SHA256', stamp, alcance, sha256(canonico)].join('\n');

  // --- Clave derivada ---
  let k = hmac('AWS4' + c.secreto, dia);
  k = hmac(k, 'auto');
  k = hmac(k, 's3');
  k = hmac(k, 'aws4_request');
  const firma = crypto.createHmac('sha256', k).update(aFirmar).digest('hex');

  const r = await fetch(`https://${host}${camino}`, {
    method: 'PUT',
    headers: {
      'Cache-Control': CACHE,
      'Content-Type': tipo,
      'x-amz-content-sha256': hash,
      'x-amz-date': stamp,
      Authorization: `AWS4-HMAC-SHA256 Credential=${c.clave}/${alcance}, ` +
                     `SignedHeaders=${firmadas}, Signature=${firma}`
    },
    body: cuerpo
  });

  if (!r.ok) {
    const detalle = await r.text();
    console.error('R2 rechazó la subida:', r.status, detalle.slice(0, 400));
    throw new Error(`R2 respondió ${r.status}`);
  }

  return `${c.publica}/${ruta}`;
}

/** Extensiones que aceptamos, con su content-type. */
const TIPOS = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif'
};

/**
 * Limpia el nombre para que sea una ruta válida y previsible.
 *
 * Importante para restaurar: los archivos que vienen de WordPress ya tienen
 * nombres limpios, así que esta función los deja intactos y la URL guardada
 * en la base sigue coincidiendo. Solo actúa sobre nombres con acentos,
 * espacios o paréntesis, típicos de una foto recién sacada del celular.
 */
function nombreSeguro(nombre) {
  const partes = String(nombre).split('.');
  const ext = partes.length > 1 ? '.' + partes.pop().toLowerCase() : '';
  const base = partes.join('.')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')          // sin guiones sueltos en las puntas
    .slice(0, 110);
  return (base || 'foto') + ext;
}

module.exports = { subir, configurado, TIPOS, nombreSeguro, CFG };
