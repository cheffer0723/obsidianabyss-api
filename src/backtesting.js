import { getCatalog } from './advisor.js';

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
        takeaway: 'This lane behaves best once majors establish direction and hold it for longer windows.',
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
  'evm-trend-balanced': {
    curve: [30, 34, 39, 46, 44, 51, 58, 64, 70],
    stats: [
      { label: 'Signal cadence', value: 'moderate' },
      { label: 'Review load', value: 'moderate' },
      { label: 'Whipsaw pressure', value: 'medium' }
    ],
    scenarios: [
      {
        name: 'Base rotation',
        posture: 'best fit',
        takeaway: 'The EVM lane is strongest when sector rotation is directional but not chaotic.',
        metrics: [
          { label: 'Regime fit', value: 'balanced' },
          { label: 'Turnover', value: 'moderate' },
          { label: 'Base alignment', value: 'strong' }
        ]
      },
      {
        name: 'ETH drift',
        posture: 'steady state',
        takeaway: 'Slow ETH-led markets keep this lane readable, but patience still matters.',
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
    label: 'Historical data normalization',
    status: 'in progress',
    detail: 'Exchange-normalized candle and event inputs still need to be wired into one consistent research layer.'
  },
  {
    label: 'Fees and slippage model',
    status: 'queued',
    detail: 'Execution cost assumptions are not calibrated yet, so no performance claim should be treated as historical truth.'
  },
  {
    label: 'Walk-forward validation',
    status: 'queued',
    detail: 'Windowing, out-of-sample checks, and versioned reruns are still staged work.'
  },
  {
    label: 'Member reporting layer',
    status: 'active',
    detail: 'The UI layer can now surface decks, guardrails, and later real backtest outputs behind beta access.'
  }
];

const RESEARCH_QUEUE = [
  {
    label: 'Version every rule set',
    detail: 'Each algorithm revision needs a reproducible config fingerprint before members compare runs.'
  },
  {
    label: 'Separate calibration from marketing',
    detail: 'Synthetic and research-only runs must stay visibly distinct from true historical or live results.'
  },
  {
    label: 'Add venue assumptions',
    detail: 'Backtests need explicit venue, fee, slippage, and liquidity assumptions before they mean anything.'
  }
];

const METHODOLOGY = [
  'This lab is a development preview. The current decks are synthetic scenario calibrations, not historical return claims.',
  'Every setup still starts in paper mode. No wallet permissions, exchange credentials, or live orders are enabled from this layer.',
  'Real backtests unlock after algorithm inputs, fee assumptions, and walk-forward validation are versioned and reviewable.'
];

export function getBacktestingPayload({ strategies = [], runs = [] } = {}) {
  const catalog = getCatalog({ stage: 'v1' });
  const presets = catalog.map((item) => {
    const preset = LAB_PRESETS[item.key];
    return {
      key: item.key,
      name: item.name,
      chain: item.chain,
      asset: item.asset,
      risk: item.risk,
      modes: item.modes,
      summary: item.member_detail || item.summary,
      curveLabel: 'Relative scenario path',
      curve: preset.curve,
      stats: preset.stats,
      scenarios: preset.scenarios,
      caveat: 'Illustrative scenario deck only. Historical PnL, slippage, and venue assumptions are not wired yet.'
    };
  });

  return {
    notice:
      'Backtesting Lab is a development preview for beta members. What you see here is scenario calibration and workflow scaffolding, not audited historical performance.',
    overview: {
      previewDecks: presets.length,
      scenarioFamilies: presets.reduce((count, preset) => count + preset.scenarios.length, 0),
      strategyScaffolds: strategies.length,
      recentRuns: runs.length,
      validationCheckpoints: READINESS_ITEMS.length
    },
    methodology: METHODOLOGY,
    readiness: READINESS_ITEMS,
    presets,
    researchQueue: RESEARCH_QUEUE,
    guardrails: [
      { label: 'Synthetic decks', value: 'on' },
      { label: 'Historical PnL claims', value: 'off' },
      { label: 'Live execution', value: 'off' },
      { label: 'Wallet authority', value: 'off' }
    ],
    lastUpdatedAt: new Date().toISOString()
  };
}
