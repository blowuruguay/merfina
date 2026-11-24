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

async function preparar() {
  try {
    await migrar();
    await crearAdmin();
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
