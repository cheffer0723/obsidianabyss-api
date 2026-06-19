# Obsidian Abyss Engine and Backtesting Foundation

## Purpose

This project already has the visual surface, the member preview, and a synthetic backtesting lab. The next step is to move the product definition into a stable backend contract so engines, research, and site messaging stop drifting apart.

This document defines that contract.

## V1 engine lineup

The first release should not be Solana-only and it should not pretend to offer live autonomous execution.

Recommended V1 lineup:

1. `Majors Trend`
   - BTC and ETH
   - Deterministic trend following
   - Paper mode first

2. `Majors Mean-Revert`
   - BTC and ETH
   - Deterministic range and volatility reversion
   - Paper mode first

3. `EVM Trend Reader`
   - ETH and larger Base or EVM names
   - Regime plus momentum bias
   - Paper mode first

4. `Solana Launch Screen`
   - Solana launches only
   - Screening and alerting first
   - Not a live execution engine in V1

This gives the site three real tradeable engine families plus one higher-risk screening product that can mature later.

## Engine contract

Every engine should be represented by one versioned definition with:

- identity: `id`, `name`, `version`, `status`
- market scope: instruments, venues, timeframes
- signal model: the deterministic rules and optional enrichments
- risk model: sizing, stops, concurrency, regime gates
- data requirements: candles, trades, quotes, order book, launch metadata
- operational state: disabled, research, paper, alerts, live

The canonical source for this starts in `src/engineCatalog.js`.

## Recommended backend shape

The engine stack should be split into six layers:

1. `Data adapters`
   - Normalize candles, trades, quotes, order book, and launch metadata into one internal format.

2. `Signal engines`
   - Deterministic logic only.
   - No reasoning model in the execution path.

3. `Risk policy`
   - Position sizing, stop placement, exposure caps, regime gating, session filters.

4. `Execution simulator`
   - Paper fills, fees, slippage, and wallet balance effects.

5. `Research and backtesting`
   - Historical replay across fixed datasets with versioned assumptions.

6. `Member presentation`
   - Site catalog, member dashboard, advisor copy, and backtesting page all read from the same engine definitions.

## Backtesting recommendation

For V1, backtesting should be internal and dataset-driven.

Do not make a third-party backtesting platform the core of the product. That creates dependency risk and makes it harder to keep assumptions consistent with your execution layer.

Instead:

1. Use local datasets as the first source of truth.
2. Treat external providers as ingestion sources, not the actual backtesting brain.
3. Replay the same deterministic engine rules that the paper environment will run.

That keeps research, paper trading, and future live trading on one path.

## Minimum data model

Backtesting should be able to replay against these dataset types:

- `candles`
- `trades`
- `quotes`
- `orderbook_snapshots`
- `launch_metadata`
- `signal_logs`
- `benchmarks`

Each dataset should be tagged by:

- source
- symbol or market
- venue
- timeframe
- time range
- schema version

## Minimum backtest output

Every completed run should capture:

- engine id and engine version
- dataset bundle id
- assumptions version
- trade log
- equity curve
- drawdown
- hit rate
- profit factor
- gross and net return
- fee and slippage impact
- notes about unsupported conditions

If any metric cannot be computed, it should be explicitly missing rather than guessed.

## How existing local examples fit

Two existing local patterns already point in the right direction:

1. The Nexus-style engine flow:
   - feature layer
   - deterministic signal packet
   - risk policy
   - paper execution
   - audit logging

2. The Cerberus research flow:
   - universe selection
   - regime labeling
   - walk-forward simulation
   - signal export

The production system should borrow structure from both, but the site should expose only the cleaned, productized engine definitions.

## Current local data state

Current local evidence is uneven, and the product should reflect that honestly.

What exists now:

1. `C:\Users\DUNAMIS\llm_youtube_engine_research\.cache`
   - Large set of per-asset local price-series caches.
   - Good for regime research and walk-forward experimentation.

2. `C:\Users\DUNAMIS\llm_youtube_engine_research\engine_output`
   - `latest_signals.csv`
   - `engine_results.json`
   - `market_sessions.json`
   - `universe.json`
   - Good for research outputs and member-safe previews.

3. `C:\Users\DUNAMIS\nexus-grid-static\state.json`
   - Present, but not enough by itself to support execution-grade historical replay.

What is not currently present as a ready local bundle:

- exchange-normalized intraday candles with venue provenance
- versioned fee and slippage assumptions
- merged execution-grade paper logs for the Obsidian member stack
- reusable Solana launch-intel replay bundles

This means:

- `EVM Trend Reader` can move first on research-grade backtesting
- `Majors Trend` and `Majors Mean-Revert` still need better market-data bundles before claims get stronger
- Solana screening products remain defined, but not validated enough for historical claims

## Immediate build sequence

1. Replace hardcoded advisor and backtesting engine lists with imports from `src/engineCatalog.js`.
2. Add a dataset registry module so every backtest references a named local dataset bundle.
3. Add a backtest run contract that stores assumptions, outputs, and provenance.
4. Upgrade the member backtesting page from synthetic presets to real recorded runs once the first dataset bundle is wired.
5. Keep live execution off until paper results, fill assumptions, and wallet safety checks are stable.

## Decision

The right V1 move is:

- local data first
- deterministic engines first
- internal replay engine first
- external data providers later, as adapters
- live execution last
