import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  createBetaAccessInvite,
  createContactRequest,
  createWalletBetaRequest,
  deleteBetaAccessSession,
  getBetaAccessSession,
  getContactRequestForInvite,
  getTestnetConnector,
  getWalletBetaRequestForInvite,
  initializeDatabase,
  isDatabaseConfigured,
  listAgentRuns,
  listBetaMembers,
  listContactRequests,
  listExecutionIntents,
  listRiskChecks,
  listStrategies,
  listTestnetBalanceChecks,
  listTestnetConnectors,
  listTestnetTransactions,
  listWalletBetaRequests,
  markBetaAccessInviteSent,
  recordTestnetBalanceCheck,
  redeemBetaAccessInvite,
  updateContactRequestNotes,
  updateContactRequestStatus,
  updateWalletBetaRequestNotes,
  updateWalletBetaRequestStatus
} from './db.js';
import { readBaseSepoliaBalance } from './baseSepolia.js';
import {
  isMailConfigured,
  sendBetaInviteEmail,
  sendContactNotification,
  sendWalletBetaNotification
} from './mail.js';
import { getBetaCatalogPayload, isAdvisorConfigured, runAdvisor } from './advisor.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const defaultAllowedOrigins = [
  'https://obsidianabyss.com',
  'https://www.obsidianabyss.com',
  'http://127.0.0.1:8000',
  'http://localhost:8000'
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultAllowedOrigins.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const adminToken = process.env.ADMIN_TOKEN;
const betaAppUrl = process.env.BETA_APP_URL || 'https://www.obsidianabyss.com/beta.html';
const betaSessionCookieName = process.env.BETA_SESSION_COOKIE_NAME || 'obsidian_beta_session';
const betaInviteHours = Number(process.env.BETA_INVITE_HOURS || 168);
const betaSessionHours = Number(process.env.BETA_SESSION_HOURS || 336);
const betaEligibleStatuses = new Set(['approved', 'beta-ready', 'accepted']);
const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many requests. Please try again later.'
  }
});
const advisorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many advisor requests. Please slow down and try again shortly.'
  }
});
const betaRedeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many beta access attempts. Please try again later.'
  }
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true
  })
);

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
  experienceLevel: z.string().trim().max(80).optional().or(z.literal('')),
  accessMode: z.string().trim().max(80).optional().or(z.literal('')),
  preferredAssets: z.string().trim().max(240).optional().or(z.literal('')),
  preferredExchange: z.string().trim().max(160).optional().or(z.literal('')),
  automationComfort: z.string().trim().max(80).optional().or(z.literal('')),
  company: z.string().trim().max(0).optional().or(z.literal(''))
});

const walletBetaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  walletAddress: z.string().trim().max(160).optional().or(z.literal('')),
  experienceLevel: z.string().trim().max(80).optional().or(z.literal('')),
  accessMode: z.string().trim().max(80).optional().or(z.literal('')),
  preferredAssets: z.string().trim().max(240).optional().or(z.literal('')),
  preferredExchange: z.string().trim().max(160).optional().or(z.literal('')),
  automationComfort: z.string().trim().max(80).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  company: z.string().trim().max(0).optional().or(z.literal(''))
});

const adminListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});
const adminStatusSchema = z.object({
  status: z.enum(['new', 'reviewed', 'approved', 'beta-ready', 'accepted', 'rejected', 'not-fit-yet'])
});
const adminNotesSchema = z.object({
  adminNotes: z.string().trim().max(4000).optional().or(z.literal(''))
});
const betaInviteSchema = z.object({
  expiresHours: z.coerce.number().int().min(1).max(24 * 30).optional()
});
const betaRedeemSchema = z.object({
  inviteToken: z.string().trim().min(32).max(512)
});
const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

function validate(schema, payload) {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return { data: parsed.data };
  }

  return {
    error: parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message
    }))
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'obsidianabyss-api',
    database: {
      configured: isDatabaseConfigured()
    },
    admin: {
      configured: Boolean(adminToken)
    },
    mail: {
      configured: isMailConfigured()
    },
    advisor: {
      configured: isAdvisorConfigured()
    },
    betaAccess: {
      enabled: isDatabaseConfigured()
    },
    timestamp: new Date().toISOString()
  });
});

app.post('/contact', submissionLimiter, async (req, res, next) => {
  const result = validate(contactSchema, req.body);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const request = await createContactRequest(result.data);
    const notification = await notifySafely(() =>
      sendContactNotification({ request, submission: result.data })
    );

    res.status(201).json({
      ok: true,
      message: 'Contact request saved.',
      request,
      notification
    });
  } catch (error) {
    next(error);
  }
});

