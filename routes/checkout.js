/**
 * Checkout público:
 *   POST /api/checkout/preferencia    crea pedido + preference de MP o transferencia
 *   GET  /api/checkout/pedido/:id     consulta el estado del pedido
 *   GET  /api/checkout/opciones-envio opciones de envío con costos actuales
 *   GET  /api/checkout/datos-banco    datos de la cuenta para transferencia
 */
const express = require('express');
const db = require('../db');
const mp = require('../services/mercadopago');

const router = express.Router();

const MAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

async function leerAjustes(claves) {
  const { rows } = await db.query(
    `select clave, valor from ajustes where clave = any($1)`, [claves]);
  return Object.fromEntries(rows.map(r => [r.clave, r.valor]));
}

async function ajustesEnvio() {
  const map = await leerAjustes(
    ['envio_montevideo', 'envio_interior', 'envio_gratis_desde']);
  return {
    montevideo:  Number(map.envio_montevideo) || 190,
    interior:    Number(map.envio_interior)   || 290,
    gratisDesde: Number(map.envio_gratis_desde) || 0
  };
}

function costoEnvio(tipo, modalidad, subtotal, aj) {
  if (tipo === 'retiro') return 0;
  // Agencia DAC es un poco más barato que a domicilio en el interior.
  // Dejamos el costo configurable y aplicamos descuento si la agencia
  // está lista para retirar.
  let costo = tipo === 'interior' ? aj.interior : aj.montevideo;
  if (aj.gratisDesde > 0 && subtotal >= aj.gratisDesde) return 0;
  return costo;
}

router.post('/preferencia', async (req, res) => {
  const d = req.body || {};
  const nombre    = String(d.nombre   || '').trim();
  const apellido  = String(d.apellido || '').trim();
  const email     = String(d.email    || '').trim().toLowerCase();
  const telefono  = String(d.telefono || '').trim();
  const documento = String(d.documento|| '').trim();
  const envioTipo = String(d.envio_tipo || '').trim();
  const envioModalidad = String(d.envio_modalidad || '').trim(); // 'domicilio' | 'agencia' | ''
  const metodoPago = String(d.metodo_pago || 'mercadopago').trim();
  const items     = Array.isArray(d.items) ? d.items : [];
  const nota      = String(d.nota || '').slice(0, 500);
  const direccion = d.direccion || null;

  if (!nombre)              return res.status(400).json({ error: 'Escribí tu nombre' });
  if (!MAIL.test(email))    return res.status(400).json({ error: 'Revisá el correo' });
  if (!telefono)            return res.status(400).json({ error: 'Falta el teléfono' });
  if (!['retiro','montevideo','interior'].includes(envioTipo)) {
    return res.status(400).json({ error: 'Elegí un tipo de envío' });
  }
  if (envioTipo === 'interior' && !['domicilio','agencia'].includes(envioModalidad)) {
    return res.status(400).json({ error: 'Elegí si es a domicilio o retiro en agencia' });
  }
  if (!['mercadopago','transferencia'].includes(metodoPago)) {
    return res.status(400).json({ error: 'Elegí un método de pago' });
  }
  if (!items.length)        return res.status(400).json({ error: 'Tu bolsa está vacía' });

  try {
    const slugs = items.map(i => String(i.slug));
    const { rows: productosDB } = await db.query(
      `select id, slug, nombre, precio, stock, activo,
              (select url from producto_imagenes where producto_id = p.id order by orden limit 1) as imagen
         from productos p where slug = any($1)`, [slugs]);

    const pedidoItems = [];
    for (const it of items) {
      const prod = productosDB.find(x => x.slug === it.slug);
      if (!prod || !prod.activo) {
        return res.status(400).json({ error: `La pieza "${it.slug}" ya no está disponible` });
      }
      const cantidad = Math.max(1, Math.min(10, Number(it.cantidad) || 1));
      if (prod.stock < cantidad) {
        return res.status(400).json({ error: `Nos queda menos stock de "${prod.nombre}" del que pediste` });
      }
      pedidoItems.push({
        producto_id: prod.id,
        slug: prod.slug,
        nombre: prod.nombre,
        precio_unit: prod.precio,
        cantidad,
        imagen: prod.imagen
      });
    }

    const subtotal = pedidoItems.reduce((s, i) => s + i.precio_unit * i.cantidad, 0);
    const aj = await ajustesEnvio();
    const envio_costo = costoEnvio(envioTipo, envioModalidad, subtotal, aj);
    const total = subtotal + envio_costo;

    const pedido = await db.transaccion(async cli => {
      const { rows } = await cli.query(
        `insert into pedidos (estado, nombre, apellido, email, telefono, documento,
                              envio_tipo, envio_modalidad, direccion, nota,
                              subtotal, envio_costo, total, canal, metodo_pago)
         values ('consulta',$1,$2,$3,$4,nullif($5,''),$6,nullif($7,''),$8::jsonb,nullif($9,''),$10,$11,$12,'web',$13)
         returning id, numero`,
        [nombre, apellido || null, email, telefono, documento,
         envioTipo, envioModalidad,
         direccion ? JSON.stringify(direccion) : null, nota,
         subtotal, envio_costo, total, metodoPago]);
      const pedido = rows[0];
      for (const it of pedidoItems) {
        await cli.query(
          `insert into pedido_items (pedido_id, producto_id, nombre, precio_unit, cantidad, imagen)
           values ($1,$2,$3,$4,$5,$6)`,
          [pedido.id, it.producto_id, it.nombre, it.precio_unit, it.cantidad, it.imagen]);
      }
      return pedido;
    });

    // Transferencia: no vamos a MP, respondemos redirect a página con datos del banco
    if (metodoPago === 'transferencia') {
      return res.json({
        pedido_id: pedido.id, pedido_numero: pedido.numero,
        subtotal, envio_costo, total,
        metodo_pago: 'transferencia',
        redirect: `/pedido/transferencia?id=${pedido.id}`
      });
    }

    // Mercado Pago
    if (!mp.configurado()) {
      // Sin MP: fallback a WhatsApp con resumen
      return res.json({
        pedido_id: pedido.id, pedido_numero: pedido.numero,
        subtotal, envio_costo, total,
        sin_mp: true
      });
    }

    const pref = await mp.crearPreference({
      items: pedidoItems,
      pedido: { id: pedido.id, envio_tipo: envioTipo, envio_costo },
      nombre, apellido, email, telefono
    });

    await db.query(
      `update pedidos set notas_internas = coalesce(notas_internas,'') || $2
         where id = $1`,
      [pedido.id, `\n[MP preference ${pref.id}]`]);

    res.json({
      pedido_id: pedido.id, pedido_numero: pedido.numero,
      subtotal, envio_costo, total,
      metodo_pago: 'mercadopago',
      preference_id: pref.id,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point
    });
  } catch (err) {
    console.error('[checkout]', err);
    res.status(500).json({ error: err.message || 'No pudimos crear el pedido' });
  }
});

