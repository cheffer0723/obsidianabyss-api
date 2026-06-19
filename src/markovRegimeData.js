import fs from 'node:fs';
import path from 'node:path';

const ENGINE_ID = 'crypto-markov-regime';
const ENGINE_NAME = 'Markov Regime';
const env = globalThis.process?.env || {};
const DEFAULT_OUTPUT_DIR =
  env.MARKOV_ENGINE_OUTPUT_DIR ||
  'C:/Users/DUNAMIS/llm_youtube_engine_research/engine_output';
const SIGNALS_FILE = 'latest_signals.csv';
const RESULTS_FILE = 'engine_results.json';
const SIGNALS_PATH = path.join(DEFAULT_OUTPUT_DIR, SIGNALS_FILE);
const RESULTS_PATH = path.join(DEFAULT_OUTPUT_DIR, RESULTS_FILE);

let cachedSignature = '';
let cachedPayload = null;

export function getMarkovRegimePreviewPayload() {
  return loadMarkovRegimeData().preview;
}

export function getMarkovRegimeMemberPayload() {
  return loadMarkovRegimeData().member;
}

export function buildMarkovBacktestingPreset() {
  return loadMarkovRegimeData().backtestingPreset;
}

export function getMarkovRegimeMeta() {
  const data = loadMarkovRegimeData();
  return {
    engineId: ENGINE_ID,
    name: ENGINE_NAME,
    lastValidatedAt: data.preview.lastValidatedAt,
    sourceUpdatedAt: data.preview.sourceUpdatedAt,
    usableAssets: data.preview.coverage.usableAssets
  };
}

function loadMarkovRegimeData() {
  const sourceStats = getSourceStats();
  const signature = `${sourceStats.signals.mtimeMs}:${sourceStats.signals.size}|${sourceStats.results.mtimeMs}:${sourceStats.results.size}`;
  if (cachedPayload && cachedSignature === signature) {
    return cachedPayload;
  }

  try {
    const signalRows = parseCsv(fs.readFileSync(SIGNALS_PATH, 'utf8'));
    const resultRows = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    const payload = buildPayload({ signalRows, resultRows, sourceStats });
    cachedSignature = signature;
    cachedPayload = payload;
    return payload;
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      const unavailable = new Error('Markov regime research files are not available.');
      unavailable.statusCode = 503;
      throw unavailable;
    }

    if (error instanceof SyntaxError) {
      const invalid = new Error('Markov regime research files could not be parsed.');
      invalid.statusCode = 502;
      throw invalid;
    }

    throw error;
  }
}

function getSourceStats() {
  return {
    signals: fs.statSync(SIGNALS_PATH),
    results: fs.statSync(RESULTS_PATH)
  };
}