app.post('/wallet-beta-request', submissionLimiter, async (req, res, next) => {
  const result = validate(walletBetaSchema, req.body);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    // This endpoint does not request signatures, custody assets, or execute trades.
    const request = await createWalletBetaRequest(result.data);
    const notification = await notifySafely(() =>
      sendWalletBetaNotification({ request, submission: result.data })
    );

    res.status(201).json({
      ok: true,
      message: 'Wallet beta request saved.',
      request,
      notification
    });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/contact-requests', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const requests = await listContactRequests({ limit: result.data.limit });
    res.json({ ok: true, requests });
  } catch (error) {
    next(error);
  }
});

app.patch('/admin/contact-requests/:id/status', requireAdmin, async (req, res, next) => {
  const params = validate(idParamSchema, req.params);
  const body = validate(adminStatusSchema, req.body);
  if (params.error || body.error) {
    res.status(400).json({ ok: false, errors: [...(params.error || []), ...(body.error || [])] });
    return;
  }

  try {
    const request = await updateContactRequestStatus({
      id: params.data.id,
      status: body.data.status
    });
    if (!request) {
      res.status(404).json({ ok: false, error: 'Contact request not found' });
      return;
    }

    res.json({ ok: true, request });
  } catch (error) {
    next(error);
  }
});

app.patch('/admin/contact-requests/:id/notes', requireAdmin, async (req, res, next) => {
  const params = validate(idParamSchema, req.params);
  const body = validate(adminNotesSchema, req.body);
  if (params.error || body.error) {
    res.status(400).json({ ok: false, errors: [...(params.error || []), ...(body.error || [])] });
    return;
  }

  try {
    const request = await updateContactRequestNotes({
      id: params.data.id,
      adminNotes: body.data.adminNotes || ''
    });
    if (!request) {
      res.status(404).json({ ok: false, error: 'Contact request not found' });
      return;
    }

    res.json({ ok: true, request });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/wallet-beta-requests', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const requests = await listWalletBetaRequests({ limit: result.data.limit });
    res.json({ ok: true, requests });
  } catch (error) {
    next(error);
  }
});

app.patch('/admin/wallet-beta-requests/:id/status', requireAdmin, async (req, res, next) => {
  const params = validate(idParamSchema, req.params);
  const body = validate(adminStatusSchema, req.body);
  if (params.error || body.error) {
    res.status(400).json({ ok: false, errors: [...(params.error || []), ...(body.error || [])] });
    return;
  }

  try {
    const request = await updateWalletBetaRequestStatus({
      id: params.data.id,
      status: body.data.status
    });
    if (!request) {
      res.status(404).json({ ok: false, error: 'Wallet beta request not found' });
      return;
    }

    res.json({ ok: true, request });
  } catch (error) {
    next(error);
  }
});

