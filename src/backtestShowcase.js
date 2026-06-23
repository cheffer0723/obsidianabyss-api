import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const CURATED_PATH = path.resolve(moduleDir, '../data/backtests/curated.json');
const ENGINES_PATH = path.resolve(moduleDir, '../data/backtests/engines.json');

let cache = null;
let enginesCache = null;

// Loads the precomputed curated backtest showcase (real Polygon daily data,
// 200-day trend filter vs buy & hold). Static, read-only research output —
// refreshed by re-running the precompute, not at request time.
export function getCuratedBacktests() {
  if (cache) {
    return cache;
  }

  try {
    const raw = fs.readFileSync(CURATED_PATH, 'utf8');
    cache = JSON.parse(raw);
  } catch (error) {
    cache = null;
    throw new Error(`Curated backtest data unavailable: ${error.message}`);
  }

  return cache;
}

export function isCuratedBacktestAvailable() {
  try {
    return fs.existsSync(CURATED_PATH);
  } catch {
    return false;
  }
}

// Loads the precomputed multi-engine backtest showcase (Orthrus/Hydra/Sisyphus
// x SPY/QQQ/NVDA/BTC, net of fees vs buy & hold). Static, read-only research.
export function getEngineBacktests() {
  if (enginesCache) {
    return enginesCache;
  }

  try {
    const raw = fs.readFileSync(ENGINES_PATH, 'utf8');
    enginesCache = JSON.parse(raw);
  } catch (error) {
    enginesCache = null;
    throw new Error(`Engine backtest data unavailable: ${error.message}`);
  }

  return enginesCache;
}
