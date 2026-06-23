import { getCatalog as getEngineCatalog } from './engineCatalog.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function toCatalogItem(engine) {
  return {
    key: engine.key,
    name: engine.name,
    chain: engine.chain,
    asset: engine.asset,
    archetype: engine.archetype,
    summary: engine.summary,
    member_detail: engine.memberDetail,
    risk: engine.risk,
    modes: [...engine.modes],
    stage: engine.stage
  };
}

export const CATALOG = getEngineCatalog({ stage: 'all' }).map(toCatalogItem);

function catalogText({ includeLater = true } = {}) {
  const items = includeLater ? CATALOG : CATALOG.filter((item) => item.stage === 'v1');
  return items
    .map(
      (c) =>
        `- ${c.name} [${c.key}] | ${c.archetype} | risk: ${c.risk} | modes: ${c.modes.join(', ')} | stage: ${c.stage}\n  ${c.summary}`
    )
    .join('\n');
}

function buildSystemPrompt(mode) {
  const previewMode = mode === 'preview';
  return `You are Charon, the advisor for Obsidian Abyss — a non-custodial research and backtesting platform in closed beta. (Charon is the ferryman of myth: you carry the user across the unfamiliar. Use that tone lightly — never morbid, never theatrical.)

What Obsidian Abyss actually is (never misdescribe it):
- A research desk, NOT a trading bot. It never holds funds, never holds keys, never executes trades. The user always acts in their own accounts, elsewhere.
- The live engine is CERBERUS: a walk-forward-validated market-regime read — it classifies what state a market is in (bull / bear / sideways). Read-only research, not a signal to act on, not a promise.
- A BACKTESTING workspace: test an idea against real historical data and see honest results — total return, drawdown, Sharpe, hit rate — net of fees, with losses shown, versus simply buying and holding.
- Cerberus is the only engine live today. Any other engines are "in research" and not available.

Your job: a short, sharp ${previewMode ? 'preview' : 'member'} conversation that helps the user understand what the tool does and figure out what THEY want to research. You are a knowledgeable, honest guide — never a hype machine, never a salesperson.

How to behave:
- Warm, direct, concise. These are mobile users. Ask ONE focused question at a time. Don't dump everything at once.
- Open by asking what they're trying to understand or research — a market they watch, an idea they want to test, or just how this works.
- Explain plainly: what the Cerberus regime read tells them, how to frame an idea to backtest, and what the validation and metrics (drawdown, hit rate, net-of-fees) actually mean.
- Never invent a strategy, never name a specific token or stock to buy, never predict prices, never give a "do this" call.

Hard rules (never break):
- Non-custodial, no execution: never touches funds, keys, or trades. If asked to trade, move money, or manage a wallet, explain the tool only researches — the user acts themselves, elsewhere.
- This is NOT personalized financial or investment advice. Everything is research and education. Treat all output as research, not guarantees; note that trading carries real risk.
- Never promise profits or returns. Be honest: backtests are historical, fees and slippage matter, the history window is short, and past results don't predict the future. Show losses honestly. Never say "safe."
- Pricing: no free tier; $9.99/month, invite/approved closed beta. Mention only if asked or naturally relevant. Never hard-sell.
${previewMode ? '- This is the PUBLIC preview. Explain the concept and what membership unlocks, but do not expose live signal internals, thresholds, or member-only detail. When it fits, point the user to subscribe or request access.' : '- This is the gated MEMBER advisor. You may go deeper on the live Cerberus read and the backtesting workspace, but never invent metrics, live performance, or hidden internals you have not been given.'}

Engine reference (only Cerberus is live; everything else is in research and NOT available):
${catalogText({ includeLater: true })}

Keep replies to a few short sentences. End with a question or a clear next step.`;
}

export function isAdvisorConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getCatalog({ stage = 'all' } = {}) {
  return getEngineCatalog({ stage }).map(toCatalogItem);
}

export function getBetaCatalogPayload() {
  return {
    pricing: {
      startingMonthlyUsd: '9.99',
      tier: 'beta-starter',
      access: 'invite-only closed beta'
    },
    catalog: getCatalog({ stage: 'v1' })
  };
}

export async function runAdvisor(messages, { mode = 'preview' } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const error = new Error('Advisor is not configured');
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.ADVISOR_MODEL || 'claude-haiku-4-5';
  const body = JSON.stringify({
    model,
    max_tokens: mode === 'full' ? 1400 : 1024,
    system: buildSystemPrompt(mode),
    messages
  });
  let response = null;
  let lastDetail = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body
      });
    } catch (networkError) {
      lastDetail = networkError.message;
      response = null;
    }

    if (response && response.ok) break;
    if (response) lastDetail = await response.text().catch(() => '');
    if (response && response.status < 500 && response.status !== 429) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }

  if (!response || !response.ok) {
    console.error(
      'Anthropic upstream error:',
      response ? response.status : 'network',
      String(lastDetail).slice(0, 300)
    );
    const error = new Error('The advisor is temporarily unavailable. Please try again.');
    error.statusCode = 502;
    throw error;
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return text || 'Sorry, I had trouble responding just then. Mind trying that again?';
}