app.patch('/admin/wallet-beta-requests/:id/notes', requireAdmin, async (req, res, next) => {
  const params = validate(idParamSchema, req.params);
  const body = validate(adminNotesSchema, req.body);
  if (params.error || body.error) {
    res.status(400).json({ ok: false, errors: [...(params.error || []), ...(body.error || [])] });
    return;
  }

  try {
    const request = await updateWalletBetaRequestNotes({
      id: params.data.id,
      adminNotes: body.data.adminNotes || ''
    });
    if (!request) {
      res.status(404).json({ ok: false, error: 'Wallet beta request not found' });
      return;
    }

    res.json({ ok: true, request });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/contact-requests/:id/invite', requireAdmin, async (req, res, next) => {
  const params = validate(idParamSchema, req.params);
  const body = validate(betaInviteSchema, req.body || {});
  if (params.error || body.error) {
    res.status(400).json({ ok: false, errors: [...(params.error || []), ...(body.error || [])] });
    return;
  }

  try {
    const request = await getContactRequestForInvite(params.data.id);
    if (!request) {
      res.status(404).json({ ok: false, error: 'Contact request not found' });
      return;
    }

    if (!betaEligibleStatuses.has(request.status)) {
      res.status(409).json({ ok: false, error: 'Request must be approved before invite issuance.' });
      return;
    }

    const invite = await issueBetaInvite({
      requestType: 'contact',
      requestId: request.id,
      name: request.name,
      email: request.email,
      expiresHours: body.data.expiresHours
    });

    res.status(201).json({ ok: true, ...invite });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/wallet-beta-requests/:id/invite', requireAdmin, async (req, res, next) => {
  const params = validate(idParamSchema, req.params);
  const body = validate(betaInviteSchema, req.body || {});
  if (params.error || body.error) {
    res.status(400).json({ ok: false, errors: [...(params.error || []), ...(body.error || [])] });
    return;
  }

  try {
    const request = await getWalletBetaRequestForInvite(params.data.id);
    if (!request) {
      res.status(404).json({ ok: false, error: 'Wallet beta request not found' });
      return;
    }

    if (!betaEligibleStatuses.has(request.status)) {
      res.status(409).json({ ok: false, error: 'Request must be approved before invite issuance.' });
      return;
    }

    const invite = await issueBetaInvite({
      requestType: 'wallet',
      requestId: request.id,
      name: request.name,
      email: request.email,
      expiresHours: body.data.expiresHours
    });

    res.status(201).json({ ok: true, ...invite });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/beta-members', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const members = await listBetaMembers({ limit: result.data.limit });
    res.json({ ok: true, members });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/strategies', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const strategies = await listStrategies({ limit: result.data.limit });
    res.json({ ok: true, strategies });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/execution-intents', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const intents = await listExecutionIntents({ limit: result.data.limit });
    res.json({ ok: true, intents });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/risk-checks', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const checks = await listRiskChecks({ limit: result.data.limit });
    res.json({ ok: true, checks });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/agent-runs', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const runs = await listAgentRuns({ limit: result.data.limit });
    res.json({ ok: true, runs });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/testnet/connectors', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const connectors = await listTestnetConnectors({ limit: result.data.limit });
    res.json({ ok: true, connectors });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/testnet/balance-checks', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const checks = await listTestnetBalanceChecks({ limit: result.data.limit });
    res.json({ ok: true, checks });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/testnet/balance-checks/run', requireAdmin, async (_req, res, next) => {
  try {
    const connector = await getTestnetConnector('base-sepolia');
    if (!connector) {
      res.status(404).json({ ok: false, error: 'Base Sepolia connector not found' });
      return;
    }

    try {
      const snapshot = await readBaseSepoliaBalance({
        rpcUrl: connector.rpc_url,
        walletAddress: connector.wallet_address,
        expectedChainId: connector.chain_id
      });
      const check = await recordTestnetBalanceCheck({
        connectorId: connector.id,
        networkKey: connector.network_key,
        walletAddress: connector.wallet_address,
        balanceWei: snapshot.balanceWei,
        balanceEth: snapshot.balanceEth,
        blockNumber: snapshot.blockNumber,
        rpcUrl: connector.rpc_url,
        status: 'ok'
      });

      res.status(201).json({ ok: true, check });
    } catch (error) {
      const check = await recordTestnetBalanceCheck({
        connectorId: connector.id,
        networkKey: connector.network_key,
        walletAddress: connector.wallet_address,
        rpcUrl: connector.rpc_url,
        status: 'error',
        error: error.message
      });

      res.status(502).json({ ok: false, error: error.message, check });
    }
  } catch (error) {
    next(error);
  }
});

app.get('/admin/testnet/transactions', requireAdmin, async (req, res, next) => {
  const result = validate(adminListSchema, req.query);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const transactions = await listTestnetTransactions({ limit: result.data.limit });
    res.json({ ok: true, transactions });
  } catch (error) {
    next(error);
  }
});

const previewAdvisorSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000)
      })
    )
    .min(1)
    .max(10),
  mode: z.literal('preview').optional()
});

app.post('/advisor/message', advisorLimiter, async (req, res, next) => {
  const result = validate(previewAdvisorSchema, req.body);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  if (result.data.messages[0].role !== 'user') {
    res.status(400).json({ ok: false, error: 'Conversation must start with a user message.' });
    return;
  }

  try {
    const reply = await runAdvisor(result.data.messages, { mode: 'preview' });
    res.json({ ok: true, mode: 'preview', reply });
  } catch (error) {
    next(error);
  }
});

const betaAdvisorSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000)
      })
    )
    .min(1)
    .max(16),
  mode: z.literal('full').optional()
});

app.post('/beta/invites/redeem', betaRedeemLimiter, async (req, res, next) => {
  const result = validate(betaRedeemSchema, req.body);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const sessionToken = createOpaqueToken();
    const redeemed = await redeemBetaAccessInvite({
      inviteTokenHash: hashToken(result.data.inviteToken),
      sessionTokenHash: hashToken(sessionToken),
      sessionExpiresAt: getFutureIsoHours(betaSessionHours)
    });

    if (redeemed.state === 'missing') {
      res.status(404).json({ ok: false, error: 'Invite not found' });
      return;
    }

    if (redeemed.state === 'expired') {
      res.status(410).json({ ok: false, error: 'Invite expired' });
      return;
    }

    if (redeemed.state === 'redeemed') {
      res.status(409).json({ ok: false, error: 'Invite already redeemed' });
      return;
    }

    if (redeemed.state === 'revoked') {
      res.status(410).json({ ok: false, error: 'Invite revoked' });
      return;
    }

    if (redeemed.state !== 'ok') {
      res.status(409).json({ ok: false, error: 'Invite could not be redeemed' });
      return;
    }

    setBetaSessionCookie(req, res, sessionToken);
    res.json({ ok: true, member: mapBetaMember(redeemed.member), sessionToken });
  } catch (error) {
    next(error);
  }
});

