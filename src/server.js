import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  createContactRequest,
  createWalletBetaRequest,
  getTestnetConnector,
  initializeDatabase,
  isDatabaseConfigured,
  listAgentRuns,
  listContactRequests,
  listExecutionIntents,
  listRiskChecks,
  listStrategies,
  listTestnetBalanceChecks,
  listTestnetConnectors,
  listTestnetTransactions,
  listWalletBetaRequests,
  recordTestnetBalanceCheck,
  updateContactRequestNotes,
  updateContactRequestStatus,
  updateWalletBetaRequestNotes,
  updateWalletBetaRequestStatus
} from './db.js';
import { readBaseSepoliaBalance } from './baseSepolia.js';
import {
  isMailConfigured,
  sendContactNotification,
  sendWalletBetaNotification
} from './mail.js';

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
    }
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

async function notifySafely(sendNotification) {
  try {
    return await sendNotification();
  } catch (error) {
    console.error('Email notification failed:', error.message);
    return { sent: false, reason: 'mail_send_failed' };
  }
}
