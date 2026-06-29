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
  linkBetaMemberStripe,
  recordTestnetBalanceCheck,
  revokeBetaMemberByStripeCustomer,
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
import {
  isBillingConfigured,
  createMembershipCheckout,
  constructWebhookEvent,
  interpretWebhookEvent
} from './billing.js';
import { getBacktestingPayload } from './backtesting.js';
import { getEngineResearchPayload } from './engineResearchBlueprint.js';
import {
  getMarkovRegimeMemberPayload,
  getMarkovRegimePreviewPayload
} from './markovRegimeData.js';
import { getCuratedBacktests, isCuratedBacktestAvailable, getEngineBacktests } from './backtestShowcase.js';
import {
  createAgenticAccessMiddleware,
  getAgenticAccessCatalog,
  getAgenticBacktestingPayload,
  isAgenticAccessConfigured
} from './agenticAccess.js';
import {
  buildGraph,
  checkHealth as checkMirofishHealth,
  generateOntology,
  getGraphData,
  getTaskStatus,
  isMiroFishConfigured
} from './mirofish.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const defaultAllowedOrigins = [
  'https://obsidianabyss.com',
  'https://www.obsidianabyss.com',
  'https://cheffer0723.github.io',
  'https://dashboard-production-1ee0.up.railway.app',
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
const agenticAccessMiddleware = createAgenticAccessMiddleware();
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
const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many checkout attempts. Please try again shortly.'
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
// MiroFish runs are heavy (real LLM + graph-build cost per call) — keep this tight.
const mirofishLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many simulation requests this hour. Please try again later.'
  }
});
const emotionalAnalysisStore = new Map();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());

// Stripe webhook needs the raw request body for signature verification — register before express.json().
app.post('/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json({ limit: '32kb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }));
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

if (agenticAccessMiddleware) {
  app.use(agenticAccessMiddleware);
}

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

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseTradeCsv(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? '']));
    const side = String(row.side || row.action || row.type || '').toLowerCase();
    const price = Number(row.price || row.fill_price || row.avg_price || row.execution_price || 0);
    const quantity = Number(row.quantity || row.qty || row.shares || row.amount || 0);
    const value = Math.abs(price * quantity);

    return {
      id: row.id || `trade-${index + 1}`,
      timestamp: row.timestamp || row.date || row.datetime || row.time || null,
      symbol: String(row.symbol || row.ticker || row.asset || 'UNKNOWN').toUpperCase(),
      side: side.includes('sell') ? 'sell' : side.includes('buy') ? 'buy' : side || 'unknown',
      price,
      quantity,
      value
    };
  });
}

function getPreviousTrade(trades, trade, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (trades[cursor].symbol === trade.symbol && trades[cursor].price > 0) {
      return trades[cursor];
    }
  }

  return null;
}

function classifyTrade(trades, trade, index) {
  const previous = getPreviousTrade(trades, trade, index);
  const priceChangePct = previous ? ((trade.price - previous.price) / previous.price) * 100 : 0;
  const base = {
    id: trade.id,
    timestamp: trade.timestamp,
    symbol: trade.symbol,
    side: trade.side,
    price: trade.price,
    quantity: trade.quantity,
    notional: Number(trade.value.toFixed(2)),
    priceChangePct: Number(priceChangePct.toFixed(2))
  };

  if (trade.side === 'buy' && priceChangePct >= 2) {
    return {
      bucket: 'fomoChaseTrades',
      cost: trade.value * Math.min(0.18, priceChangePct / 100),
      trade: { ...base, reason: 'Bought after a sharp same-asset price jump.' }
    };
  }

  if (trade.side === 'sell' && priceChangePct <= -2) {
    return {
      bucket: 'panicExitTrades',
      cost: trade.value * Math.min(0.22, Math.abs(priceChangePct) / 100),
      trade: { ...base, reason: 'Sold after a sharp same-asset price drop.' }
    };
  }

  const averageValue =
    trades.reduce((sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0), 0) / Math.max(trades.length, 1);
  if (trade.side === 'buy' && trade.value > averageValue * 2.5) {
    return {
      bucket: 'greedHoldTrades',
      cost: trade.value * 0.03,
      trade: { ...base, reason: 'Position size was materially larger than the trade set average.' }
    };
  }

  return {
    bucket: 'disciplinedTrades',
    cost: 0,
    trade: { ...base, reason: 'No impulse trigger detected by the current heuristic.' }
  };
}

