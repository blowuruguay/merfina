/**
 * Panel de Merfina — rutas protegidas por JWT.
 *
 * Todas cuelgan de /api/admin y exigen token válido. Secciones:
 *   /resumen             métricas del dashboard
 *   /productos           CRUD completo
 *   /categorias          lista y edición
 *   /pedidos             listar, ver, cambiar estado, agregar notas
 *   /contactos           listar, marcar leído, borrar
 *   /newsletter          listar, exportar, borrar
 *   /ajustes             leer y actualizar
 */
const express = require('express');
const db = require('../db');
const { exigirToken, exigirDueño } = require('../middleware/auth');

const router = express.Router();
router.use(exigirToken);

// ============================================================
// RESUMEN
// ============================================================
router.get('/resumen', async (req, res) => {
  try {
    const [p, pdd, ctt, nws, bajo] = await Promise.all([
      db.query(`select count(*)::int as n from productos where activo = true`),
      db.query(`select count(*)::int as n from pedidos where estado in ('consulta','confirmado')`),
      db.query(`select count(*)::int as n from contactos where leido = false`),
      db.query(`select count(*)::int as n from newsletter where activo = true`),
      db.query(`select id, slug, nombre, stock from productos
                where activo = true and stock <= 2
                order by stock asc limit 5`)
    ]);
    res.json({
      productos:     p.rows[0].n,
      pedidos_abiertos: pdd.rows[0].n,
      contactos_sin_leer: ctt.rows[0].n,
      newsletter: nws.rows[0].n,
      stock_bajo: bajo.rows
    });
  } catch (err) {
    console.error('Error en resumen', err);
    res.status(500).json({ error: 'No pudimos cargar el resumen' });
  }
});

// ============================================================
// PRODUCTOS
// ============================================================
router.get('/productos', async (req, res) => {
  try {
    const { rows } = await db.query(
      `select p.id, p.slug, p.nombre, p.categoria_id, p.precio, p.precio_antes,
              p.stock, p.destacado, p.activo, p.creado_en,
              (select url from producto_imagenes
                where producto_id = p.id order by orden limit 1) as portada
         from productos p
        order by p.creado_en desc`);
    res.json({ productos: rows });
  } catch (err) {
    console.error('Error listando productos', err);
    res.status(500).json({ error: 'No pudimos cargar los productos' });
  }
});

router.get('/productos/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `select p.*,
              coalesce(
                (select json_agg(json_build_object('id', i.id, 'url', i.url, 'alt', i.alt, 'orden', i.orden)
                                 order by i.orden)
                   from producto_imagenes i where i.producto_id = p.id),
                '[]'::json
              ) as imagenes
         from productos p where p.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No existe' });
    res.json({ producto: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos cargar el producto' });
  }
});

router.post('/productos', async (req, res) => {
  const d = req.body || {};
  const slug = slugificar(d.slug || d.nombre || '');
  if (!slug || !d.nombre) return res.status(400).json({ error: 'Faltan slug y nombre' });

  try {
    const { rows } = await db.query(
      `insert into productos (slug, nombre, categoria_id, precio, precio_antes,
                              descripcion, materiales, medidas, stock, destacado, activo,
                              meta_titulo, meta_desc)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,true),$12,$13)
       returning id`,
      [slug, d.nombre, d.categoria_id || null,
       int(d.precio), d.precio_antes ? int(d.precio_antes) : null,
       d.descripcion || null, d.materiales || null, d.medidas || null,
       int(d.stock) || 0, !!d.destacado, d.activo,
       d.meta_titulo || null, d.meta_desc || null]);
    res.json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un producto con ese slug' });
    console.error('Error creando producto', err);
    res.status(500).json({ error: 'No pudimos crear el producto' });
  }
});

