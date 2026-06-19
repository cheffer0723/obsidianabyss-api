import { getCatalog } from './advisor.js';
import { getDatasetRegistry } from './backtestDatasetRegistry.js';
import { getEngineResearchPayload } from './engineResearchBlueprint.js';
import { buildMarkovBacktestingPreset, getMarkovRegimeMeta } from './markovRegimeData.js';

const LAB_PRESETS = {
  'sol-launchrisk': {
    curve: [26, 31, 37, 34, 45, 52, 57, 62, 68],
    stats: [
      { label: 'Signal cadence', value: 'high' },
      { label: 'Review load', value: 'high' },
      { label: 'Whipsaw pressure', value: 'elevated' }
    ],
    scenarios: [
      {
        name: 'Launch wave',
        posture: 'best fit',
        takeaway: 'Works when deployer filtering cuts obvious traps before momentum accelerates.',
        metrics: [
          { label: 'Filter discipline', value: 'strong' },
          { label: 'Trade pacing', value: 'faster' },
          { label: 'Human review', value: 'required' }
        ]
      },
      {
        name: 'Headline chop',
        posture: 'stress case',
        takeaway: 'Social noise and rushed launches create the highest false-positive pressure here.',
        metrics: [
          { label: 'Noise handling', value: 'mixed' },
          { label: 'Cooldown need', value: 'high' },
          { label: 'Override risk', value: 'high' }
        ]
      },
      {
        name: 'Quiet market',
        posture: 'light activity',
        takeaway: 'The lane becomes more selective and can sit idle for long stretches.',
        metrics: [
          { label: 'Activity level', value: 'low' },
          { label: 'Selectivity', value: 'high' },
          { label: 'Patience needed', value: 'high' }
        ]
      }
    ]
  },
  'majors-trend': {
    curve: [32, 36, 42, 49, 55, 63, 68, 74, 81],
    stats: [
      { label: 'Signal cadence', value: 'slow' },
      { label: 'Review load', value: 'moderate' },
      { label: 'Whipsaw pressure', value: 'low' }
    ],
    scenarios: [
      {
        name: 'Trend expansion',
        posture: 'best fit',
        takeaway: 'This lane behaves best once established liquid markets pick a direction and hold it for longer windows.',
        metrics: [
          { label: 'Trend capture', value: 'strong' },
          { label: 'Turnover', value: 'low' },
          { label: 'Discipline fit', value: 'high' }
        ]
      },
      {
        name: 'Range compression',
        posture: 'stress case',
        takeaway: 'Long sideways periods reduce conviction and can make exits feel late.',
        metrics: [
          { label: 'Chop tolerance', value: 'moderate' },
          { label: 'Patience need', value: 'high' },
          { label: 'False breaks', value: 'moderate' }
        ]
      },
      {
        name: 'Vol shock',
        posture: 'guardrail test',
        takeaway: 'The risk layer matters more than the setup itself when volatility expands abruptly.',
        metrics: [
          { label: 'Risk gate reliance', value: 'high' },
          { label: 'Manual review', value: 'likely' },
          { label: 'Position sizing', value: 'tight' }
        ]
      }
    ]
  },
  'majors-meanrevert': {
    curve: [31, 35, 38, 44, 41, 48, 52, 57, 61],
    stats: [
      { label: 'Signal cadence', value: 'moderate' },
      { label: 'Review load', value: 'moderate' },
      { label: 'Whipsaw pressure', value: 'medium' }
    ],
    scenarios: [
      {
        name: 'Range stability',
        posture: 'best fit',
        takeaway: 'This lane is strongest when established liquid markets are rotating inside repeatable bands instead of trending cleanly.',
        metrics: [
          { label: 'Range fit', value: 'strong' },
          { label: 'Turnover', value: 'moderate' },
          { label: 'Discipline fit', value: 'high' }
        ]
      },
      {
        name: 'Breakout drift',
        posture: 'stress case',
        takeaway: 'Once a real trend starts, the mean-revert lane can become early, stubborn, and costly without hard exits.',
        metrics: [
          { label: 'Trend tolerance', value: 'low' },
          { label: 'Stop reliance', value: 'high' },
          { label: 'Manual restraint', value: 'important' }
        ]
      },
      {
        name: 'Vol spike',
        posture: 'guardrail test',
        takeaway: 'Fast volatility expansion forces tighter sizing and more conservative entry spacing.',
        metrics: [
          { label: 'Sizing pressure', value: 'high' },
          { label: 'Cooldown need', value: 'moderate' },
          { label: 'False reversal risk', value: 'elevated' }
        ]
      }
    ]
  },
  'evm-trend-balanced': {
    curve: [30, 34, 39, 46, 44, 51, 58, 64, 70],
    stats: [
      { label: 'Signal cadence', value: 'moderate' },
      { label: 'Review load', value: 'moderate' },
      { label: 'Whipsaw pressure', value: 'medium' }
    ],
    scenarios: [
      {
        name: 'Rotation alignment',
        posture: 'best fit',
        takeaway: 'This lane is strongest when broader market rotation is directional but not chaotic.',
        metrics: [
          { label: 'Regime fit', value: 'balanced' },
          { label: 'Turnover', value: 'moderate' },
          { label: 'Market alignment', value: 'strong' }
        ]
      },
      {
        name: 'Steady tape',
        posture: 'steady state',
        takeaway: 'Steadier market tapes keep this lane readable, but patience still matters.',
        metrics: [
          { label: 'Readability', value: 'high' },
          { label: 'Trade spacing', value: 'medium' },
          { label: 'Overtrade risk', value: 'low' }
        ]
      },
      {
        name: 'Fragmented tape',
        posture: 'stress case',
        takeaway: 'Cross-asset disagreement makes this lane lean harder on regime filters.',
        metrics: [
          { label: 'Filter pressure', value: 'high' },
          { label: 'Missed moves', value: 'possible' },
          { label: 'Signal confidence', value: 'mixed' }
        ]
      }
    ]
  }
};

