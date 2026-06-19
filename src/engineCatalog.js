function cloneEngine(engine) {
  return {
    ...engine,
    modes: [...engine.modes],
    markets: [...engine.markets],
    venues: [...engine.venues],
    backtestRequirements: [...engine.backtestRequirements],
    signalModel: {
      ...engine.signalModel,
      enrichments: [...engine.signalModel.enrichments]
    },
    riskModel: {
      ...engine.riskModel
    }
  };
}

export const ENGINE_CATALOG = [
  {
    id: 'sol-launchrisk',
    key: 'sol-launchrisk',
    name: 'Launch Screen',
    chain: 'Launch-risk lane',
    asset: 'New listings',
    archetype: 'launch-risk-screen',
    summary:
      'Flags unstable launch conditions and risky early patterns before a user engages.',
    memberDetail:
      'Best for users who want a slower first-pass screening workflow before they trust any fast-moving new listing.',
    risk: 'Cautious',
    modes: ['paper', 'alerts'],
    stage: 'v1',
    category: 'screening',
    audience: 'advanced',
    description:
      'Pre-trade risk screen for newly launched markets that flags deployer, launch, and liquidity-pattern risk before engagement is allowed.',
    markets: ['SOLANA-NEW-LAUNCHES'],
    venues: ['solana'],
    cadence: 'event-driven',
    executionModel: 'rules-only',
    signalModel: {
      primary: 'launch-risk-classifier',
      enrichments: ['deployer-history', 'liquidity-shape', 'social-velocity']
    },
    riskModel: {
      maxConcurrentPositions: 0,
      stopPolicy: 'screening-only',
      sizing: 'not-applicable'
    },
    backtestRequirements: [
      'launch-metadata',
      'liquidity-events',
      'post-launch-price-series',
      'labelled-outcomes'
    ],
    memberFacingState: 'alerts'
  },
  {
    id: 'majors-trend',
    key: 'majors-trend',
    name: 'Core Trend',
    chain: 'Core markets',
    asset: 'Liquid leaders',
    archetype: 'trend-regime',
    summary:
      'Clean trend and regime signal on established liquid markets for users who want the safest starting lane.',
    memberDetail:
      'Best for cautious users who want one understandable core setup before touching anything noisy or fast-moving.',
    risk: 'Cautious',
    modes: ['paper', 'alerts'],
    stage: 'v1',
    category: 'trend',
    audience: 'starter',
    description:
      'Deterministic trend-following engine for established liquid markets with regime gating and conservative risk controls.',
    markets: ['BTC/USD', 'ETH/USD'],
    venues: ['centralized-exchange', 'testnet-simulation'],
    cadence: '15m-4h',
    executionModel: 'rules-only',
    signalModel: {
      primary: 'regime-filter-plus-trend-confirmation',
      enrichments: ['volatility-state', 'liquidity-context']
    },
    riskModel: {
      maxConcurrentPositions: 2,
      stopPolicy: 'hard-stop-plus-trailing-protection',
      sizing: 'fixed-fraction-capped'
    },
    backtestRequirements: ['candles', 'spread-assumptions', 'fees', 'slippage'],
    memberFacingState: 'paper'
  },
  {
    id: 'majors-meanrevert',
    key: 'majors-meanrevert',
    name: 'Core Mean-Revert',
    chain: 'Core markets',
    asset: 'Liquid leaders',
    archetype: 'volatility-meanrevert',
    summary: 'Range and volatility reversion signals for established liquid markets.',
    memberDetail:
      'Best for users who want a rules-based core lane during sideways or unstable conditions instead of waiting only for trend confirmation.',
    risk: 'Balanced',
    modes: ['paper'],
    stage: 'v1',
    category: 'mean-reversion',
    audience: 'starter',
    description:
      'Deterministic range and volatility reversion engine for established liquid markets when the regime is non-trending.',
    markets: ['BTC/USD', 'ETH/USD'],
    venues: ['centralized-exchange', 'testnet-simulation'],
    cadence: '5m-1h',
    executionModel: 'rules-only',
    signalModel: {
      primary: 'range-detection-plus-reversion-trigger',
      enrichments: ['volatility-state', 'session-filter']
    },
    riskModel: {
      maxConcurrentPositions: 2,
      stopPolicy: 'tight-hard-stop',
      sizing: 'fixed-fraction-capped'
    },
    backtestRequirements: ['candles', 'spread-assumptions', 'fees', 'slippage'],
    memberFacingState: 'paper'
  },
  {
    id: 'evm-trend-balanced',
    key: 'evm-trend-balanced',
    name: 'Trend Reader',
    chain: 'Rotation lane',
    asset: 'Broader market rotation',
    archetype: 'trend-regime',
    summary:
      'Balanced regime and trend signals for broader market rotation without drifting into launch chaos.',
    memberDetail:
      'Best for users who want a broader opportunity set than the core lane, but still want a deliberate route into permissioned workflows later.',
    risk: 'Balanced',
    modes: ['paper'],
    stage: 'v1',
    category: 'trend',
    audience: 'intermediate',
    description:
      'Trend and regime engine for broader rotation opportunities with simpler exposure than low-liquidity launch systems.',
    markets: ['ETH/USD', 'BASE-MAJORS'],
    venues: ['centralized-exchange', 'testnet-simulation'],
    cadence: '1h-1d',
    executionModel: 'rules-only',
    signalModel: {
      primary: 'markov-regime-plus-momentum-bias',
      enrichments: ['market-session-state', 'cross-asset-strength']
    },
    riskModel: {
      maxConcurrentPositions: 3,
      stopPolicy: 'regime-exit-plus-hard-stop',
      sizing: 'volatility-target-capped'
    },
    backtestRequirements: ['candles', 'benchmark-series', 'fees', 'slippage'],
    memberFacingState: 'paper'
  },
  {
    id: 'sol-social-cautious',
    key: 'sol-social-cautious',
    name: 'Momentum Radar',
    chain: 'Momentum lane',
    asset: 'Fast movers',
    archetype: 'social-momentum',
    summary:
      'Watches participation momentum and flags manufactured hype versus organic interest in fast-moving markets.',
    memberDetail:
      'Best for users who want a sentiment and participation screen before taking any action in noisy momentum environments.',
    risk: 'Cautious',
    modes: ['paper', 'alerts'],
    stage: 'later',
    category: 'social-momentum',
    audience: 'advanced',
    description:
      'Social-momentum and participation quality screen for fast-moving listings, kept outside the v1 trading lane until its data provenance is stronger.',
    markets: ['SOLANA-NEW-LAUNCHES'],
    venues: ['solana'],
    cadence: 'event-driven',
    executionModel: 'rules-only',
    signalModel: {
      primary: 'social-velocity-quality-screen',
      enrichments: ['launch-metadata', 'deployer-history', 'community-velocity']
    },
    riskModel: {
      maxConcurrentPositions: 0,
      stopPolicy: 'screening-only',
      sizing: 'not-applicable'
    },
    backtestRequirements: [
      'social-velocity',
      'launch-metadata',
      'post-launch-price-series',
      'labelled-outcomes'
    ],
    memberFacingState: 'alerts'
  }
];

export function getCatalog({ stage = 'all' } = {}) {
  if (stage === 'v1') {
    return ENGINE_CATALOG.filter((engine) => engine.stage === 'v1').map(cloneEngine);
  }

  if (stage === 'later') {
    return ENGINE_CATALOG.filter((engine) => engine.stage === 'later').map(cloneEngine);
  }

  return ENGINE_CATALOG.map(cloneEngine);
}

export function getEngineCatalog() {
  return getCatalog({ stage: 'all' });
}

export function getEngineById(id) {
  const engine = ENGINE_CATALOG.find((entry) => entry.id === id);
  return engine ? cloneEngine(engine) : null;
}

export function getBacktestableEngines() {
  return ENGINE_CATALOG.filter((engine) => engine.memberFacingState === 'paper').map(cloneEngine);
}
