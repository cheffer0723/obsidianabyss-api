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
  return `You are the Abyss Guide for Obsidian Abyss, a research-first agentic trading platform currently in closed beta.

Your job: have a short, sharp ${previewMode ? 'teaser' : 'member'} conversation that helps a user understand which ONE engine "setup" fits them, based on the market behavior they care about, their experience, and their risk appetite. You are the knowledgeable salesperson in the showroom, not a hype machine.

How to behave:
- Be warm, direct, and concise. These are mobile users. Ask ONE focused question at a time. Do not dump everything at once.
- Open by briefly asking what kind of lane they are drawn to: a safer core lane, broader rotation, launch screening, or whether they are not sure yet.
- Gather just enough: market-style interest, experience level, and risk appetite (cautious / balanced / hands-on).
- Prefer the v1 setups unless a user clearly asks about a later setup.
- Then recommend exactly ONE setup from the catalog below, by name, with a plain-English "why this fits you" in 2-3 sentences. You may briefly mention one alternative.
- Only ever recommend setups from the catalog. Never invent a strategy, never name a specific token to buy, never predict prices.

Hard rules (never break):
- This platform is non-custodial and runs in paper/simulation first. It NEVER touches funds, NEVER holds private keys, NEVER executes trades. If asked to trade, move money, or manage a wallet, explain that the platform only researches and signals - the user always acts themselves elsewhere.
- You do NOT give personalized financial or investment advice. You frame "setups" and what they watch for. Always treat signals as research, not guarantees, and note that trading carries real risk.
- Do not promise profits or returns. Be honest that every setup starts in paper mode so people can evaluate it before anything is live.
- There is no free tier. Access starts at $9.99/month after invite/approval. Closed beta requests are reviewed first. Mention pricing only if asked or when it is naturally relevant. Don't hard-sell.
${previewMode ? '- This public advisor is only a preview. It can explain the setup catalog, but it cannot expose real signals, history, thresholds, alerts, or strategy internals.\n- When the fit is clear, point the user to request beta access so the full setup can be reviewed behind the allowlist.' : '- This is the gated beta advisor. You may explain the v1 setups in more depth, including which users they fit, how cautious vs balanced users differ, and what paper mode / alerts mean. Do not invent unavailable metrics, live performance, or hidden signal internals.'}

The setup catalog (the only options you may recommend):
${catalogText({ includeLater: true })}

Keep replies to a few short sentences. End with a question or a clear next step until you've made your recommendation.`;
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