const READINESS_ITEMS = [
  {
    label: 'Validated research export',
    status: 'active',
    detail:
      'Markov Regime now publishes a real walk-forward research export sourced from local engine output files.'
  },
  {
    label: 'Historical data normalization',
    status: 'in progress',
    detail:
      'The current Markov output is research-ready daily data. Execution-grade venue normalization is still a later milestone.'
  },
  {
    label: 'Fees and slippage model',
    status: 'queued',
    detail:
      'Execution cost assumptions are not calibrated yet, so read-only research output must not be treated as execution-grade historical truth.'
  },
  {
    label: 'Walk-forward validation',
    status: 'active',
    detail:
      'Walk-forward output exists for the published Markov engine, but rerun scheduling and versioned comparisons are still staged work.'
  },
  {
    label: 'Member reporting layer',
    status: 'active',
    detail:
      'The member UI can now surface one real engine export while keeping execution, custody, and live trading disabled.'
  }
];

const RESEARCH_QUEUE = [
  {
    label: 'Version every rule set',
    detail: 'Each algorithm revision needs a reproducible config fingerprint before members compare runs.'
  },
  {
    label: 'Separate calibration from marketing',
    detail:
      'Research-ready outputs must stay visibly distinct from execution-grade historical claims and anything live.'
  },
  {
    label: 'Add venue assumptions',
    detail: 'Backtests need explicit venue, fee, slippage, and liquidity assumptions before they mean anything.'
  }
];

const METHODOLOGY = [
  'This lab now includes one real walk-forward research export for Markov Regime. It is still not execution-grade historical performance.',
  'Every setup still starts in paper mode. No wallet permissions, exchange credentials, or live orders are enabled from this layer.',
  'Fees, slippage, venue replay, and versioned reruns still need to be explicit before any performance claim deserves more weight than research.'
];