router.get('/pedido/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `select id, numero, estado, total, subtotal, envio_costo,
              nombre, email, metodo_pago
         from pedidos where id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No existe' });
    res.json({ pedido: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos cargar el pedido' });
  }
});

router.get('/opciones-envio', async (req, res) => {
  try {
    const aj = await ajustesEnvio();
    res.json({
      opciones: [
        { id: 'retiro',     nombre: 'Retiro en showroom', detalle: 'Coordinamos por WhatsApp',       costo: 0 },
        { id: 'montevideo', nombre: 'Envío a Montevideo', detalle: '1 a 2 días hábiles',             costo: aj.montevideo },
        { id: 'interior',   nombre: 'Envío al interior',  detalle: 'Agencia DAC o domicilio, 1 a 3 días hábiles', costo: aj.interior }
      ],
      gratisDesde: aj.gratisDesde
    });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos cargar las opciones' });
  }
});

router.get('/datos-banco', async (req, res) => {
  try {
    const d = await leerAjustes(
      ['banco_nombre','banco_titular','banco_cuenta','banco_sucursal','banco_rut','banco_email']);
    res.json({
      banco:    d.banco_nombre   || 'Itaú',
      titular:  d.banco_titular  || 'Merfina Joyas',
      cuenta:   d.banco_cuenta   || '—',
      sucursal: d.banco_sucursal || '',
      rut:      d.banco_rut      || '',
      email:    d.banco_email    || ''
    });
  } catch (err) {
    res.status(500).json({ error: 'No pudimos cargar los datos' });
  }
});

module.exports = router;
