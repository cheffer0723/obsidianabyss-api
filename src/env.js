import { z } from 'zod';

function parseBool(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }

  return undefined;
}

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  ALLOWED_ORIGINS: z.string().default(''),
  ADMIN_TOKEN: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.preprocess(parseBool, z.boolean().default(false)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  MAIL_TO: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ADVISOR_MODEL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  BILLING_SUCCESS_URL: z.string().optional(),
  BILLING_CANCEL_URL: z.string().optional(),
  BETA_APP_URL: z.string().optional(),
  BETA_SESSION_COOKIE_NAME: z.string().optional(),
  BETA_INVITE_HOURS: z.coerce.number().int().positive().optional(),
  BETA_SESSION_HOURS: z.coerce.number().int().positive().optional(),
  X402_ENABLED: z.string().optional(),
  X402_FACILITATOR_URL: z.string().optional(),
  X402_NETWORK: z.string().optional(),
  X402_RECEIVING_ADDRESS: z.string().optional(),
  X402_CURRENCY: z.string().optional(),
  X402_AMOUNT: z.string().optional(),
  X402_BUILDER_CODE: z.string().optional(),
  PUBLIC_API_URL: z.string().optional(),
  BASE_SEPOLIA_RPC_URL: z.string().optional(),
  BASE_SEPOLIA_CHAIN_ID: z.coerce.number().int().positive().optional(),
  BASE_SEPOLIA_WALLET_ADDRESS: z.string().optional(),
  BASE_SEPOLIA_EXPLORER_URL: z.string().optional(),
  MIROFISH_BASE_URL: z.string().optional(),
  MARKOV_ENGINE_OUTPUT_DIR: z.string().optional(),
  API_BASE: z.string().optional(),
  SMOKE_ORIGIN: z.string().optional()
});

const parsed = envSchema.parse(process.env);

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  allowedOrigins: parseCsv(parsed.ALLOWED_ORIGINS),
  adminToken: parsed.ADMIN_TOKEN || null,
  databaseUrl: parsed.DATABASE_URL || null,
  smtp: {
    host: parsed.SMTP_HOST || null,
    port: parsed.SMTP_PORT,
    secure: parsed.SMTP_SECURE,
    user: parsed.SMTP_USER || null,
    pass: parsed.SMTP_PASS || null,
    from: parsed.MAIL_FROM || parsed.SMTP_USER || null,
    to: parsed.MAIL_TO || parsed.MAIL_FROM || parsed.SMTP_USER || null
  },
  advisor: {
    apiKey: parsed.ANTHROPIC_API_KEY || null,
    model: parsed.ADVISOR_MODEL || 'claude-haiku-4-5'
  },
  billing: {
    secretKey: parsed.STRIPE_SECRET_KEY || null,
    priceId: parsed.STRIPE_PRICE_ID || null,
    webhookSecret: parsed.STRIPE_WEBHOOK_SECRET || null,
    successUrl:
      parsed.BILLING_SUCCESS_URL || 'https://www.obsidianabyss.com/access.html?checkout=success',
    cancelUrl:
      parsed.BILLING_CANCEL_URL || 'https://www.obsidianabyss.com/access.html?checkout=cancelled'
  },
  beta: {
    appUrl: parsed.BETA_APP_URL || 'https://www.obsidianabyss.com/beta.html',
    sessionCookieName: parsed.BETA_SESSION_COOKIE_NAME || 'obsidian_beta_session',
    inviteHours: parsed.BETA_INVITE_HOURS || 168,
    sessionHours: parsed.BETA_SESSION_HOURS || 336
  },
  x402: {
    enabled: parsed.X402_ENABLED === 'true',
    facilitatorUrl: parsed.X402_FACILITATOR_URL || 'https://x402.org/facilitator',
    network: parsed.X402_NETWORK || 'eip155:84532',
    receivingAddress:
      parsed.X402_RECEIVING_ADDRESS || parsed.BASE_SEPOLIA_WALLET_ADDRESS || '0xD0c7ac431D98e47230EF86E3391128D3aD0C6b13',
    currency: parsed.X402_CURRENCY || 'USDC',
    amount: parsed.X402_AMOUNT || '$0.01',
    builderCode: parsed.X402_BUILDER_CODE || null,
    publicApiUrl:
      parsed.PUBLIC_API_URL || 'https://obsidianabyss-api-production.up.railway.app'
  },
  baseSepolia: {
    rpcUrl: parsed.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    chainId: parsed.BASE_SEPOLIA_CHAIN_ID || 84532,
    walletAddress:
      parsed.BASE_SEPOLIA_WALLET_ADDRESS || '0xD0c7ac431D98e47230EF86E3391128D3aD0C6b13',
    explorerUrl: parsed.BASE_SEPOLIA_EXPLORER_URL || 'https://sepolia-explorer.base.org'
  },
  mirofishBaseUrl: parsed.MIROFISH_BASE_URL || null,
  markovEngineOutputDir: parsed.MARKOV_ENGINE_OUTPUT_DIR || null,
  smoke: {
    apiBase: parsed.API_BASE || 'https://obsidianabyss-api-production.up.railway.app',
    origin: parsed.SMOKE_ORIGIN || 'https://obsidianabyss.com'
  }
};
