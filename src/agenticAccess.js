import { HTTPFacilitatorClient } from '@x402/core/server';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { declareBuilderCodeExtension } from '@x402/extensions';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { getBacktestingPayload } from './backtesting.js';

const BUILDER_CODE_PATTERN = /^[a-z0-9_]{1,32}$/;
const DEFAULT_RECEIVING_ADDRESS = '0xD0c7ac431D98e47230EF86E3391128D3aD0C6b13';

const plannedAgentRoutes = [
  {
    method: 'GET',
    path: '/agent/backtesting',
    purpose: 'Paid backtesting and research payload generation',
    pricingModel: 'per request',
    status: 'live when enabled'
  },
  {
    method: 'POST',
    path: '/agent/advisor/message',
    purpose: 'Paid advisor responses for machines and agent workflows',
    pricingModel: 'per request',
    status: 'planned'
  },
  {
    method: 'GET',
    path: '/agent/lookup',
    purpose: 'Paid catalog, lookup, and discovery access',
    pricingModel: 'per lookup',
    status: 'planned'
  }
];

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function getPayToAddress() {
  return (
    process.env.X402_RECEIVING_ADDRESS ||
    process.env.BASE_SEPOLIA_WALLET_ADDRESS ||
    DEFAULT_RECEIVING_ADDRESS ||
    ''
  ).trim();
}

function getAmount() {
  return (process.env.X402_AMOUNT || '$0.01').trim();
}

function getNetwork() {
  return (process.env.X402_NETWORK || 'eip155:84532').trim();
}

function getFacilitatorUrl() {
  return (
    process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator'
  ).trim();
}

export function isAgenticAccessConfigured() {
  return Boolean(
    process.env.X402_ENABLED === 'true' &&
      getFacilitatorUrl() &&
      getPayToAddress() &&
      getNetwork() &&
      getAmount()
  );
}

export function getAgenticAccessStatus() {
  return {
    enabled: isAgenticAccessConfigured(),
    protocol: 'x402',
    version: 'v2',
    facilitatorUrl: getFacilitatorUrl(),
    network: getNetwork(),
    receivingAddress: getPayToAddress(),
    currency: process.env.X402_CURRENCY || 'USDC',
    amount: getAmount(),
    builderCode: process.env.X402_BUILDER_CODE || null
  };
}

export function getAgenticPaidRouteConfig() {
  const builderCode = (process.env.X402_BUILDER_CODE || '').trim();
  const resourceBaseUrl = normalizeBaseUrl(
    process.env.PUBLIC_API_URL || 'https://obsidianabyss-api-production.up.railway.app'
  );
  const payTo = getPayToAddress();
  const network = getNetwork();
  const amount = getAmount();

  if (!resourceBaseUrl || !payTo || !network || !amount) {
    return null;
  }

  return {
    'GET /agent/backtesting': {
      accepts: {
        scheme: 'exact',
        price: amount,
        network,
        payTo,
        maxTimeoutSeconds: 120,
        extra: {
          surface: 'agentic',
          route: 'backtesting'
        }
      },
      resource: `${resourceBaseUrl}/agent/backtesting`,
      description: 'Paid agent access to the backtesting research payload',
      mimeType: 'application/json',
      serviceName: 'Obsidian Abyss',
      tags: ['agent', 'backtesting', 'x402'],
      extensions: BUILDER_CODE_PATTERN.test(builderCode)
        ? { ...declareBuilderCodeExtension(builderCode) }
        : undefined
    }
  };
}

export function createAgenticAccessMiddleware() {
  if (!isAgenticAccessConfigured()) {
    return null;
  }

  const facilitatorClient = new HTTPFacilitatorClient({
    url: getFacilitatorUrl()
  });
  const resourceServer = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(resourceServer, { networks: [getNetwork()] });

  const routes = getAgenticPaidRouteConfig();
  if (!routes) {
    return null;
  }

  return paymentMiddleware(routes, resourceServer);
}

export function getAgenticAccessCatalog() {
  return {
    ok: true,
    service: 'obsidianabyss-api',
    surface: 'agentic-access',
    status: getAgenticAccessStatus(),
    routes: plannedAgentRoutes,
    notes: [
      'Human beta access remains invite-based.',
      'Agentic routes are a separate paid surface.',
      'The live route is /agent/backtesting when X402_ENABLED=true.'
    ]
  };
}

export function getAgenticBacktestingPayload() {
  return {
    ok: true,
    mode: 'agent',
    surface: 'agentic-access',
    ...getBacktestingPayload()
  };
}