function buildPayload({ signalRows, resultRows, sourceStats }) {
  const signalsById = new Map();
  for (const row of signalRows) {
    if (row.coin_id) {
      signalsById.set(row.coin_id, row);
    }
  }

  const usableAssets = [];
  const incompleteAssets = [];

  for (const result of resultRows) {
    const asset = normalizeAsset(result, signalsById.get(result?.coin?.coin_id));
    if (asset.walkForward) {
      usableAssets.push(asset);
      continue;
    }

    incompleteAssets.push({
      coinId: asset.coinId,
      symbol: asset.symbol,
      name: asset.name,
      warning: asset.warning || 'Walk-forward summary missing.'
    });
  }

  usableAssets.sort(
    (left, right) => right.walkForward.cumulativeReturn - left.walkForward.cumulativeReturn
  );

  const cumulativeReturns = usableAssets.map((asset) => asset.walkForward.cumulativeReturn);
  const hitRates = usableAssets.map((asset) => asset.walkForward.hitRateActive).filter(isFiniteNumber);
  const sharpeValues = usableAssets
    .map((asset) => asset.walkForward.sharpeLike365d)
    .filter(isFiniteNumber);
  const totalTrades = usableAssets.reduce((sum, asset) => sum + asset.tradeBreakdown.totalTrades, 0);
  const winningTrades = usableAssets.reduce(
    (sum, asset) => sum + asset.tradeBreakdown.winningTrades,
    0
  );
  const losingTrades = usableAssets.reduce(
    (sum, asset) => sum + asset.tradeBreakdown.losingTrades,
    0
  );
  const flatTrades = usableAssets.reduce((sum, asset) => sum + asset.tradeBreakdown.flatTrades, 0);
  const positiveAssets = usableAssets.filter((asset) => asset.walkForward.cumulativeReturn > 0).length;
  const negativeAssets = usableAssets.filter((asset) => asset.walkForward.cumulativeReturn < 0).length;
  const flatAssets = usableAssets.length - positiveAssets - negativeAssets;
  const averageCumulativeReturn = average(cumulativeReturns);
  const averageHitRateActive = average(hitRates);
  const averageSharpeLike365d = average(sharpeValues);
  const medianCumulativeReturn = median(cumulativeReturns);
  const lastValidatedAt = getLatestDate(usableAssets.map((asset) => asset.latestDate));
  const sourceUpdatedAt = latestIso([
    sourceStats.signals.mtime.toISOString(),
    sourceStats.results.mtime.toISOString()
  ]);
  const assetOutcomeCounts = [
    { label: 'Negative assets', value: negativeAssets, tone: 'negative' },
    { label: 'Flat assets', value: flatAssets, tone: 'neutral' },
    { label: 'Positive assets', value: positiveAssets, tone: 'positive' }
  ];
  const tradeOutcomeCounts = [
    { label: 'Losing trades', value: losingTrades, tone: 'negative' },
    { label: 'Flat trades', value: flatTrades, tone: 'neutral' },
    { label: 'Winning trades', value: winningTrades, tone: 'positive' }
  ];
  const coverage = {
    totalAssets: signalsById.size || new Set(resultRows.map((row) => row?.coin?.coin_id).filter(Boolean)).size,
    usableAssets: usableAssets.length,
    incompleteAssets: new Set(incompleteAssets.map((asset) => asset.coinId || asset.symbol || asset.name))
      .size,
    incompleteRows: incompleteAssets.length,
    resultRows: resultRows.length
  };
  const aggregate = {
    averageCumulativeReturn,
    medianCumulativeReturn,
    averageHitRateActive,
    averageSharpeLike365d,
    positiveAssets,
    negativeAssets,
    flatAssets,
    totalTrades,
    winningTrades,
    losingTrades,
    flatTrades
  };
  const caveat =
    'Real walk-forward research export from local CoinGecko daily data. Read-only output is published as-is; fees, slippage, and venue replay remain uncalibrated, so this is not execution-grade historical performance.';
  const warnings = incompleteAssets.length
    ? [
        `${coverage.incompleteRows} export row${coverage.incompleteRows === 1 ? '' : 's'} across ${
          coverage.incompleteAssets
        } tracked asset${coverage.incompleteAssets === 1 ? '' : 's'} ${
          coverage.incompleteRows === 1 ? 'is' : 'are'
        } incomplete and excluded from aggregate walk-forward stats.`
      ]
    : [];

  const preview = {
    id: ENGINE_ID,
    key: ENGINE_ID,
    name: ENGINE_NAME,
    status: 'research-ready',
    lastValidatedAt,
    sourceUpdatedAt,
    coverage,
    aggregate,
    charts: {
      assetOutcomeCounts,
      tradeOutcomeCounts
    },
    caveat,
    warnings
  };

  const member = {
    ...preview,
    notice:
      'Member detail exposes per-asset walk-forward summaries from the validated Markov Regime export. Execution, wallet authority, and live trading remain disabled.',
    highlights: {
      best: usableAssets.slice(0, 5).map(toHighlight),
      worst: usableAssets.slice(-5).reverse().map(toHighlight)
    },
    assets: usableAssets
  };

  const backtestingPreset = {
    key: ENGINE_ID,
    name: ENGINE_NAME,
    chain: 'Crypto research lane',
    asset: 'Top cap + volume union',
    risk: 'Balanced',
    modes: ['paper'],
    summary:
      'Real daily crypto regime research output built from 20-day return states, transition-matrix probabilities, and no-lookahead walk-forward validation.',
    curveLabel: 'Per-asset walk-forward cumulative return (sorted)',
    curve: [...cumulativeReturns].sort((left, right) => left - right),
    stats: [
      {
        label: 'Assets covered',
        value: `${coverage.usableAssets} usable / ${coverage.totalAssets} total`
      },
      {
        label: 'Avg cumulative return',
        value: formatPercent(averageCumulativeReturn)
      },
      {
        label: 'Avg hit rate',
        value: formatPercent(averageHitRateActive)
      },
      {
        label: 'Avg sharpe-like',
        value: formatDecimal(averageSharpeLike365d, 2)
      }
    ],
    scenarios: [
      {
        key: 'asset-outcomes',
        name: 'Asset outcome mix',
        posture: 'observed',
        takeaway:
          'Published walk-forward output keeps the losing cohort visible instead of showing only the winners.',
        metrics: [
          { label: 'Positive assets', value: String(positiveAssets) },
          { label: 'Flat assets', value: String(flatAssets) },
          { label: 'Negative assets', value: String(negativeAssets) }
        ]
      },
      {
        key: 'trade-outcomes',
        name: 'Trade outcome mix',
        posture: 'observed',
        takeaway:
          'Winning, flat, and losing trades are all included in the exported walk-forward breakdown.',
        metrics: [
          { label: 'Winning trades', value: String(winningTrades) },
          { label: 'Flat trades', value: String(flatTrades) },
          { label: 'Losing trades', value: String(losingTrades) }
        ]
      },
      {
        key: 'research-limits',
        name: 'Research limits',
        posture: 'caveat',
        takeaway:
          'The engine is real and read-only, but execution costs and venue replay are still pending.',
        metrics: [
          { label: 'Median cumulative', value: formatPercent(medianCumulativeReturn) },
          { label: 'Last validated', value: lastValidatedAt || 'Unavailable' },
          { label: 'Incomplete rows', value: String(coverage.incompleteAssets) }
        ]
      }
    ],
    timeframe: '1d',
    venue: 'CoinGecko daily research',
    dataMode: 'research-live',
    caveat,
    coverage,
    aggregate
  };

  return {
    preview,
    member,
    backtestingPreset
  };
}

