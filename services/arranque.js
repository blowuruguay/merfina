/**
 * Arranque automático.
 *
 * Corre una sola vez cada vez que el servidor levanta y hace lo que
 * normalmente se haría a mano:
 *   1. Si no existen las tablas, corre migrations/001_inicial.sql
 *   2. Si hay ADMIN_EMAIL y ADMIN_PASSWORD, crea o actualiza ese usuario
 *
 * Todo idempotente: si ya está hecho, sigue de largo.
 * Si algo falla, lo deja en el log pero NO tumba el servidor.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');

const estado = { ok: null, terminado: false, error: null };

async function importarCatalogo() {
  const { rows } = await db.query(`select count(*)::int as n from productos`);
  if (rows[0].n > 0) {
    console.log(`[arranque] Ya hay ${rows[0].n} productos, no se importa nada`);
    return;
  }
  const ruta = path.join(__dirname, '../tools/catalogo-inicial.json');
  if (!fs.existsSync(ruta)) {
    console.log('[arranque] No hay catalogo-inicial.json, salteo');
    return;
  }
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  console.log(`[arranque] Importando ${datos.length} productos...`);
  for (const p of datos) {
    await db.transaccion(async cli => {
      const { rows: r } = await cli.query(
        `insert into productos (slug, nombre, categoria_id, precio, descripcion,
                                materiales, medidas, stock, destacado, activo)
         values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9,false),coalesce($10,true))
         returning id`,
        [p.slug, p.nombre, p.categoria_id, p.precio || 0, p.descripcion || null,
         p.materiales || null, p.medidas || null, p.stock || 1,
         p.destacado, p.activo]);
      const id = r[0].id;
      for (let i = 0; i < (p.imagenes || []).length; i++) {
        await cli.query(
          `insert into producto_imagenes (producto_id, url, alt, orden)
           values ($1,$2,$3,$4)`,
          [id, p.imagenes[i], p.nombre, i]);
      }
    });
  }
  console.log(`[arranque] Catálogo importado: ${datos.length} productos`);
}

async function tablasCreadas() {
  const { rows } = await db.query(
    `select exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'productos'
     ) as hay`
  );
  return rows[0].hay;
}

async function migrar() {
  if (await tablasCreadas()) {
    console.log('[arranque] Las tablas ya existen, no se migra');
    return;
  }

  console.log('[arranque] Base vacía: creando las tablas...');
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/001_inicial.sql'), 'utf8');
  await db.query(sql);

  const { rows } = await db.query(`select count(*)::int as n from categorias`);
  console.log(`[arranque] Tablas creadas. Categorías: ${rows[0].n}`);
}

async function crearAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.log('[arranque] Sin ADMIN_EMAIL/ADMIN_PASSWORD: no se toca ningún usuario');
    return;
  }
  if (password.length < 8) {
    console.warn('[arranque] ADMIN_PASSWORD tiene menos de 8 caracteres: usuario NO creado');
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `insert into usuarios (email, password, nombre, rol)
     values ($1, $2, $3, 'dueño')
     on conflict (email) do update
       set password = excluded.password, activo = true
     returning email`,
    [email, hash, process.env.ADMIN_NOMBRE || 'Merfina']
  );
  console.log(`[arranque] Usuario del panel listo: ${rows[0].email}`);
}

async function sincronizarDescripciones() {
  // Para los productos del seed inicial que ya están en la base con
  // descripción vacía, les carga la descripción del catalogo-inicial.json.
  // Idempotente: solo actualiza cuando descripción es NULL o cadena vacía.
  const ruta = path.join(__dirname, '../tools/catalogo-inicial.json');
  if (!fs.existsSync(ruta)) return;
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));

  let actualizados = 0;
  for (const p of datos) {
    if (!p.descripcion) continue;
    const r = await db.query(
      `update productos
          set descripcion = $1
        where slug = $2
          and (descripcion is null or descripcion = '')`,
      [p.descripcion, p.slug]);
    if (r.rowCount > 0) actualizados++;
  }
  if (actualizados > 0) {
    console.log(`[arranque] Descripciones sincronizadas: ${actualizados}`);
  }
}

async function limpiarCategorias() {
  // Idempotente: solo actúa si las tablas existen y hace falta.
  try {
    // Renombra "Corbatas joya" a "Corbatas" si quedó así del seed viejo
    await db.query(
      `update categorias set nombre = 'Corbatas'
         where id = 'corbatas' and nombre <> 'Corbatas'`);
    // Borra la categoría 'otros' si existe y no tiene productos asociados
    const { rows } = await db.query(
      `select exists(
         select 1 from categorias where id = 'otros'
       ) as hay`);
    if (rows[0].hay) {
      const { rows: prodRows } = await db.query(
        `select count(*)::int as n from productos where categoria_id = 'otros'`);
      if (prodRows[0].n === 0) {
        await db.query(`delete from categorias where id = 'otros'`);
        console.log('[arranque] Categoría "otros" eliminada');
      }
    }
  } catch (err) {
    console.log('[arranque] limpieza de categorías saltada:', err.message);
  }
}

async function preparar() {
  try {
    await migrar();
    await crearAdmin();
    await importarCatalogo();
    await limpiarCategorias();
    await sincronizarDescripciones();
    estado.ok = true;
  } catch (err) {
    console.error('[arranque] Falló:', err.message);
    estado.ok = false;
    estado.error = err.message;
  } finally {
    estado.terminado = true;
  }
}

module.exports = { preparar, estado };
