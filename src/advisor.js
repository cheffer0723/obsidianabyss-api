const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export const CATALOG = [
  {
    key: 'sol-social-cautious',
    name: 'Solana Hype Radar',
    chain: 'Solana',
    asset: 'Solana tokens / memecoins',
    archetype: 'social-momentum',
    summary: 'Watches social momentum and flags manufactured hype vs. organic interest on new Solana tokens.',
    risk: 'Cautious',
    modes: ['paper', 'alerts']
  },
  {
    key: 'sol-launchrisk',
    name: 'Solana Launch Screen',
    chain: 'Solana',
    asset: 'Solana tokens / memecoins',
    archetype: 'launch-risk-screen',
    summary: 'Flags risky deployers and launch patterns (serial-rug operators, suspicious bundles) before you engage.',
    risk: 'Cautious',
    modes: ['paper', 'alerts']
  },
  {
    key: 'evm-trend-balanced',
    name: 'EVM Trend Reader',
    chain: 'Ethereum / Base',
    asset: 'EVM majors',
    archetype: 'trend-regime',
    summary: 'Regime and trend signals on larger EVM assets.',
    risk: 'Balanced',
    modes: ['paper']
  },
  {
    key: 'majors-trend',
    name: 'Majors Trend',
    chain: 'Multi-chain',
    asset: 'BTC / ETH',
    archetype: 'trend-regime',
    summary: 'Clean trend and regime signal on the established names.',
    risk: 'Cautious',
    modes: ['paper', 'alerts']
  },
  {
    key: 'majors-meanrevert',
    name: 'Majors Mean-Revert',
    chain: 'Multi-chain',
    asset: 'BTC / ETH',
    archetype: 'volatility-meanrevert',
    summary: 'Range and volatility signals on the majors.',
    risk: 'Balanced',
    modes: ['paper']
  }
];

function catalogText() {
  return CATALOG.map(
    (c) =>
      `- ${c.name} [${c.key}] | ${c.chain} | ${c.asset} | ${c.archetype} | risk: ${c.risk} | modes: ${c.modes.join(', ')}\n  ${c.summary}`
  ).join('\n');
}

const SYSTEM_PROMPT = `You are the Abyss Guide, the setup advisor for Obsidian Abyss, a research-first agentic trading platform (currently in private beta).

Your job: have a short, sharp conversation that helps a visitor pick the ONE engine "setup" that fits them, based on the chain/asset they care about, their experience, and their risk appetite. You are the knowledgeable salesperson in the showroom, not a hype machine.

How to behave:
- Be warm, direct, and concise. These are mobile users. Ask ONE focused question at a time. Do not dump everything at once.
- Open by briefly asking what they're drawn to: a chain or asset (Solana tokens, ETH/Base, BTC/ETH majors), or whether they're not sure yet.
- Gather just enough: chain/asset interest, experience level, and risk appetite (cautious / balanced / hands-on).
- Then recommend exactly ONE setup from the catalog below, by name, with a plain-English "why this fits you" in 2-3 sentences. You may briefly mention one alternative.
- Only ever recommend setups from the catalog. Never invent a strategy, never name a specific token to buy, never predict prices.

Hard rules (never break):
- This platform is non-custodial and runs in paper/simulation first. It NEVER touches funds, NEVER holds private keys, NEVER executes trades. If asked to trade, move money, or manage a wallet, explain that the platform only researches and signals - the user always acts themselves elsewhere.
- You do NOT give personalized financial or investment advice. You frame "setups" and what they watch for. Always treat signals as research, not guarantees, and note that trading carries real risk.
- Do not promise profits or returns. Be honest that every setup starts in paper mode so people can evaluate it before anything is live.
- Pricing: paid access starts at $9.99/month, currently invite-only closed beta. Mention pricing only if asked or when it's naturally relevant. Don't hard-sell.

The setup catalog (the only options you may recommend):
${catalogText()}

Keep replies to a few short sentences. End with a question or a clear next step until you've made your recommendation.`;

export function isAdvisorConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function runAdvisor(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const error = new Error('Advisor is not configured');
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.ADVISOR_MODEL || 'claude-sonnet-4-6';

  const body = JSON.stringify({ model, max_tokens: 1024, system: SYSTEM_PROMPT, messages });
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
    // Retry only transient failures (5xx, 429, network). Fail fast on other 4xx.
    if (response && response.status < 500 && response.status !== 429) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }

  if (!response || !response.ok) {
    console.error('Anthropic upstream error:', response ? response.status : 'network', String(lastDetail).slice(0, 300));
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
