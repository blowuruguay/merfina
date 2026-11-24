/**
 * Subida de imágenes desde el panel a Cloudflare R2.
 *
 *   GET  /api/admin/imagenes/estado   ¿está R2 configurado?
 *   POST /api/admin/imagenes          sube un archivo y devuelve su URL
 *
 * El archivo llega en base64 dentro del JSON. Es menos eficiente que un
 * envío binario, pero evita sumar una dependencia para parsear formularios
 * y a esta escala (fotos de joyas) no se nota.
 */
const express = require('express');
const r2 = require('../services/r2');
const { exigirToken } = require('../middleware/auth');

const router = express.Router();
router.use(exigirToken);

const MAX_BYTES = 8 * 1024 * 1024;   // 8 MB por foto

router.get('/estado', (req, res) => {
  const c = r2.CFG();
  res.json({
    configurado: r2.configurado(),
    bucket: c.bucket,
    publica: c.publica,
    falta: r2.configurado() ? [] : [
      !c.cuenta && 'R2_ACCOUNT_ID',
      !c.clave && 'R2_ACCESS_KEY',
      !c.secreto && 'R2_SECRET_KEY',
      !c.publica && 'R2_URL'
    ].filter(Boolean)
  });
});

router.post('/', async (req, res) => {
  try {
    if (!r2.configurado()) {
      return res.status(503).json({ error: 'Falta configurar Cloudflare R2 en Railway' });
    }

    const { nombre, datos, carpeta } = req.body || {};
    if (!nombre || !datos) return res.status(400).json({ error: 'Falta el archivo' });

    const ext = String(nombre).split('.').pop().toLowerCase();
    const tipo = r2.TIPOS[ext];
    if (!tipo) {
      return res.status(400).json({ error: 'Solo aceptamos JPG, PNG, WEBP, GIF o AVIF' });
    }

    // data:image/jpeg;base64,XXXX → XXXX
    const limpio = String(datos).includes(',') ? String(datos).split(',')[1] : String(datos);
    const buffer = Buffer.from(limpio, 'base64');

    if (!buffer.length) return res.status(400).json({ error: 'El archivo llegó vacío' });
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'La imagen supera los 8 MB. Reducila y probá de nuevo.' });
    }

    const hoy = new Date();
    const porDefecto = `${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const dir = /^[\w-]+(\/[\w-]+)*$/.test(carpeta || '') ? carpeta : porDefecto;

    const archivo = r2.nombreSeguro(nombre);
    const ruta = `${dir}/${Date.now()}-${archivo}`;

    const url = await r2.subir(ruta, buffer, tipo);
    res.json({ url, bytes: buffer.length });
  } catch (err) {
    console.error('[imagenes] error:', err.message);
    res.status(500).json({ error: 'No pudimos subir la imagen' });
  }
});

module.exports = router;