app.get('/beta/session', requireBetaMember, (req, res) => {
  res.json({ ok: true, member: mapBetaMember(req.betaMember) });
});

app.post('/beta/logout', (req, res) => {
  const tokens = readBetaSessionTokens(req);
  if (tokens.length) {
    Promise.all(tokens.map((token) => deleteBetaAccessSession(hashToken(token)))).catch((error) => {
      console.error('Beta session delete failed:', error.message);
    });
  }

  clearBetaSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/beta/catalog', requireBetaMember, (_req, res) => {
  res.json({ ok: true, ...getBetaCatalogPayload() });
});

app.post('/beta/advisor/message', requireBetaMember, advisorLimiter, async (req, res, next) => {
  const result = validate(betaAdvisorSchema, req.body);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  if (result.data.messages[0].role !== 'user') {
    res.status(400).json({ ok: false, error: 'Conversation must start with a user message.' });
    return;
  }

  try {
    const reply = await runAdvisor(result.data.messages, { mode: 'full' });
    res.json({ ok: true, mode: 'full', member: mapBetaMember(req.betaMember), reply });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  if (err.message === 'Origin is not allowed by CORS') {
    res.status(403).json({ ok: false, error: err.message });
    return;
  }

  if (err.statusCode) {
    res.status(err.statusCode).json({ ok: false, error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

await initializeDatabase();

app.listen(port, () => {
  console.log(`obsidianabyss-api listening on ${port}`);
});

function requireAdmin(req, res, next) {
  if (!adminToken) {
    res.status(503).json({ ok: false, error: 'Admin access is not configured' });
    return;
  }

  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== adminToken) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  next();
}

async function requireBetaMember(req, res, next) {
  const tokens = readBetaSessionTokens(req);
  if (!tokens.length) {
    res.status(401).json({ ok: false, error: 'Beta access required' });
    return;
  }

  try {
    let member = null;
    for (const token of tokens) {
      member = await getBetaAccessSession(hashToken(token));
      if (member) {
        break;
      }
    }

    if (!member) {
      clearBetaSessionCookie(req, res);
      res.status(401).json({ ok: false, error: 'Beta session expired' });
      return;
    }

    req.betaMember = member;
    next();
  } catch (error) {
    next(error);
  }
}

async function issueBetaInvite({ requestType, requestId, name, email, expiresHours }) {
  const inviteToken = createOpaqueToken();
  const expiresAt = getFutureIsoHours(expiresHours || betaInviteHours);
  const created = await createBetaAccessInvite({
    requestType,
    requestId,
    name,
    email,
    inviteTokenHash: hashToken(inviteToken),
    expiresAt
  });

  const inviteUrl = buildInviteUrl(inviteToken);
  const notification = await notifySafely(() =>
    sendBetaInviteEmail({
      email,
      name,
      inviteUrl,
      expiresAt
    })
  );

  let invite = created.invite;
  if (notification.sent) {
    invite = {
      ...invite,
      ...(await markBetaAccessInviteSent(invite.id))
    };
  }

  return {
    member: mapBetaMember(created.member),
    invite,
    inviteUrl,
    notification
  };
}

function mapBetaMember(member) {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    status: member.status,
    accessTier: member.access_tier,
    grantedAt: member.granted_at || null,
    lastLoginAt: member.last_login_at || member.beta_member_last_login_at || null,
    createdAt: member.created_at || null
  };
}

function buildInviteUrl(inviteToken) {
  const url = new URL(betaAppUrl);
  url.searchParams.set('invite', inviteToken);
  return url.toString();
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getFutureIsoHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function readBetaSessionTokens(req) {
  const tokens = [];
  const authHeader = req.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    tokens.push(authHeader.slice(7));
  }

  const cookies = parseCookieHeader(req.get('cookie') || '');
  if (cookies[betaSessionCookieName]) {
    tokens.push(cookies[betaSessionCookieName]);
  }

  return [...new Set(tokens.filter(Boolean))];
}

function parseCookieHeader(header) {
  return header
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const index = entry.indexOf('=');
      if (index === -1) {
        return acc;
      }

      const key = entry.slice(0, index).trim();
      const value = entry.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function setBetaSessionCookie(req, res, sessionToken) {
  res.cookie(betaSessionCookieName, sessionToken, {
    ...getBetaCookieOptions(req),
    maxAge: betaSessionHours * 60 * 60 * 1000
  });
}

function clearBetaSessionCookie(req, res) {
  res.clearCookie(betaSessionCookieName, getBetaCookieOptions(req));
}

function getBetaCookieOptions(req) {
  const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    path: '/'
  };
}

async function notifySafely(sendNotification) {
  try {
    return await sendNotification();
  } catch (error) {
    console.error('Email notification failed:', error.message);
    return { sent: false, reason: 'mail_send_failed' };
  }
}
