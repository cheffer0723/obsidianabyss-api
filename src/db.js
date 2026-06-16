import pg from 'pg';
import { getBaseSepoliaConfig } from './baseSepolia.js';

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
      admin_notes TEXT,
      notes_updated_at TIMESTAMPTZ,
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
    ADD COLUMN IF NOT EXISTS automation_comfort TEXT,
    ADD COLUMN IF NOT EXISTS admin_notes TEXT,
    ADD COLUMN IF NOT EXISTS notes_updated_at TIMESTAMPTZ;
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
      admin_notes TEXT,
      notes_updated_at TIMESTAMPTZ,
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
    ADD COLUMN IF NOT EXISTS automation_comfort TEXT,
    ADD COLUMN IF NOT EXISTS admin_notes TEXT,
    ADD COLUMN IF NOT EXISTS notes_updated_at TIMESTAMPTZ;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS beta_access_members (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'invited',
      access_tier TEXT NOT NULL DEFAULT 'beta-starter',
      source_request_type TEXT,
      source_request_id BIGINT,
      granted_at TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE beta_access_members
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'invited',
    ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'beta-starter',
    ADD COLUMN IF NOT EXISTS source_request_type TEXT,
    ADD COLUMN IF NOT EXISTS source_request_id BIGINT,
    ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS beta_access_invites (
      id BIGSERIAL PRIMARY KEY,
      member_id BIGINT NOT NULL REFERENCES beta_access_members(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL,
      request_id BIGINT NOT NULL,
      email TEXT NOT NULL,
      invite_token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'created',
      expires_at TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ,
      redeemed_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE beta_access_invites
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'created',
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS beta_access_sessions (
      id BIGSERIAL PRIMARY KEY,
      member_id BIGINT NOT NULL REFERENCES beta_access_members(id) ON DELETE CASCADE,
      session_token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE beta_access_sessions
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS strategies (
      id BIGSERIAL PRIMARY KEY,
      strategy_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'simulation',
      status TEXT NOT NULL DEFAULT 'draft',
      assets JSONB NOT NULL DEFAULT '[]'::jsonb,
      rule_type TEXT NOT NULL,
      max_trade_size_usd NUMERIC(14, 2),
      cooldown_minutes INTEGER,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS execution_intents (
      id BIGSERIAL PRIMARY KEY,
      intent_key TEXT NOT NULL UNIQUE,
      strategy_id BIGINT REFERENCES strategies(id) ON DELETE SET NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      notional_usd NUMERIC(14, 2),
      order_type TEXT NOT NULL DEFAULT 'market',
      status TEXT NOT NULL DEFAULT 'simulated',
      expires_at TIMESTAMPTZ,
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS risk_checks (
      id BIGSERIAL PRIMARY KEY,
      intent_id BIGINT REFERENCES execution_intents(id) ON DELETE CASCADE,
      decision TEXT NOT NULL,
      reason TEXT,
      checks JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id BIGSERIAL PRIMARY KEY,
      run_key TEXT NOT NULL UNIQUE,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await seedSimulationScaffold();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS testnet_connectors (
      id BIGSERIAL PRIMARY KEY,
      network_key TEXT NOT NULL UNIQUE,
      network_name TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      rpc_url TEXT NOT NULL,
      explorer_url TEXT,
      wallet_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'configured',
      last_checked_at TIMESTAMPTZ,
      last_block_number BIGINT,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS testnet_balance_checks (
      id BIGSERIAL PRIMARY KEY,
      connector_id BIGINT REFERENCES testnet_connectors(id) ON DELETE SET NULL,
      network_key TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      balance_wei TEXT,
      balance_eth TEXT,
      block_number BIGINT,
      rpc_url TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS testnet_transactions (
      id BIGSERIAL PRIMARY KEY,
      connector_id BIGINT REFERENCES testnet_connectors(id) ON DELETE SET NULL,
      network_key TEXT NOT NULL,
      tx_hash TEXT,
      from_address TEXT,
      to_address TEXT,
      value_wei TEXT,
      value_eth TEXT,
      purpose TEXT,
      status TEXT NOT NULL DEFAULT 'not_enabled',
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await seedTestnetConnector();
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
      message || '',
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
      , experience_level, access_mode, preferred_assets, preferred_exchange, automation_comfort, admin_notes, notes_updated_at
      , beta.beta_member_status, beta.beta_access_tier, beta.beta_member_last_login_at
      , beta.beta_invite_status, beta.beta_invite_sent_at, beta.beta_invite_expires_at, beta.beta_invite_redeemed_at
      FROM contact_requests
      LEFT JOIN LATERAL (
        SELECT
          bam.status AS beta_member_status,
          bam.access_tier AS beta_access_tier,
          bam.last_login_at AS beta_member_last_login_at,
          bai.status AS beta_invite_status,
          bai.sent_at AS beta_invite_sent_at,
          bai.expires_at AS beta_invite_expires_at,
          bai.redeemed_at AS beta_invite_redeemed_at
        FROM beta_access_invites bai
        JOIN beta_access_members bam ON bam.id = bai.member_id
        WHERE bai.request_type = 'contact' AND bai.request_id = contact_requests.id
        ORDER BY bai.created_at DESC
        LIMIT 1
      ) beta ON TRUE
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
      , experience_level, access_mode, preferred_assets, preferred_exchange, automation_comfort, admin_notes, notes_updated_at
      , beta.beta_member_status, beta.beta_access_tier, beta.beta_member_last_login_at
      , beta.beta_invite_status, beta.beta_invite_sent_at, beta.beta_invite_expires_at, beta.beta_invite_redeemed_at
      FROM wallet_beta_requests
      LEFT JOIN LATERAL (
        SELECT
          bam.status AS beta_member_status,
          bam.access_tier AS beta_access_tier,
          bam.last_login_at AS beta_member_last_login_at,
          bai.status AS beta_invite_status,
          bai.sent_at AS beta_invite_sent_at,
          bai.expires_at AS beta_invite_expires_at,
          bai.redeemed_at AS beta_invite_redeemed_at
        FROM beta_access_invites bai
        JOIN beta_access_members bam ON bam.id = bai.member_id
        WHERE bai.request_type = 'wallet' AND bai.request_id = wallet_beta_requests.id
        ORDER BY bai.created_at DESC
        LIMIT 1
      ) beta ON TRUE
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

export async function updateContactRequestNotes({ id, adminNotes }) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      UPDATE contact_requests
      SET admin_notes = NULLIF($2, ''), notes_updated_at = NOW()
      WHERE id = $1
      RETURNING id, admin_notes, notes_updated_at;
    `,
    [id, adminNotes || '']
  );

  return result.rows[0] || null;
}

export async function updateWalletBetaRequestNotes({ id, adminNotes }) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      UPDATE wallet_beta_requests
      SET admin_notes = NULLIF($2, ''), notes_updated_at = NOW()
      WHERE id = $1
      RETURNING id, admin_notes, notes_updated_at;
    `,
    [id, adminNotes || '']
  );

  return result.rows[0] || null;
}

export async function getContactRequestForInvite(id) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT id, name, email, status
      FROM contact_requests
      WHERE id = $1;
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function getWalletBetaRequestForInvite(id) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT id, name, email, status
      FROM wallet_beta_requests
      WHERE id = $1;
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function createBetaAccessInvite({
  requestType,
  requestId,
  name,
  email,
  inviteTokenHash,
  expiresAt
}) {
  assertDatabaseConfigured();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const memberResult = await client.query(
      `
        INSERT INTO beta_access_members (
          email,
          name,
          status,
          access_tier,
          source_request_type,
          source_request_id
        )
        VALUES ($1, $2, 'invited', 'beta-starter', $3, $4)
        ON CONFLICT (email) DO UPDATE
        SET
          name = EXCLUDED.name,
          source_request_type = EXCLUDED.source_request_type,
          source_request_id = EXCLUDED.source_request_id,
          updated_at = NOW()
        RETURNING id, email, name, status, access_tier, granted_at, last_login_at, created_at;
      `,
      [email, name, requestType, requestId]
    );

    const member = memberResult.rows[0];
    const inviteResult = await client.query(
      `
        INSERT INTO beta_access_invites (
          member_id,
          request_type,
          request_id,
          email,
          invite_token_hash,
          status,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, 'created', $6)
        RETURNING id, member_id, request_type, request_id, email, status, expires_at, sent_at, redeemed_at, created_at;
      `,
      [member.id, requestType, requestId, email, inviteTokenHash, expiresAt]
    );

    await client.query('COMMIT');
    return { member, invite: inviteResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markBetaAccessInviteSent(inviteId) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      UPDATE beta_access_invites
      SET status = 'sent', sent_at = NOW()
      WHERE id = $1
      RETURNING id, status, sent_at;
    `,
    [inviteId]
  );

  return result.rows[0] || null;
}

export async function redeemBetaAccessInvite({
  inviteTokenHash,
  sessionTokenHash,
  sessionExpiresAt
}) {
  assertDatabaseConfigured();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inviteResult = await client.query(
      `
        SELECT
          bai.id,
          bai.member_id,
          bai.email,
          bai.status,
          bai.expires_at,
          bai.redeemed_at,
          bam.name,
          bam.status AS member_status,
          bam.access_tier,
          bam.granted_at
        FROM beta_access_invites bai
        JOIN beta_access_members bam ON bam.id = bai.member_id
        WHERE bai.invite_token_hash = $1
        LIMIT 1
        FOR UPDATE;
      `,
      [inviteTokenHash]
    );

    const invite = inviteResult.rows[0];
    if (!invite) {
      await client.query('ROLLBACK');
      return { state: 'missing' };
    }

    if (invite.status === 'revoked') {
      await client.query('ROLLBACK');
      return { state: 'revoked' };
    }

    if (invite.redeemed_at || invite.status === 'redeemed') {
      await client.query('ROLLBACK');
      return { state: 'redeemed' };
    }

    if (new Date(invite.expires_at) <= new Date()) {
      await client.query(
        `
          UPDATE beta_access_invites
          SET status = 'expired'
          WHERE id = $1 AND status <> 'expired';
        `,
        [invite.id]
      );
      await client.query('COMMIT');
      return { state: 'expired' };
    }

    await client.query(
      `
        UPDATE beta_access_invites
        SET status = 'redeemed', redeemed_at = NOW()
        WHERE id = $1;
      `,
      [invite.id]
    );

    const memberResult = await client.query(
      `
        UPDATE beta_access_members
        SET
          status = 'active',
          granted_at = COALESCE(granted_at, NOW()),
          last_login_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, name, status, access_tier, granted_at, last_login_at, created_at;
      `,
      [invite.member_id]
    );

    const member = memberResult.rows[0];
    const sessionResult = await client.query(
      `
        INSERT INTO beta_access_sessions (member_id, session_token_hash, expires_at, last_used_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, expires_at, created_at;
      `,
      [member.id, sessionTokenHash, sessionExpiresAt]
    );

    await client.query('COMMIT');
    return { state: 'ok', member, session: sessionResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getBetaAccessSession(sessionTokenHash) {
  assertDatabaseConfigured();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `
        SELECT
          bas.id AS session_id,
          bas.expires_at AS session_expires_at,
          bam.id,
          bam.email,
          bam.name,
          bam.status,
          bam.access_tier,
          bam.granted_at,
          bam.last_login_at,
          bam.created_at
        FROM beta_access_sessions bas
        JOIN beta_access_members bam ON bam.id = bas.member_id
        WHERE bas.session_token_hash = $1
          AND bas.expires_at > NOW()
          AND bam.status = 'active'
        LIMIT 1
        FOR UPDATE;
      `,
      [sessionTokenHash]
    );

    const session = result.rows[0];
    if (!session) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      `
        UPDATE beta_access_sessions
        SET last_used_at = NOW()
        WHERE id = $1;
      `,
      [session.session_id]
    );

    await client.query(
      `
        UPDATE beta_access_members
        SET last_login_at = NOW(), updated_at = NOW()
        WHERE id = $1;
      `,
      [session.id]
    );

    await client.query('COMMIT');
    return session;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteBetaAccessSession(sessionTokenHash) {
  assertDatabaseConfigured();

  await pool.query(
    `
      DELETE FROM beta_access_sessions
      WHERE session_token_hash = $1;
    `,
    [sessionTokenHash]
  );
}

export async function listBetaMembers({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT
        bam.id,
        bam.email,
        bam.name,
        bam.status,
        bam.access_tier,
        bam.source_request_type,
        bam.source_request_id,
        bam.granted_at,
        bam.last_login_at,
        bam.created_at,
        invite.status AS latest_invite_status,
        invite.sent_at AS latest_invite_sent_at,
        invite.expires_at AS latest_invite_expires_at,
        invite.redeemed_at AS latest_invite_redeemed_at
      FROM beta_access_members bam
      LEFT JOIN LATERAL (
        SELECT status, sent_at, expires_at, redeemed_at
        FROM beta_access_invites
        WHERE member_id = bam.id
        ORDER BY created_at DESC
        LIMIT 1
      ) invite ON TRUE
      ORDER BY bam.created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function listStrategies({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT
        id,
        strategy_key,
        name,
        mode,
        status,
        assets,
        rule_type,
        max_trade_size_usd,
        cooldown_minutes,
        description,
        created_at,
        updated_at
      FROM strategies
      ORDER BY created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function listExecutionIntents({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT
        execution_intents.id,
        execution_intents.intent_key,
        strategies.strategy_key,
        strategies.name AS strategy_name,
        execution_intents.symbol,
        execution_intents.side,
        execution_intents.notional_usd,
        execution_intents.order_type,
        execution_intents.status,
        execution_intents.expires_at,
        execution_intents.raw_payload,
        execution_intents.created_at
      FROM execution_intents
      LEFT JOIN strategies ON strategies.id = execution_intents.strategy_id
      ORDER BY execution_intents.created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function listRiskChecks({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT
        risk_checks.id,
        execution_intents.intent_key,
        execution_intents.symbol,
        risk_checks.decision,
        risk_checks.reason,
        risk_checks.checks,
        risk_checks.created_at
      FROM risk_checks
      LEFT JOIN execution_intents ON execution_intents.id = risk_checks.intent_id
      ORDER BY risk_checks.created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function listAgentRuns({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT id, run_key, run_type, status, summary, metadata, created_at
      FROM agent_runs
      ORDER BY created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function listTestnetConnectors({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT
        id,
        network_key,
        network_name,
        chain_id,
        rpc_url,
        explorer_url,
        wallet_address,
        status,
        last_checked_at,
        last_block_number,
        last_error,
        created_at,
        updated_at
      FROM testnet_connectors
      ORDER BY created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function listTestnetBalanceChecks({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT
        id,
        network_key,
        wallet_address,
        balance_wei,
        balance_eth,
        block_number,
        rpc_url,
        status,
        error,
        created_at
      FROM testnet_balance_checks
      ORDER BY created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function listTestnetTransactions({ limit = 50 } = {}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT
        id,
        network_key,
        tx_hash,
        from_address,
        to_address,
        value_wei,
        value_eth,
        purpose,
        status,
        error,
        created_at
      FROM testnet_transactions
      ORDER BY created_at DESC
      LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function getTestnetConnector(networkKey) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      SELECT
        id,
        network_key,
        network_name,
        chain_id,
        rpc_url,
        explorer_url,
        wallet_address,
        status,
        last_checked_at,
        last_block_number,
        last_error
      FROM testnet_connectors
      WHERE network_key = $1;
    `,
    [networkKey]
  );

  return result.rows[0] || null;
}

export async function recordTestnetBalanceCheck({
  connectorId,
  networkKey,
  walletAddress,
  balanceWei,
  balanceEth,
  blockNumber,
  rpcUrl,
  status,
  error
}) {
  assertDatabaseConfigured();

  const result = await pool.query(
    `
      INSERT INTO testnet_balance_checks (
        connector_id,
        network_key,
        wallet_address,
        balance_wei,
        balance_eth,
        block_number,
        rpc_url,
        status,
        error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''))
      RETURNING id, network_key, wallet_address, balance_wei, balance_eth, block_number, rpc_url, status, error, created_at;
    `,
    [
      connectorId,
      networkKey,
      walletAddress,
      balanceWei || null,
      balanceEth || null,
      blockNumber || null,
      rpcUrl,
      status,
      error || ''
    ]
  );

  await pool.query(
    `
      UPDATE testnet_connectors
      SET
        status = $2,
        last_checked_at = NOW(),
        last_block_number = $3,
        last_error = NULLIF($4, ''),
        updated_at = NOW()
      WHERE id = $1;
    `,
    [connectorId, status, blockNumber || null, error || '']
  );

  return result.rows[0];
}

async function seedTestnetConnector() {
  const config = getBaseSepoliaConfig();

  await pool.query(
    `
      INSERT INTO testnet_connectors (
        network_key,
        network_name,
        chain_id,
        rpc_url,
        explorer_url,
        wallet_address,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'configured')
      ON CONFLICT (network_key) DO UPDATE
      SET
        network_name = EXCLUDED.network_name,
        chain_id = EXCLUDED.chain_id,
        rpc_url = EXCLUDED.rpc_url,
        explorer_url = EXCLUDED.explorer_url,
        wallet_address = EXCLUDED.wallet_address,
        updated_at = NOW();
    `,
    [
      config.networkKey,
      config.networkName,
      config.chainId,
      config.rpcUrl,
      config.explorerUrl,
      config.walletAddress
    ]
  );
}

async function seedSimulationScaffold() {
  await pool.query(`
    INSERT INTO strategies (
      strategy_key,
      name,
      mode,
      status,
      assets,
      rule_type,
      max_trade_size_usd,
      cooldown_minutes,
      description
    )
    VALUES (
      'starter-btc-simulation',
      'Starter BTC Simulation',
      'simulation',
      'draft',
      '["BTC"]'::jsonb,
      'fixed-rule-placeholder',
      25.00,
      1440,
      'Placeholder starter strategy for paper-mode execution pipeline testing. No exchange or wallet execution is attached.'
    )
    ON CONFLICT (strategy_key) DO UPDATE
    SET
      name = EXCLUDED.name,
      mode = EXCLUDED.mode,
      status = EXCLUDED.status,
      assets = EXCLUDED.assets,
      rule_type = EXCLUDED.rule_type,
      max_trade_size_usd = EXCLUDED.max_trade_size_usd,
      cooldown_minutes = EXCLUDED.cooldown_minutes,
      description = EXCLUDED.description,
      updated_at = NOW();
  `);

  await pool.query(`
    INSERT INTO execution_intents (
      intent_key,
      strategy_id,
      symbol,
      side,
      notional_usd,
      order_type,
      status,
      expires_at,
      raw_payload
    )
    SELECT
      'demo-intent-btc-paper-001',
      strategies.id,
      'BTC-USD',
      'buy',
      25.00,
      'market',
      'simulated',
      NOW() + INTERVAL '1 hour',
      '{
        "source": "simulation_scaffold",
        "live_execution": false,
        "rule": "demo fixed-rule placeholder"
      }'::jsonb
    FROM strategies
    WHERE strategies.strategy_key = 'starter-btc-simulation'
    ON CONFLICT (intent_key) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO risk_checks (intent_id, decision, reason, checks)
    SELECT
      execution_intents.id,
      'allowed',
      'Simulation-only intent within placeholder size and cooldown limits.',
      '{
        "live_execution": false,
        "max_trade_size_usd": true,
        "cooldown": true,
        "kill_switch": "not_applicable"
      }'::jsonb
    FROM execution_intents
    WHERE execution_intents.intent_key = 'demo-intent-btc-paper-001'
      AND NOT EXISTS (
        SELECT 1
        FROM risk_checks
        WHERE risk_checks.intent_id = execution_intents.id
      );
  `);

  await pool.query(`
    INSERT INTO agent_runs (run_key, run_type, status, summary, metadata)
    VALUES (
      'demo-run-simulation-bootstrap',
      'simulation-bootstrap',
      'complete',
      'Seeded read-only scaffold for strategy, intent, risk, and audit dashboard verification.',
      '{
        "live_execution": false,
        "wallet_permissions": false,
        "exchange_permissions": false
      }'::jsonb
    )
    ON CONFLICT (run_key) DO NOTHING;
  `);
}

function assertDatabaseConfigured() {
  if (!pool) {
    const error = new Error('Database is not configured');
    error.statusCode = 503;
    throw error;
  }
}
