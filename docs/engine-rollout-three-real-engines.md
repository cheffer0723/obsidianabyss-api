# Three Real Engines: Rollout Contract

## Purpose

`engine-backtesting-foundation.md` defined the contract shape: identity, market scope, signal model, risk model, data requirements, operational state, all sourced from `src/engineCatalog.js`. That document was written when the catalog was schema with no live stats behind it.

This document is the next step: it defines what ships for the initial launch. Instead of five placeholder engines with no validated history, V1 ships three real, validated engines that share one contract closely enough that a member cannot tell from the UI which internals differ underneath. The other catalog entries (`Core Trend`, `Core Mean-Revert`, `Trend Reader`, `Momentum Radar`, `Launch Screen`) stay in `engineCatalog.js`, but move to an explicit "in research" state with no live stats until they clear the same bar these three clear here.

## The three engines

### 1. Markov Regime (crypto)

Port of the existing, already-validated logic in `C:\Users\DUNAMIS\llm_youtube_engine_research\markov_regime_engine.py`.

- Data source: CoinGecko daily price history, local cache with 429 backoff.
- Universe: top market-cap and top-volume crypto union, ~146 assets at last verified run (the report on file used a 27-asset slice; full universe run is `--limit-each 100`).
- Method: 20-day rolling return labels (bull / bear / sideways), 3x3 transition matrix with light smoothing, `edge = P(next bull) - P(next bear)` mapped to a paper position.
- Validation: no-lookahead walk-forward, matrix rebuilt only from prior labels at each step.
- This is a port, not a re-derivation. The existing `engine_output/latest_signals.csv` and `engine_output/engine_results.json` are the real output and should be carried over and re-emitted in the shared output schema below, not recomputed from a blank slate. If numbers drift from a fresh run, investigate the drift before treating either run as ground truth.

### 2. Cross-Asset Trend (equities)

Same Markov regime/trend methodology as #1. The only structural change is the data adapter: source swapped from CoinGecko to the Massive Market Data MCP, scoped to liquid equities (SPY and QQQ to start).

The point of this engine is not a new signal idea. It is proof that the regime/transition-matrix core is asset-agnostic: same labeling rule, same transition matrix, same walk-forward harness, same output shape, fed by a different `Data adapter` layer. If this engine needs anything beyond a new adapter to run, that is a signal the "core" in #1 was less general than it looked, and worth flagging back rather than quietly forking the logic.

### 3. Mean Reversion (equities)

New engine, built from scratch, no existing local prototype to port.

- Signal: RSI / Bollinger-band style mean-reversion (oversold/overbought band touch plus reversion trigger).
- Data source: same Massive Market Data equity pipeline as #2 — reuse the adapter, do not write a second one.
- Validation method: same walk-forward discipline as #1 and #2. The transition/threshold logic is only ever fit on data prior to the evaluation point; no parameter in the live signal path is allowed to see future bars. This is the same no-lookahead rule, just applied to a mean-reversion rule set instead of a regime-labeling rule set.

## Shared contract

All three engines must implement this identically. If an engine needs to deviate from any piece below, that is a contract bug to fix, not a one-off exception to grant.

### Input

A normalized OHLCV time series regardless of source:

```
{ date, asset, open, high, low, close, volume }
```

Each `Data adapter` (CoinGecko for #1, Massive Market Data for #2 and #3) is responsible for producing this shape and nothing else crosses the adapter boundary. Signal engines never see source-specific fields.

### Signal interface

```
generateSignal(window) -> { direction, confidence, label }
```

- `direction`: long / short / flat (or the engine's equivalent neutral state)
- `confidence`: numeric, comparable across engines even though it's derived differently per engine
- `label`: the regime or condition name driving the call (e.g. `bull`, `bear`, `sideways` for #1/#2; `oversold-reversion`, `overbought-reversion`, `neutral` for #3)

### Backtest harness

One shared walk-forward runner, reused across all three engines rather than three separate backtest scripts. It must produce:

- cumulative return
- hit rate
- max drawdown
- Sharpe, where computable (explicitly `null`/missing when it isn't, never guessed)
- full per-asset breakdown, including losers — no cherry-picking winners out of the breakdown

This mirrors the existing rule from `engine-backtesting-foundation.md`: if a metric cannot be computed, it is explicitly missing rather than guessed.

### Output schema

Each engine's real run produces a results JSON shaped like the existing `engine_results.json`, with per-asset detail, and a readiness status that uses the same vocabulary already defined in `src/backtestDatasetRegistry.js`:

- `planned` — registry slot exists, no usable local data yet
- `partial` — some local data, not execution-grade
- `research-ready` — walk-forward research output exists and is reusable
- `replay-ready` — execution-grade venue replay is supported

A V1 launch engine should be at `research-ready` at minimum before going live in the catalog with stats attached. None of the three need to claim `replay-ready` for V1 — that status is about execution-grade venue replay (fees, slippage, venue-normalized intraday data), which is a later milestone, not a launch blocker.

### UI presentation

Identical detail-page template for all three engines:

- name
- one-line behavior/risk description
- supported asset classes
- full backtest chart, wins and losses both shown, not just the upside
- methodology disclosure section (what the signal is, what data it runs on, what it does not claim)
- "last validated" date stamp

A member should not be able to tell from the page layout which engine is crypto-only, which is equity-only, or which methodology underlies the call. The contract, not the asset class, defines the page.

### Tier gating

Identical mechanism across all three engines:

- basic tier: engine as-is, default parameters, no tuning surface
- professional tier: parameter tuning, but only within pre-tested ranges — no free-form parameter entry that could push an engine outside its validated walk-forward range

If one engine's professional tier needs a tuning knob the other two don't have, that is fine, but the *mechanism* (range-gated sliders, not raw inputs; tested ranges baked into the engine definition, not entered live) is one mechanism shared by all three, not three different settings UIs.

## Rollout note

This is the V1 launch lineup. It replaces the current empty `Core Trend`, `Core Mean-Revert`, `Trend Reader`, `Momentum Radar`, and `Launch Screen` placeholders for the initial launch — those entries stay in `src/engineCatalog.js`, but move (or remain) in an `in research` state with no live stats shown until they clear the same validation bar as these three: real data adapter, shared signal interface, shared walk-forward harness, full win/loss breakdown, and a "last validated" date that means something.

## Immediate build sequence

1. Build the shared `Data adapter` interface (CoinGecko already exists in the ported engine; add the Massive Market Data adapter for equities).
2. Build the shared walk-forward backtest harness as one reusable module, not three copies.
3. Port engine #1 (Markov Regime) onto the harness first, since it has existing validated output to check the port against.
4. Build engine #2 (Cross-Asset Trend) as the new adapter plus the same core — this is the test that the core is actually adapter-agnostic.
5. Build engine #3 (Mean Reversion) as new signal logic on the now-proven adapter and harness.
6. Wire all three into `engineCatalog.js` with real `memberFacingState`, replacing placeholder entries' live-stat claims, and move the remaining placeholders to `in research`.
7. Update the member backtesting page to read real per-asset win/loss breakdowns from these three engines instead of synthetic presets.