export function getBacktestingPayload({ strategies = [], runs = [] } = {}) {
  const catalog = getCatalog({ stage: 'v1' });
  const datasetRegistry = getDatasetRegistry();
  const engineResearch = getEngineResearchPayload();
  const engineResearchById = new Map(engineResearch.engines.map((engine) => [engine.id, engine]));
  const presets = catalog.map((item) => {
    const preset = resolvePreset(item);
    const research = engineResearchById.get(item.key);

    return {
      key: item.key,
      name: item.name,
      chain: item.chain,
      asset: item.asset,
      risk: item.risk,
      modes: item.modes,
      summary: item.member_detail || item.summary,
      curveLabel: preset.curveLabel || 'Relative scenario path',
      curve: preset.curve,
      stats: preset.stats,
      scenarios: preset.scenarios,
      datasets: research?.datasets || [],
      readiness: research?.readiness || null,
      timeframe: preset.timeframe || null,
      venue: preset.venue || null,
      dataMode: preset.dataMode || 'synthetic',
      coverage: preset.coverage || null,
      aggregate: preset.aggregate || null,
      caveat:
        preset.caveat ||
        'Illustrative scenario deck only. Historical PnL, slippage, and venue assumptions are not wired yet.'
    };
  });
  const publishedResearchDecks = presets.filter((preset) => preset.dataMode === 'research-live').length;
  const syntheticDecks = presets.length - publishedResearchDecks;
  const markovMeta = catalog.some((item) => item.key === 'crypto-markov-regime')
    ? getMarkovRegimeMeta()
    : null;
  const totalAssetsCovered = presets.reduce(
    (sum, preset) => sum + Number(preset.coverage?.usableAssets || 0),
    0
  );
  const totalTradesCovered = presets.reduce(
    (sum, preset) => sum + Number(preset.aggregate?.totalTrades || 0),
    0
  );

  return {
    notice:
      publishedResearchDecks > 0
        ? 'Backtesting Lab now includes one real, read-only Markov Regime research export for beta members. It remains a research surface, not an execution layer or audited performance portal.'
        : 'Backtesting Lab is a development preview for beta members. What you see here is scenario calibration and workflow scaffolding, not audited historical performance.',
    overview: {
      publishedResearchDecks,
      syntheticDecks,
      previewDecks: presets.length,
      scenarioFamilies: presets.reduce((count, preset) => count + preset.scenarios.length, 0),
      datasetBundles: datasetRegistry.length,
      engineDefinitions: engineResearch.engines.length,
      strategyScaffolds: strategies.length,
      recentRuns: runs.length,
      validationCheckpoints: READINESS_ITEMS.length,
      assetsCovered: totalAssetsCovered,
      tradeSamples: totalTradesCovered
    },
    methodology: METHODOLOGY,
    readiness: READINESS_ITEMS,
    presets,
    research: engineResearch,
    researchQueue: RESEARCH_QUEUE,
    guardrails: [
      {
        label: 'Research-ready decks',
        value: publishedResearchDecks ? `${publishedResearchDecks} published` : 'none',
        state: publishedResearchDecks ? 'on' : 'off'
      },
      { label: 'Synthetic decks', value: syntheticDecks ? `${syntheticDecks} visible` : 'off', state: syntheticDecks ? 'warn' : 'off' },
      { label: 'Execution-grade claims', value: 'off', state: 'off' },
      { label: 'Live execution', value: 'off' },
      { label: 'Wallet authority', value: 'off' }
    ],
    lastValidatedAt: markovMeta?.lastValidatedAt || null,
    lastUpdatedAt: markovMeta?.sourceUpdatedAt || new Date().toISOString()
  };
}

function resolvePreset(item) {
  if (item.key === 'crypto-markov-regime') {
    return buildMarkovBacktestingPreset();
  }

  return LAB_PRESETS[item.key] || createFallbackPreset(item);
}

function createFallbackPreset(item) {
  return {
    curve: [30, 34, 39, 43, 47, 52, 56, 60, 64],
    stats: [
      { label: 'Signal cadence', value: item.modes.includes('alerts') ? 'event-driven' : 'moderate' },
      { label: 'Review load', value: 'moderate' },
      { label: 'Whipsaw pressure', value: 'unknown' }
    ],
    scenarios: [
      {
        name: 'Baseline',
        posture: 'preview',
        takeaway: 'Scenario deck has not been customized for this engine yet.',
        metrics: [
          { label: 'Engine', value: item.name },
          { label: 'Mode', value: item.modes.join(' / ') },
          { label: 'State', value: 'research' }
        ]
      }
    ],
    dataMode: 'synthetic'
  };
}
