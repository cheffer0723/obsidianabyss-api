import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl
    })
  : null;

export function isDatabaseConfigured() {
  return Boolean(pool);
}

export async function initializeDatabase() {
  if (!pool) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_beta_requests (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      wallet_address TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function createContactRequest({ name, email, message }) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      INSERT INTO contact_requests (name, email, message)
      VALUES ($1, $2, $3)
      RETURNING id, created_at;
    `,
    [name, email, message]
  );

  return result.rows[0];
}

export async function createWalletBetaRequest({ name, email, walletAddress, notes }) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      INSERT INTO wallet_beta_requests (name, email, wallet_address, notes)
      VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''))
      RETURNING id, created_at;
    `,
    [name, email, walletAddress || '', notes || '']
  );

  return result.rows[0];
}

function assertDatabaseConfigured() {
  if (!pool) {
    const error = new Error('Database is not configured');
    error.statusCode = 503;
    throw error;
  }
}