function buildMonthlyBreakdown(classifiedTrades) {
  const monthly = new Map();

  for (const item of classifiedTrades) {
    const month = item.trade.timestamp ? String(item.trade.timestamp).slice(0, 7) : 'unknown';
    const current = monthly.get(month) || {
      month,
      totalTrades: 0,
      emotionalTrades: 0,
      disciplinedTrades: 0,
      emotionalCost: 0
    };

    current.totalTrades += 1;
    current.emotionalCost += item.cost;
    if (item.bucket === 'disciplinedTrades') {
      current.disciplinedTrades += 1;
    } else {
      current.emotionalTrades += 1;
    }
    monthly.set(month, current);
  }

  return [...monthly.values()]
    .map((row) => ({ ...row, emotionalCost: Number(row.emotionalCost.toFixed(2)) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function buildRegimeForecast() {
  const data = getEngineBacktests();
  const engines = (data.engines || []).map((engine) => {
    const spy = (engine.assets || []).find((asset) => asset.ticker === 'SPY') || engine.assets?.[0];
    const strategy = spy?.metrics?.strategy || {};
    const benchmark = spy?.metrics?.benchmark || {};
    const drawdownReduction = Math.max(0, Math.abs(benchmark.maxDrawdownPct || 0) - Math.abs(strategy.maxDrawdownPct || 0));

    return {
      key: engine.key,
      name: engine.name,
      type: engine.type,
      status: engine.status,
      asset: spy?.ticker || null,
      cagrPct: strategy.cagrPct ?? null,
      maxDrawdownPct: strategy.maxDrawdownPct ?? null,
      pctInMarket: strategy.pctInMarket ?? null,
      drawdownReductionPct: Number(drawdownReduction.toFixed(2)),
      verdict: engine.verdict
    };
  });

  const bullWeight = engines.reduce((sum, engine) => sum + Math.max(0, Number(engine.cagrPct || 0)) * 0.8, 0);
  const bearWeight = engines.reduce((sum, engine) => sum + Math.max(0, Number(engine.drawdownReductionPct || 0)) * 0.45, 0);
  const sidewaysWeight = engines.reduce((sum, engine) => {
    const cashWeight = Math.max(0, 100 - Number(engine.pctInMarket || 50));
    return sum + cashWeight * 0.18;
  }, 0);
  const total = Math.max(bullWeight + bearWeight + sidewaysWeight, 1);
  const probabilities = {
    bull: Number((bullWeight / total).toFixed(3)),
    bear: Number((bearWeight / total).toFixed(3)),
    sideways: Number((sidewaysWeight / total).toFixed(3))
  };
  const type = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];

  return {
    type,
    confidence: probabilities[type],
    probabilities,
    horizonDays: 7,
    source: data.dataSource,
    generatedAt: new Date().toISOString(),
    engines
  };
}

function buildEmotionalAnalysis(csvText) {
  const trades = parseTradeCsv(csvText).filter((trade) => Number.isFinite(trade.price) && Number.isFinite(trade.quantity));
  const breakdown = {
    fomoChaseTrades: [],
    panicExitTrades: [],
    greedHoldTrades: [],
    disciplinedTrades: []
  };
  const classifiedTrades = trades.map((trade, index) => classifyTrade(trades, trade, index));
  let totalEmotionalCost = 0;

  for (const item of classifiedTrades) {
    breakdown[item.bucket].push(item.trade);
    totalEmotionalCost += item.cost;
  }

  const emotionalTrades =
    breakdown.fomoChaseTrades.length + breakdown.panicExitTrades.length + breakdown.greedHoldTrades.length;
  const disciplinedTrades = breakdown.disciplinedTrades.length;
  const disciplineScore = trades.length ? Math.round((disciplinedTrades / trades.length) * 100) : 0;

  return {
    summary: {
      totalTrades: trades.length,
      emotionalTrades,
      disciplinedTrades,
      totalEmotionalCost: Number(totalEmotionalCost.toFixed(2)),
      currencyGain: Number(Math.max(0, trades.reduce((sum, trade) => sum + (trade.side === 'sell' ? trade.value : 0), 0) * 0.01).toFixed(2)),
      potentialGain: Number((totalEmotionalCost * 1.35).toFixed(2)),
      missedOpportunity: Number((totalEmotionalCost * 0.35).toFixed(2))
    },
    breakdown,
    monthlyBreakdown: buildMonthlyBreakdown(classifiedTrades),
    regimeForecast: buildRegimeForecast(),
    disciplineScore
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
    billing: {
      configured: isBillingConfigured()
    },
    x402: {
      configured: isAgenticAccessConfigured()
    },
    betaAccess: {
      enabled: isDatabaseConfigured()
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/regime-forecast', (_req, res, next) => {
  try {
    res.json({ ok: true, forecast: buildRegimeForecast() });
  } catch (error) {
    next(error);
  }
});

app.post('/emotional-decisions/upload', (req, res, next) => {
  try {
    const csvText = typeof req.body === 'string' ? req.body : req.body?.csv || req.body?.content || '';
    const analysis = buildEmotionalAnalysis(csvText);
    const userId = String(req.get('x-user-id') || 'demo-user');
    emotionalAnalysisStore.set(userId, {
      analysis,
      uploadedAt: new Date().toISOString()
    });

    res.json({ ok: true, analysis });
  } catch (error) {
    next(error);
  }
});

app.get('/emotional-decisions/summary', (req, res) => {
  const userId = String(req.get('x-user-id') || 'demo-user');
  const stored = emotionalAnalysisStore.get(userId);

  if (stored) {
    res.json({ ok: true, analysis: stored.analysis, uploadedAt: stored.uploadedAt });
    return;
  }

  res.json({
    ok: true,
    analysis: {
      summary: {
        totalTrades: 0,
        emotionalTrades: 0,
        disciplinedTrades: 0,
        totalEmotionalCost: 0,
        currencyGain: 0,
        potentialGain: 0,
        missedOpportunity: 0
      },
      breakdown: {
        fomoChaseTrades: [],
        panicExitTrades: [],
        greedHoldTrades: [],
        disciplinedTrades: []
      },
      monthlyBreakdown: [],
      regimeForecast: buildRegimeForecast(),
      disciplineScore: 0
    }
  });
});

app.get('/engines/:engineId', (req, res) => {
  const payload = getEnginePreviewPayload(req.params.engineId);
  if (!payload) {
    res.status(404).json({ ok: false, error: 'Engine not found' });
    return;
  }

  res.json({ ok: true, mode: 'preview', engine: payload });
});

app.get('/backtests/curated', (req, res, next) => {
  try {
    const data = getCuratedBacktests();
    res.json({ ok: true, ...data });
  } catch (error) {
    next(error);
  }
});

app.get('/backtests/engines', (req, res, next) => {
  try {
    const data = getEngineBacktests();
    res.json({ ok: true, ...data });
  } catch (error) {
    next(error);
  }
});

app.get('/x402/status', (_req, res) => {
  res.json(getAgenticAccessCatalog());
});

app.get('/agent/catalog', (_req, res) => {
  res.json(getAgenticAccessCatalog());
});

app.get('/agent/backtesting', (_req, res) => {
  if (!isAgenticAccessConfigured()) {
    res.status(503).json({ ok: false, error: 'Agentic access is not enabled yet.' });
    return;
  }

  res.json(getAgenticBacktestingPayload());
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

const mirofishSessionSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  context: z.string().trim().max(16000).optional()
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
  res.json({ ok: true, ...getBetaCatalogPayload(), researchOverview: getEngineResearchPayload().overview });
});

app.get('/beta/dashboard', requireBetaMember, async (req, res, next) => {
  try {
    const betaPayload = getBetaCatalogPayload();
    const engineResearch = getEngineResearchPayload();
    const [
      strategies,
      intents,
      riskChecks,
      runs,
      connectors,
      balanceChecks,
      transactions
    ] = await Promise.all([
      listStrategies({ limit: 6 }),
      listExecutionIntents({ limit: 6 }),
      listRiskChecks({ limit: 6 }),
      listAgentRuns({ limit: 6 }),
      listTestnetConnectors({ limit: 4 }),
      listTestnetBalanceChecks({ limit: 4 }),
      listTestnetTransactions({ limit: 4 })
    ]);

    res.json({
      ok: true,
      member: mapBetaMember(req.betaMember),
      ...betaPayload,
      engineResearch,
      dashboard: buildBetaDashboardPayload({
        pricing: betaPayload.pricing,
        catalog: betaPayload.catalog,
        engineResearch,
        strategies,
        intents,
        riskChecks,
        runs,
        connectors,
        balanceChecks,
        transactions
      })
    });
  } catch (error) {
    next(error);
  }
});

app.get('/beta/backtesting', requireBetaMember, async (req, res, next) => {
  try {
    const [strategies, runs] = await Promise.all([
      listStrategies({ limit: 12 }),
      listAgentRuns({ limit: 12 })
    ]);

    res.json({
      ok: true,
      member: mapBetaMember(req.betaMember),
      backtesting: getBacktestingPayload({ strategies, runs })
    });
  } catch (error) {
    next(error);
  }
});

app.get('/beta/engines', requireBetaMember, (req, res) => {
  res.json({
    ok: true,
    member: mapBetaMember(req.betaMember),
    research: getEngineResearchPayload()
  });
});

app.get('/beta/engines/:engineId', requireBetaMember, (req, res) => {
  const payload = getEngineMemberPayload(req.params.engineId);
  if (!payload) {
    res.status(404).json({ ok: false, error: 'Engine not found' });
    return;
  }

  res.json({
    ok: true,
    mode: 'full',
    member: mapBetaMember(req.betaMember),
    engine: payload
  });
});

app.get('/beta/mirofish/status', requireBetaMember, async (_req, res) => {
  if (!isMiroFishConfigured()) {
    res.json({ ok: true, configured: false });
    return;
  }

  try {
    const health = await checkMirofishHealth();
    res.json({ ok: true, configured: true, health });
  } catch (error) {
    res.json({ ok: true, configured: true, healthy: false, error: error.message });
  }
});

// Starts a new MiroFish ontology-generation pass for a member's strategy question.
// This is step 1 of MiroFish's pipeline (ontology -> graph build -> simulation -> report).
// Simulation/report stages aren't wired in yet — see src/mirofish.js for status.
app.post('/beta/mirofish/sessions', requireBetaMember, mirofishLimiter, async (req, res, next) => {
  if (!isMiroFishConfigured()) {
    res.status(503).json({ ok: false, error: 'MiroFish is not configured yet' });
    return;
  }

  const result = validate(mirofishSessionSchema, req.body);
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const ontology = await generateOntology({
      projectName: `member-${req.betaMember.id}-${Date.now()}`,
      simulationRequirement: result.data.question,
      files: result.data.context
        ? [{ filename: 'context.txt', content: result.data.context }]
        : []
    });
    res.json({ ok: true, ontology });
  } catch (error) {
    next(error);
  }
});

app.post('/beta/mirofish/sessions/:projectId/build', requireBetaMember, mirofishLimiter, async (req, res, next) => {
  if (!isMiroFishConfigured()) {
    res.status(503).json({ ok: false, error: 'MiroFish is not configured yet' });
    return;
  }

  try {
    const build = await buildGraph({ projectId: req.params.projectId });
    res.json({ ok: true, build });
  } catch (error) {
    next(error);
  }
});

app.get('/beta/mirofish/tasks/:taskId', requireBetaMember, async (req, res, next) => {
  if (!isMiroFishConfigured()) {
    res.status(503).json({ ok: false, error: 'MiroFish is not configured yet' });
    return;
  }

  try {
    const status = await getTaskStatus(req.params.taskId);
    res.json({ ok: true, status });
  } catch (error) {
    next(error);
  }
});

app.get('/beta/mirofish/graphs/:graphId', requireBetaMember, async (req, res, next) => {
  if (!isMiroFishConfigured()) {
    res.status(503).json({ ok: false, error: 'MiroFish is not configured yet' });
    return;
  }

  try {
    const data = await getGraphData(req.params.graphId);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
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

const billingCheckoutSchema = z.object({
  email: z.string().trim().email().max(254).optional().or(z.literal(''))
});

app.post('/billing/checkout', billingLimiter, async (req, res, next) => {
  if (!isBillingConfigured()) {
    res.status(503).json({ ok: false, error: 'Billing is not configured yet.' });
    return;
  }

  const result = validate(billingCheckoutSchema, req.body || {});
  if (result.error) {
    res.status(400).json({ ok: false, errors: result.error });
    return;
  }

  try {
    const checkout = await createMembershipCheckout({ email: result.data.email || null });
    res.json({ ok: true, url: checkout.url });
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

function buildBetaDashboardPayload({
  pricing,
  catalog,
  engineResearch,
  strategies,
  intents,
  riskChecks,
  runs,
  connectors,
  balanceChecks,
  transactions
}) {
  const latestBalanceCheck = balanceChecks[0] || null;
  const latestTransaction = transactions[0] || null;
  const liveExecutionEnabled = runs.some((run) => run.metadata?.live_execution === true);
  const walletPermissionsEnabled = runs.some((run) => run.metadata?.wallet_permissions === true);
  const exchangePermissionsEnabled = runs.some((run) => run.metadata?.exchange_permissions === true);

  return {
    developmentNotice:
      'This member layer is a development preview. Paper-mode setups, signal scaffolds, and testnet plumbing are visible here, but funds, keys, signatures, deposits, withdrawals, and live orders remain disabled.',
    advisor: {
      configured: isAdvisorConfigured(),
      mode: 'member'
    },
    overview: {
      activeLanes: catalog.length,
      datasetBundles: engineResearch.overview.datasetBundles,
      paperScaffolds: strategies.length,
      recentIntents: intents.length,
      recentRiskChecks: riskChecks.length,
      recentRuns: runs.length,
      testnetNetworks: connectors.length
    },
    engineResearchOverview: engineResearch.overview,
    guardrails: [
      { label: 'Paper mode', value: 'on', state: 'on' },
      { label: 'Live execution', value: liveExecutionEnabled ? 'enabled' : 'off', state: liveExecutionEnabled ? 'warn' : 'off' },
      { label: 'Wallet permissions', value: walletPermissionsEnabled ? 'enabled' : 'off', state: walletPermissionsEnabled ? 'warn' : 'off' },
      { label: 'Exchange permissions', value: exchangePermissionsEnabled ? 'enabled' : 'off', state: exchangePermissionsEnabled ? 'warn' : 'off' },
      { label: 'Member pricing', value: `$${pricing.startingMonthlyUsd}/mo`, state: 'neutral' }
    ],
    pipeline: {
      strategies: strategies.map((strategy) => ({
        key: strategy.strategy_key,
        name: strategy.name,
        mode: strategy.mode,
        status: strategy.status,
        assets: Array.isArray(strategy.assets) ? strategy.assets : [],
        ruleType: strategy.rule_type,
        maxTradeSizeUsd: strategy.max_trade_size_usd,
        cooldownMinutes: strategy.cooldown_minutes,
        description: strategy.description,
        createdAt: strategy.created_at,
        updatedAt: strategy.updated_at
      })),
      intents: intents.map((intent) => ({
        key: intent.intent_key,
        strategyKey: intent.strategy_key,
        strategyName: intent.strategy_name,
        symbol: intent.symbol,
        side: intent.side,
        notionalUsd: intent.notional_usd,
        orderType: intent.order_type,
        status: intent.status,
        expiresAt: intent.expires_at,
        createdAt: intent.created_at
      })),
      riskChecks: riskChecks.map((riskCheck) => ({
        intentKey: riskCheck.intent_key,
        symbol: riskCheck.symbol,
        decision: riskCheck.decision,
        reason: riskCheck.reason,
        checks: objectEntries(riskCheck.checks),
        createdAt: riskCheck.created_at
      })),
      runs: runs.map((run) => ({
        key: run.run_key,
        type: run.run_type,
        status: run.status,
        summary: run.summary,
        flags: objectEntries(run.metadata),
        createdAt: run.created_at
      }))
    },
    testnet: {
      connectors: connectors.map((connector) => ({
        key: connector.network_key,
        name: connector.network_name,
        chainId: connector.chain_id,
        status: connector.status,
        walletAddress: maskValue(connector.wallet_address),
        explorerUrl: connector.explorer_url,
        lastCheckedAt: connector.last_checked_at,
        lastBlockNumber: connector.last_block_number,
        lastError: connector.last_error
      })),
      latestBalanceCheck: latestBalanceCheck
        ? {
            networkKey: latestBalanceCheck.network_key,
            walletAddress: maskValue(latestBalanceCheck.wallet_address),
            balanceEth: latestBalanceCheck.balance_eth,
            blockNumber: latestBalanceCheck.block_number,
            status: latestBalanceCheck.status,
            error: latestBalanceCheck.error,
            createdAt: latestBalanceCheck.created_at
          }
        : null,
      latestTransaction: latestTransaction
        ? {
            networkKey: latestTransaction.network_key,
            txHash: maskValue(latestTransaction.tx_hash),
            valueEth: latestTransaction.value_eth,
            purpose: latestTransaction.purpose,
            status: latestTransaction.status,
            error: latestTransaction.error,
            createdAt: latestTransaction.created_at
          }
        : null
    },
    lastUpdatedAt: getLatestTimestamp([
      ...strategies.flatMap((strategy) => [strategy.updated_at, strategy.created_at]),
      ...intents.map((intent) => intent.created_at),
      ...riskChecks.map((riskCheck) => riskCheck.created_at),
      ...runs.map((run) => run.created_at),
      ...connectors.flatMap((connector) => [
        connector.updated_at,
        connector.last_checked_at,
        connector.created_at
      ]),
      latestBalanceCheck?.created_at,
      latestTransaction?.created_at
    ])
  };
}

function getEnginePreviewPayload(engineId) {
  if (engineId === 'crypto-markov-regime') {
    return getMarkovRegimePreviewPayload();
  }

  return null;
}

function getEngineMemberPayload(engineId) {
  if (engineId === 'crypto-markov-regime') {
    return getMarkovRegimeMemberPayload();
  }

  return null;
}

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

// Owner override: a request authenticated with ADMIN_TOKEN (the same secret that
// gates /admin/* routes) skips the invite/redeem flow entirely and is treated as
// a full beta member. This only works for whoever holds ADMIN_TOKEN — it doesn't
// loosen access for anyone else, it just gives the site owner a direct way in
// without needing a live beta session.
function getOwnerOverrideMember(req) {
  if (!adminToken) return null;
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token !== adminToken) return null;
  return {
    id: 0,
    email: 'owner@obsidianabyss.com',
    name: 'Owner',
    status: 'approved',
    access_tier: 'owner',
    granted_at: new Date().toISOString(),
    last_login_at: new Date().toISOString()
  };
}

async function requireBetaMember(req, res, next) {
  const owner = getOwnerOverrideMember(req);
  if (owner) {
    req.betaMember = owner;
    next();
    return;
  }

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

async function handleStripeWebhook(req, res) {
  if (!isBillingConfigured()) {
    res.status(503).json({ ok: false, error: 'Billing is not configured.' });
    return;
  }

  let event;
  try {
    event = constructWebhookEvent(req.body, req.get('stripe-signature') || '');
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    res.status(400).json({ ok: false, error: 'Invalid signature' });
    return;
  }

  try {
    const action = interpretWebhookEvent(event);
    if (action.action === 'grant' && action.email) {
      const name = action.name || action.email.split('@')[0] || 'Member';
      await issueBetaInvite({ requestType: 'stripe', requestId: null, name, email: action.email });
      await linkBetaMemberStripe({
        email: action.email,
        customerId: action.customerId,
        subscriptionId: action.subscriptionId
      });
    } else if (action.action === 'revoke') {
      await revokeBetaMemberByStripeCustomer(action.customerId);
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing error:', error.message);
    res.status(500).json({ ok: false, error: 'Webhook processing failed' });
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

function objectEntries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).map(([key, entryValue]) => ({
    key,
    value: entryValue
  }));
}

function maskValue(value) {
  if (!value) {
    return '';
  }

  const text = String(value);
  if (text.length <= 14) {
    return text;
  }

  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function getLatestTimestamp(values) {
  let latest = null;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    if (!latest || date > latest) {
      latest = date;
    }
  }

  return latest ? latest.toISOString() : null;
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
