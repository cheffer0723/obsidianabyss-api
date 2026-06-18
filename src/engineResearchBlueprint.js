import { getEngineCatalog } from './engineCatalog.js';
import { getDatasetRegistry, getDatasetsForEngine } from './backtestDatasetRegistry.js';

export function buildEngineResearchBlueprint() {
  return getEngineCatalog().map((engine) => {
    const datasets = getDatasetsForEngine(engine.id);
    const readiness = getReadinessForEngine(engine, datasets);

    return {
      id: engine.id,
      key: engine.key,
      name: engine.name,
      stage: engine.stage,
      category: engine.category,
      chain: engine.chain,
      asset: engine.asset,
      risk: engine.risk,
      modes: [...engine.modes],
      status: engine.stage,
      memberFacingState: engine.memberFacingState,
      markets: [...engine.markets],
      cadence: engine.cadence,
      executionModel: engine.executionModel,
      datasets: datasets.map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        status: dataset.status,
        dataTypes: [...dataset.dataTypes],
        sourceKind: dataset.sourceKind
      })),
      readiness
    };
  });
}

export function getEngineResearchPayload() {
  const engines = buildEngineResearchBlueprint();
  const datasets = getDatasetRegistry().map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    status: dataset.status,
    scope: [...dataset.scope],
    dataTypes: [...dataset.dataTypes],
    venue: dataset.venue,
    timeframes: [...dataset.timeframes],
    sourceKind: dataset.sourceKind
  }));

  return {
    notice:
      'Engine research status is a development snapshot. It maps what is defined, what data is assigned, and what is still synthetic or not yet validated.',
    overview: {
      totalEngines: engines.length,
      v1Engines: engines.filter((engine) => engine.stage === 'v1').length,
      laterEngines: engines.filter((engine) => engine.stage !== 'v1').length,
      datasetBundles: datasets.length,
      paperEligible: engines.filter((engine) => engine.memberFacingState === 'paper').length,
      alertEligible: engines.filter((engine) => engine.memberFacingState === 'alerts').length
    },
    engines,
    datasets,
    lastUpdatedAt: new Date().toISOString()
  };
}

function getReadinessForEngine(engine, datasets) {
  const hasDatasets = datasets.length > 0;
  const isScreening = engine.memberFacingState === 'alerts';
  const hasResearchReplay = datasets.some((dataset) =>
    ['research-ready', 'replay-ready'].includes(dataset.status)
  );
  const hasExecutionGradeReplay = datasets.some((dataset) => dataset.status === 'replay-ready');

  return {
    definitionLocked: true,
    datasetMapped: hasDatasets,
    historicalReplayReady: !isScreening && hasResearchReplay,
    paperExecutionReady: !isScreening && hasExecutionGradeReplay,
    alertValidationReady: isScreening && datasets.some((dataset) => dataset.status === 'replay-ready'),
    liveExecutionReady: false
  };
}
