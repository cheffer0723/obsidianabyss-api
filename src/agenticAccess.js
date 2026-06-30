import { HTTPFacilitatorClient } from '@x402/core/server';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { declareBuilderCodeExtension } from '@x402/extensions';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { getBacktestingPayload } from './backtesting.js';
import { env } from './env.js';

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
    env.x402.receivingAddress || DEFAULT_RECEIVING_ADDRESS || ''
  ).trim();
}

function getAmount() {
  return env.x402.amount.trim();
}

function getNetwork() {
  return env.x402.network.trim();
}

function getFacilitatorUrl() {
  return (
    env.x402.facilitatorUrl
  ).trim();
}

export function isAgenticAccessConfigured() {
  return Boolean(
    env.x402.enabled &&
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
    currency: env.x402.currency,
    amount: getAmount(),
    builderCode: env.x402.builderCode
  };
}

export function getAgenticPaidRouteConfig() {
  const builderCode = (env.x402.builderCode || '').trim();
  const resourceBaseUrl = normalizeBaseUrl(
    env.x402.publicApiUrl
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
