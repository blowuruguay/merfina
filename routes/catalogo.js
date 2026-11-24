/**
 * GET /api/catalogo           catálogo público para la tienda
 * GET /api/catalogo/:slug     ficha de un producto
 * GET /api/catalogo/ajustes   ajustes públicos (whatsapp, email, envíos)
 */
const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows: categorias } = await db.query(
      `select id, nombre, descripcion, imagen, orden
         from categorias
        where activa = true
        order by orden`);

    const { rows: productos } = await db.query(
      `select p.id, p.slug, p.nombre, p.categoria_id, p.precio, p.precio_antes,
              p.descripcion, p.materiales, p.medidas, p.stock, p.destacado,
              coalesce(
                (select json_agg(json_build_object('url', i.url, 'alt', i.alt)
                                 order by i.orden)
                   from producto_imagenes i where i.producto_id = p.id),
                '[]'::json
              ) as imagenes
         from productos p
        where p.activo = true
        order by p.destacado desc, p.creado_en desc`);

    const { rows: ajustesRows } = await db.query(`select clave, valor from ajustes`);
    const ajustes = Object.fromEntries(ajustesRows.map(a => [a.clave, a.valor]));

    res.json({ categorias, productos, ajustes });
  } catch (err) {
    console.error('Error cargando el catálogo', err);
    res.status(500).json({ error: 'No pudimos cargar el catálogo' });
  }
});

router.get('/ajustes', async (req, res) => {
  try {
    const { rows } = await db.query(`select clave, valor from ajustes`);
    const ajustes = Object.fromEntries(rows.map(a => [a.clave, a.valor]));
    res.json({ ajustes });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos cargar los ajustes' });
  }
});

router.get('/:slug', async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  try {
    const { rows } = await db.query(
      `select p.*,
              coalesce(
                (select json_agg(json_build_object('url', i.url, 'alt', i.alt)
                                 order by i.orden)
                   from producto_imagenes i where i.producto_id = p.id),
                '[]'::json
              ) as imagenes
         from productos p
        where p.slug = $1 and p.activo = true`, [slug]);

    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ producto: rows[0] });
  } catch (err) {
    console.error('Error cargando el producto', err);
    res.status(500).json({ error: 'No pudimos cargar el producto' });
  }
});

module.exports = router;