function normalizeAsset(result, signalRow) {
  const coin = result?.coin || {};
  const latestSignal = result?.latest_signal || {};
  const walkForwardSummary = result?.walk_forward?.summary || null;
  const trades = Array.isArray(result?.walk_forward?.trades) ? result.walk_forward.trades : [];
  const tradeBreakdown = summarizeTrades(trades);
  const hasWalkForward = walkForwardSummary && isFiniteNumber(walkForwardSummary.cumulative_return);

  return {
    coinId: textOrEmpty(coin.coin_id || signalRow?.coin_id),
    symbol: textOrEmpty(coin.symbol || signalRow?.symbol),
    name: textOrEmpty(coin.name || signalRow?.name),
    marketCapRank: toNumber(signalRow?.market_cap_rank),
    totalVolume: toNumber(signalRow?.total_volume),
    latestDate: textOrEmpty(signalRow?.latest_date || latestSignal.date),
    latestClose: toNumber(signalRow?.latest_close),
    ret20: toNumber(signalRow?.ret20),
    signal: {
      state: textOrEmpty(signalRow?.state || latestSignal.state),
      pBearNext: toNumber(signalRow?.p_bear_next ?? latestSignal.p_bear),
      pSidewaysNext: toNumber(signalRow?.p_sideways_next ?? latestSignal.p_sideways),
      pBullNext: toNumber(signalRow?.p_bull_next ?? latestSignal.p_bull),
      edgeBullMinusBear: toNumber(signalRow?.edge_bull_minus_bear ?? latestSignal.edge),
      paperPosition: toNumber(signalRow?.paper_position ?? latestSignal.position)
    },
    walkForward: hasWalkForward
      ? {
          days: toNumber(walkForwardSummary.days),
          activeDays: toNumber(
            signalRow?.walk_forward_active_days ?? walkForwardSummary.active_days
          ),
          cumulativeReturn: toNumber(
            signalRow?.walk_forward_cumulative_return ?? walkForwardSummary.cumulative_return
          ),
          avgDailyReturn: toNumber(walkForwardSummary.avg_daily_return),
          dailyVol: toNumber(walkForwardSummary.daily_vol),
          sharpeLike365d: toNumber(walkForwardSummary.sharpe_like_365d),
          hitRateActive: toNumber(
            signalRow?.walk_forward_hit_rate_active ?? walkForwardSummary.hit_rate_active
          )
        }
      : null,
    tradeBreakdown,
    warning: textOrEmpty(result?.error)
  };
}

function summarizeTrades(trades) {
  let totalTrades = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let flatTrades = 0;

  for (const trade of trades) {
    const strategyReturn = toNumber(trade?.strategy_return);
    if (!isFiniteNumber(strategyReturn)) {
      continue;
    }

    totalTrades += 1;
    if (strategyReturn > 0) {
      winningTrades += 1;
    } else if (strategyReturn < 0) {
      losingTrades += 1;
    } else {
      flatTrades += 1;
    }
  }

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    flatTrades
  };
}

function toHighlight(asset) {
  return {
    coinId: asset.coinId,
    symbol: asset.symbol,
    name: asset.name,
    latestDate: asset.latestDate,
    state: asset.signal.state,
    paperPosition: asset.signal.paperPosition,
    cumulativeReturn: asset.walkForward.cumulativeReturn,
    hitRateActive: asset.walkForward.hitRateActive,
    sharpeLike365d: asset.walkForward.sharpeLike365d,
    totalTrades: asset.tradeBreakdown.totalTrades
  };
}

function parseCsv(text) {
  const rows = [];
  let value = '';
  let row = [];
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ',') {
      row.push(value);
      value = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && next === '\n') {
        index += 1;
      }
      row.push(value);
      value = '';
      rows.push(row);
      row = [];
      continue;
    }

    value += character;
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  if (!rows.length) {
    return [];
  }

  const [header, ...body] = rows;
  return body
    .filter((columns) => columns.some((column) => String(column || '').trim() !== ''))
    .map((columns) =>
      Object.fromEntries(header.map((key, index) => [key, columns[index] ?? '']))
    );
}

function textOrEmpty(value) {
  return value ? String(value).trim() : '';
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function getLatestDate(values) {
  const validDates = values
    .map((value) => {
      if (!value) {
        return null;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter(Boolean);

  if (!validDates.length) {
    return null;
  }

  const latest = validDates.sort((left, right) => right.getTime() - left.getTime())[0];
  return latest.toISOString().slice(0, 10);
}

function latestIso(values) {
  const valid = values
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  return valid[0] ? valid[0].toISOString() : null;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function formatPercent(value) {
  if (!isFiniteNumber(value)) {
    return 'Unavailable';
  }

  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatDecimal(value, decimals = 2) {
  if (!isFiniteNumber(value)) {
    return 'Unavailable';
  }

  return Number(value).toFixed(decimals);
}