router.put('/productos/:id', async (req, res) => {
  const d = req.body || {};
  try {
    const { rowCount } = await db.query(
      `update productos set
         slug = coalesce($2, slug),
         nombre = coalesce($3, nombre),
         categoria_id = $4,
         precio = coalesce($5, precio),
         precio_antes = $6,
         descripcion = $7,
         materiales = $8,
         medidas = $9,
         stock = coalesce($10, stock),
         destacado = coalesce($11, destacado),
         activo = coalesce($12, activo),
         meta_titulo = $13,
         meta_desc = $14
       where id = $1`,
      [req.params.id,
       d.slug ? slugificar(d.slug) : null,
       d.nombre || null,
       d.categoria_id || null,
       d.precio != null ? int(d.precio) : null,
       d.precio_antes ? int(d.precio_antes) : null,
       d.descripcion ?? null, d.materiales ?? null, d.medidas ?? null,
       d.stock != null ? int(d.stock) : null,
       d.destacado != null ? !!d.destacado : null,
       d.activo != null ? !!d.activo : null,
       d.meta_titulo ?? null, d.meta_desc ?? null]);
    if (!rowCount) return res.status(404).json({ error: 'No existe' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya hay otro producto con ese slug' });
    console.error('Error actualizando producto', err);
    res.status(500).json({ error: 'No pudimos guardar' });
  }
});

router.delete('/productos/:id', async (req, res) => {
  try {
    await db.query(`delete from productos where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos borrar' });
  }
});

// ---------- IMÁGENES ----------
router.post('/productos/:id/imagenes', async (req, res) => {
  const { url, alt, orden } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Falta la URL' });
  try {
    const { rows } = await db.query(
      `insert into producto_imagenes (producto_id, url, alt, orden)
       values ($1, $2, $3, coalesce($4, 0)) returning id`,
      [req.params.id, url, alt || null, int(orden) || 0]);
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos agregar la imagen' });
  }
});

router.delete('/imagenes/:id', async (req, res) => {
  try {
    await db.query(`delete from producto_imagenes where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos borrar la imagen' });
  }
});

// ============================================================
// CATEGORÍAS
// ============================================================
router.get('/categorias', async (req, res) => {
  const { rows } = await db.query(
    `select id, nombre, descripcion, imagen, orden, activa,
            (select count(*) from productos where categoria_id = c.id)::int as productos
       from categorias c order by orden`);
  res.json({ categorias: rows });
});

router.post('/categorias', async (req, res) => {
  const d = req.body || {};
  const id = slugificar(d.id || d.nombre || '');
  if (!id || !d.nombre) return res.status(400).json({ error: 'Faltan id y nombre' });
  try {
    await db.query(
      `insert into categorias (id, nombre, descripcion, imagen, orden, activa)
       values ($1,$2,$3,$4,coalesce($5,0),coalesce($6,true))`,
      [id, d.nombre, d.descripcion || null, d.imagen || null, int(d.orden), d.activa]);
    res.json({ id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esa categoría ya existe' });
    res.status(500).json({ error: 'No pudimos crear' });
  }
});

router.put('/categorias/:id', async (req, res) => {
  const d = req.body || {};
  try {
    await db.query(
      `update categorias set
         nombre = coalesce($2, nombre),
         descripcion = $3, imagen = $4,
         orden = coalesce($5, orden),
         activa = coalesce($6, activa)
       where id = $1`,
      [req.params.id, d.nombre || null, d.descripcion ?? null, d.imagen ?? null,
       d.orden != null ? int(d.orden) : null,
       d.activa != null ? !!d.activa : null]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos guardar' });
  }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    await db.query(`delete from categorias where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos borrar' });
  }
});

// ============================================================
// PEDIDOS
// ============================================================
router.get('/pedidos', async (req, res) => {
  const estado = req.query.estado;
  try {
    const where = estado ? `where estado = $1` : '';
    const params = estado ? [estado] : [];
    const { rows } = await db.query(
      `select id, numero, estado, nombre, apellido, email, telefono,
              envio_tipo, total, canal, creado_en
         from pedidos ${where}
        order by creado_en desc limit 200`, params);
    res.json({ pedidos: rows });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos cargar los pedidos' });
  }
});

router.get('/pedidos/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `select p.*,
              coalesce(
                (select json_agg(json_build_object(
                           'id', i.id, 'producto_id', i.producto_id,
                           'nombre', i.nombre, 'precio_unit', i.precio_unit,
                           'cantidad', i.cantidad, 'imagen', i.imagen))
                   from pedido_items i where i.pedido_id = p.id),
                '[]'::json
              ) as items
         from pedidos p where p.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No existe' });
    res.json({ pedido: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos cargar el pedido' });
  }
});

router.put('/pedidos/:id', async (req, res) => {
  const d = req.body || {};
  const estadosOk = ['consulta','confirmado','pagado','enviado','entregado','cancelado'];
  if (d.estado && !estadosOk.includes(d.estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    await db.query(
      `update pedidos set
         estado = coalesce($2, estado),
         notas_internas = coalesce($3, notas_internas),
         confirmado_en = case when $2 = 'confirmado' and confirmado_en is null then now() else confirmado_en end,
         pagado_en     = case when $2 = 'pagado'     and pagado_en     is null then now() else pagado_en     end,
         enviado_en    = case when $2 = 'enviado'    and enviado_en    is null then now() else enviado_en    end
       where id = $1`,
      [req.params.id, d.estado || null, d.notas_internas ?? null]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando pedido', err);
    res.status(500).json({ error: 'No pudimos guardar' });
  }
});

// Crear pedido manual desde el panel (típico WhatsApp / Instagram)
router.post('/pedidos', async (req, res) => {
  const d = req.body || {};
  if (!d.nombre || !d.telefono) {
    return res.status(400).json({ error: 'Faltan nombre y teléfono' });
  }
  const items = Array.isArray(d.items) ? d.items : [];

  try {
    const r = await db.transaccion(async cli => {
      const subtotal = items.reduce((s, it) => s + (int(it.precio_unit) * int(it.cantidad || 1)), 0);
      const envio_costo = int(d.envio_costo) || 0;
      const total = subtotal + envio_costo;

      const { rows } = await cli.query(
        `insert into pedidos (estado, nombre, apellido, email, telefono, documento,
                              envio_tipo, direccion, nota,
                              subtotal, envio_costo, total, canal, notas_internas)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         returning id, numero`,
        [d.estado || 'confirmado', d.nombre, d.apellido || null, d.email || null,
         d.telefono, d.documento || null,
         d.envio_tipo || null, d.direccion || null, d.nota || null,
         subtotal, envio_costo, total,
         d.canal || 'whatsapp', d.notas_internas || null]);

      const pedido_id = rows[0].id;
      for (const it of items) {
        await cli.query(
          `insert into pedido_items (pedido_id, producto_id, nombre, precio_unit, cantidad, imagen)
           values ($1,$2,$3,$4,$5,$6)`,
          [pedido_id, it.producto_id || null, it.nombre,
           int(it.precio_unit), int(it.cantidad) || 1, it.imagen || null]);
      }
      return { id: pedido_id, numero: rows[0].numero };
    });
    res.json(r);
  } catch (err) {
    console.error('Error creando pedido', err);
    res.status(500).json({ error: 'No pudimos crear el pedido' });
  }
});

router.delete('/pedidos/:id', async (req, res) => {
  try {
    await db.query(`delete from pedidos where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos borrar' });
  }
});

// ============================================================
// CONTACTOS
// ============================================================
router.get('/contactos', async (req, res) => {
  const { rows } = await db.query(
    `select id, nombre, email, telefono, asunto, mensaje, leido, creado_en
       from contactos order by creado_en desc limit 500`);
  res.json({ contactos: rows });
});

router.put('/contactos/:id', async (req, res) => {
  try {
    await db.query(`update contactos set leido = $2 where id = $1`,
      [req.params.id, !!req.body?.leido]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos guardar' });
  }
});

router.delete('/contactos/:id', async (req, res) => {
  try {
    await db.query(`delete from contactos where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos borrar' });
  }
});

// ============================================================
// NEWSLETTER
// ============================================================
router.get('/newsletter', async (req, res) => {
  const { rows } = await db.query(
    `select id, email, activo, origen, creado_en, baja_en
       from newsletter order by creado_en desc limit 2000`);
  res.json({ suscriptos: rows });
});

router.get('/newsletter.csv', async (req, res) => {
  const { rows } = await db.query(
    `select email, origen, creado_en from newsletter where activo = true
      order by creado_en desc`);
  const csv = ['email,origen,fecha', ...rows.map(r =>
    `${r.email},${r.origen || ''},${r.creado_en.toISOString()}`)].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="newsletter-merfina.csv"');
  res.send(csv);
});

router.delete('/newsletter/:id', async (req, res) => {
  try {
    await db.query(`delete from newsletter where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos borrar' });
  }
});

// ============================================================
// AJUSTES (dueño)
// ============================================================
router.get('/ajustes', async (req, res) => {
  const { rows } = await db.query(`select clave, valor from ajustes`);
  res.json({ ajustes: Object.fromEntries(rows.map(r => [r.clave, r.valor])) });
});

router.put('/ajustes', exigirDueño, async (req, res) => {
  const ajustes = req.body?.ajustes || {};
  try {
    await db.transaccion(async cli => {
      for (const [clave, valor] of Object.entries(ajustes)) {
        await cli.query(
          `insert into ajustes (clave, valor) values ($1, $2)
           on conflict (clave) do update set valor = excluded.valor`,
          [clave, JSON.stringify(valor)]);
      }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error guardando ajustes', err);
    res.status(500).json({ error: 'No pudimos guardar' });
  }
});

// ============================================================
// USUARIOS (dueño)
// ============================================================
router.get('/usuarios', exigirDueño, async (req, res) => {
  const { rows } = await db.query(
    `select id, email, nombre, rol, activo, ultimo_ingreso, creado_en
       from usuarios order by creado_en`);
  res.json({ usuarios: rows });
});

router.post('/usuarios', exigirDueño, async (req, res) => {
  const bcrypt = require('bcryptjs');
  const d = req.body || {};
  const email = String(d.email || '').trim().toLowerCase();
  const password = String(d.password || '');
  if (!email || password.length < 10) {
    return res.status(400).json({ error: 'Email y contraseña de al menos 10 caracteres' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `insert into usuarios (email, password, nombre, rol)
       values ($1,$2,$3,coalesce($4,'operador')) returning id`,
      [email, hash, d.nombre || null, d.rol || null]);
    res.json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    res.status(500).json({ error: 'No pudimos crear el usuario' });
  }
});

router.put('/usuarios/:id', exigirDueño, async (req, res) => {
  const d = req.body || {};
  try {
    await db.query(
      `update usuarios set
         nombre = coalesce($2, nombre),
         rol    = coalesce($3, rol),
         activo = coalesce($4, activo)
       where id = $1`,
      [req.params.id, d.nombre || null, d.rol || null,
       d.activo != null ? !!d.activo : null]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos guardar' });
  }
});

// ============================================================
// Helpers
// ============================================================
function int(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function slugificar(s) {
  return String(s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

module.exports = router;
