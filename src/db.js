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
      experience_level TEXT,
      access_mode TEXT,
      preferred_assets TEXT,
      preferred_exchange TEXT,
      automation_comfort TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      status_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE contact_requests
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
  `);

  await pool.query(`
    ALTER TABLE contact_requests
    ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE contact_requests
    ADD COLUMN IF NOT EXISTS experience_level TEXT,
    ADD COLUMN IF NOT EXISTS access_mode TEXT,
    ADD COLUMN IF NOT EXISTS preferred_assets TEXT,
    ADD COLUMN IF NOT EXISTS preferred_exchange TEXT,
    ADD COLUMN IF NOT EXISTS automation_comfort TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_beta_requests (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      wallet_address TEXT,
      experience_level TEXT,
      access_mode TEXT,
      preferred_assets TEXT,
      preferred_exchange TEXT,
      automation_comfort TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      status_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE wallet_beta_requests
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
  `);

  await pool.query(`
    ALTER TABLE wallet_beta_requests
    ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE wallet_beta_requests
    ADD COLUMN IF NOT EXISTS experience_level TEXT,
    ADD COLUMN IF NOT EXISTS access_mode TEXT,
    ADD COLUMN IF NOT EXISTS preferred_assets TEXT,
    ADD COLUMN IF NOT EXISTS preferred_exchange TEXT,
    ADD COLUMN IF NOT EXISTS automation_comfort TEXT;
  `);
}

export async function createContactRequest({
  name,
  email,
  message,
  experienceLevel,
  accessMode,
  preferredAssets,
  preferredExchange,
  automationComfort
}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      INSERT INTO contact_requests (
        name,
        email,
        message,
        experience_level,
        access_mode,
        preferred_assets,
        preferred_exchange,
        automation_comfort
      )
      VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''))
      RETURNING id, created_at;
    `,
    [
      name,
      email,
      message,
      experienceLevel || '',
      accessMode || '',
      preferredAssets || '',
      preferredExchange || '',
      automationComfort || ''
    ]
  );

  return result.rows[0];
}

export async function createWalletBetaRequest({
  name,
  email,
  walletAddress,
  notes,
  experienceLevel,
  accessMode,
  preferredAssets,
  preferredExchange,
  automationComfort
}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      INSERT INTO wallet_beta_requests (
        name,
        email,
        wallet_address,
        notes,
        experience_level,
        access_mode,
        preferred_assets,
        preferred_exchange,
        automation_comfort
      )
      VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''))
      RETURNING id, created_at;
    `,
    [
      name,
      email,
      walletAddress || '',
      notes || '',
      experienceLevel || '',
      accessMode || '',
      preferredAssets || '',
      preferredExchange || '',
      automationComfort || ''
    ]
  );

  return result.rows[0];
}

export async function listContactRequests({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT id, name, email, message, status, status_updated_at, created_at
      , experience_level, access_mode, preferred_assets, preferred_exchange, automation_comfort
      FROM contact_requests
      ORDER BY created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function listWalletBetaRequests({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT id, name, email, wallet_address, notes, status, status_updated_at, created_at
      , experience_level, access_mode, preferred_assets, preferred_exchange, automation_comfort
      FROM wallet_beta_requests
      ORDER BY created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function updateContactRequestStatus({ id, status }) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      UPDATE contact_requests
      SET status = $2, status_updated_at = NOW()
      WHERE id = $1
      RETURNING id, status, status_updated_at;
    `,
    [id, status]
  );

  return result.rows[0] || null;
}

export async function updateWalletBetaRequestStatus({ id, status }) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      UPDATE wallet_beta_requests
      SET status = $2, status_updated_at = NOW()
      WHERE id = $1
      RETURNING id, status, status_updated_at;
    `,
    [id, status]
  );

  return result.rows[0] || null;
}

function assertDatabaseConfigured() {
  if (!pool) {
    const error = new Error('Database is not configured');
    error.statusCode = 503;
    throw error;
  }
}
