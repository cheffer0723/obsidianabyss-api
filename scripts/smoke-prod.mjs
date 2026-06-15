import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API_BASE = process.env.API_BASE || 'https://obsidianabyss-api-production.up.railway.app';
const SITE_URLS = [
  'https://obsidianabyss.com/',
  'https://www.obsidianabyss.com/',
  'https://obsidianabyss.com/admin.html',
  'https://www.obsidianabyss.com/admin.html'
];
const allowedOrigin = process.env.SMOKE_ORIGIN || 'https://obsidianabyss.com';
const shouldSubmit = process.argv.includes('--submit');
const shouldPatch = process.argv.includes('--patch-status');
const adminToken = process.env.ADMIN_TOKEN || (await readAdminToken());
const results = [];

await checkPages();
await checkHealth();
await checkCors('/contact');
await checkCors('/wallet-beta-request');
await checkAdminList('/admin/contact-requests', 'contact admin list');
await checkAdminList('/admin/wallet-beta-requests', 'wallet admin list');
await checkAdminList('/admin/strategies', 'strategy admin list', 'strategies');
await checkAdminList('/admin/execution-intents', 'execution intent admin list', 'intents');
await checkAdminList('/admin/risk-checks', 'risk check admin list', 'checks');
await checkAdminList('/admin/agent-runs', 'agent run admin list', 'runs');

if (shouldSubmit) {
  const contact = await submitContact();
  const wallet = await submitWallet();

  if (shouldPatch) {
    await patchStatus(`/admin/contact-requests/${contact?.request?.id}/status`, 'contact status patch');
    await patchStatus(`/admin/wallet-beta-requests/${wallet?.request?.id}/status`, 'wallet status patch');
  }
}

printResults();

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}

async function checkPages() {
  for (const url of SITE_URLS) {
    await record(`page ${url}`, async () => {
      const response = await fetch(url, { redirect: 'follow' });
      const body = await response.text();
      assert(response.ok, `expected 2xx, got ${response.status}`);
      assert(body.includes('Obsidian Abyss'), 'missing Obsidian Abyss text');
      if (url.includes('admin.html')) {
        assert(body.includes('Obsidian Abyss Admin'), 'missing admin title');
      } else {
        assert(body.includes(API_BASE), 'missing production API base');
      }
      return `${response.status} ${response.url}`;
    });
  }
}

async function checkHealth() {
  await record('api health', async () => {
    const body = await requestJson(`${API_BASE}/health`);
    assert(body.ok === true, 'health ok was not true');
    assert(body.database?.configured === true, 'database not configured');
    assert(body.admin?.configured === true, 'admin not configured');
    assert(body.mail?.configured === true, 'mail not configured');
    return 'database/admin/mail configured';
  });
}

async function checkCors(pathname) {
  await record(`cors ${pathname}`, async () => {
    const response = await fetch(`${API_BASE}${pathname}`, {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    assert(response.status === 204, `expected 204, got ${response.status}`);
    assert(
      response.headers.get('access-control-allow-origin') === allowedOrigin,
      'origin was not allowed'
    );
    return response.headers.get('access-control-allow-origin');
  });
}

async function checkAdminList(pathname, label, collectionKey = 'requests') {
  await record(label, async () => {
    assert(adminToken, 'ADMIN_TOKEN missing');
    const body = await requestJson(`${API_BASE}${pathname}?limit=1`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });
    assert(body.ok === true, 'admin response ok was not true');
    assert(Array.isArray(body[collectionKey]), `${collectionKey} was not an array`);
    return `${body[collectionKey].length} row(s) returned`;
  });
}

async function submitContact() {
  return record('submit contact', async () => {
    const stamp = new Date().toISOString();
    const body = await requestJson(`${API_BASE}/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: allowedOrigin
      },
      body: JSON.stringify({
        name: `Codex Smoke Contact ${stamp}`,
        email: `codex-smoke-contact-${Date.now()}@example.com`,
        experienceLevel: 'beginner',
        accessMode: 'paper',
        preferredAssets: 'BTC',
        preferredExchange: 'undecided',
        automationComfort: 'cautious',
        message: `Production smoke test contact submission at ${stamp}.`,
        company: ''
      })
    });
    assert(body.ok === true, 'submission ok was not true');
    assert(body.notification?.sent === true, 'notification was not sent');
    return body;
  });
}

async function submitWallet() {
  return record('submit wallet beta', async () => {
    const stamp = new Date().toISOString();
    const body = await requestJson(`${API_BASE}/wallet-beta-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: allowedOrigin
      },
      body: JSON.stringify({
        name: `Codex Smoke Wallet ${stamp}`,
        email: `codex-smoke-wallet-${Date.now()}@example.com`,
        walletAddress: 'codex-smoke-no-wallet',
        experienceLevel: 'beginner',
        accessMode: 'small-live-beta',
        preferredAssets: 'BTC, ETH',
        preferredExchange: 'Coinbase',
        automationComfort: 'needs-guardrails',
        notes: `Production smoke test wallet submission at ${stamp}.`,
        company: ''
      })
    });
    assert(body.ok === true, 'submission ok was not true');
    assert(body.notification?.sent === true, 'notification was not sent');
    return body;
  });
}

async function patchStatus(pathname, label) {
  await record(label, async () => {
    assert(adminToken, 'ADMIN_TOKEN missing');
    assert(!pathname.includes('/undefined/'), 'missing submitted request id');
    const body = await requestJson(`${API_BASE}${pathname}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'reviewed' })
    });
    assert(body.ok === true, 'patch ok was not true');
    assert(body.request?.status === 'reviewed', 'status was not reviewed');
    return `request ${body.request.id} reviewed`;
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  assert(response.ok, `${url} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function record(name, fn) {
  try {
    const detail = await fn();
    const result = { name, ok: true, detail };
    results.push(result);
    return detail;
  } catch (error) {
    const result = { name, ok: false, detail: error.message };
    results.push(result);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readAdminToken() {
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const apiRoot = path.resolve(path.dirname(scriptPath), '..');
    const env = await readFile(path.join(apiRoot, '.env.local'), 'utf8');
    const line = env
      .split(/\r?\n/)
      .find((entry) => entry.startsWith('ADMIN_TOKEN='));
    return line ? line.slice('ADMIN_TOKEN='.length).trim() : '';
  } catch {
    return '';
  }
}

function printResults() {
  for (const result of results) {
    const status = result.ok ? 'PASS' : 'FAIL';
    const detail =
      typeof result.detail === 'string'
        ? result.detail
        : JSON.stringify(result.detail?.request || result.detail || {});
    console.log(`${status} ${result.name} - ${detail}`);
  }
}
