function cloneDataset(dataset) {
  return {
    ...dataset,
    scope: [...dataset.scope],
    dataTypes: [...dataset.dataTypes],
    timeframes: [...dataset.timeframes]
  };
}

export const DATASET_REGISTRY = [
  {
    id: 'majors-core-candles-v1',
    name: 'Core Market Research Candles',
    status: 'partial',
    scope: ['BTC/USD', 'ETH/USD'],
    dataTypes: ['candles'],
    venue: 'centralized-exchange',
    timeframes: ['5m', '15m', '1h', '4h'],
    sourceKind: 'local',
    notes:
      'Registry slot exists, but the currently available local evidence is daily research-series data rather than exchange-normalized intraday candles with costs and slippage.'
  },
  {
    id: 'evm-regime-candles-v1',
    name: 'Adaptive Market Research Candles',
    status: 'research-ready',
    scope: ['ETH/USD', 'BASE-MAJORS'],
    dataTypes: ['candles', 'benchmarks'],
    venue: 'centralized-exchange',
    timeframes: ['1h', '4h', '1d'],
    sourceKind: 'local',
    notes:
      'Local research folder contains reusable daily price-series caches plus walk-forward outputs suitable for regime research, but not yet execution-grade venue replay.'
  },
  {
    id: 'solana-launch-intel-v1',
    name: 'Launch Intelligence',
    status: 'planned',
    scope: ['SOLANA-NEW-LAUNCHES'],
    dataTypes: ['launch_metadata', 'liquidity_events', 'post_launch_price_series'],
    venue: 'solana',
    timeframes: ['event-driven'],
    sourceKind: 'local-plus-ingestion',
    notes:
      'Screening dataset for launch risk classification. This is an alerts and risk-screen bundle, not a standard trade replay bundle.'
  },
  {
    id: 'solana-social-velocity-v1',
    name: 'Momentum Velocity Research',
    status: 'planned',
    scope: ['SOLANA-NEW-LAUNCHES'],
    dataTypes: ['social_velocity', 'launch_metadata', 'post_launch_price_series'],
    venue: 'solana',
    timeframes: ['event-driven'],
    sourceKind: 'local-plus-ingestion',
    notes:
      'Later-stage dataset for social velocity screening once source provenance and replay logic are consistent.'
  }
];

export function getDatasetRegistry() {
  return DATASET_REGISTRY.map(cloneDataset);
}

export function getDatasetById(id) {
  const dataset = DATASET_REGISTRY.find((entry) => entry.id === id);
  return dataset ? cloneDataset(dataset) : null;
}

export function getDatasetsForEngine(engineId) {
  switch (engineId) {
    case 'majors-trend':
    case 'majors-meanrevert':
      return DATASET_REGISTRY.filter((dataset) => dataset.id === 'majors-core-candles-v1').map(
        cloneDataset
      );
    case 'evm-trend-balanced':
      return DATASET_REGISTRY.filter((dataset) => dataset.id === 'evm-regime-candles-v1').map(
        cloneDataset
      );
    case 'sol-launchrisk':
      return DATASET_REGISTRY.filter((dataset) => dataset.id === 'solana-launch-intel-v1').map(
        cloneDataset
      );
    case 'sol-social-cautious':
      return DATASET_REGISTRY.filter((dataset) => dataset.id === 'solana-social-velocity-v1').map(
        cloneDataset
      );
    default:
   