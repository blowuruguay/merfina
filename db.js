/**
 * Conexión a Postgres.
 * Railway inyecta DATABASE_URL cuando el servicio Postgres está en el
 * mismo proyecto que la aplicación.
 */
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Agregá Postgres al proyecto en Railway.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', err => console.error('Error inesperado del pool', err));

async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = {
  query: (texto, params) => pool.query(texto, params),
  transaccion,
  pool
};
