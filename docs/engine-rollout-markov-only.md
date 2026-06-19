# Cerberus Engine: V1 Rollout Contract

## Purpose

`engine-backtesting-foundation.md` defined the contract shape: identity, market scope, signal model, risk model, data requirements, operational state, all sourced from `src/engineCatalog.js`. That document was written when the catalog was schema with no live stats behind it. `engine-rollout-three-real-engines.md` (commit `8b643af`) then proposed launching three real engines at once. That plan is now superseded by this document.

**Current decision: V1 launches with exactly one real, validated engine — Cerberus (crypto).** Cross-Asset Trend (equities) and Mean Reversion (equities) are not cancelled, just deferred — see "Deferred, not dead" below. Shipping one real engine end-to-end, correctly, beats shipping three with a thinner build budget spread across each.

All current `engineCatalog.js` placeholders (`Core Trend`, `Core Mean-Revert`, `Trend Reader`, `Momentum Radar`, `Launch Screen`) stay in the catalog but remain in an explicit "in research" state with no live stats, exactly as before — this part of the original plan is unchanged.

## The one engine shipping in V1

### Cerberus (crypto)

Port of the existing, already-validated logic in `C:\Users\DUNAMIS\llm_youtube_engine_research\markov_regime_engine.py`.

- Data source: CoinGecko daily price history, local cache with 429 backoff.
- Universe: top market-cap and top-volume crypto union, up to 146 assets at last verified run (`--limit-each 100` for the full universe; smaller slices are configurable via the same flag).
- Method: 20-day rolling return labels (bull / bear / sideways), 3x3 transition matrix with light smoothing, `edge = P(next bull) - P(next bear)` mapped to a paper position.
- Validation: no-lookahead walk-forward, matrix rebuilt only from prior labels at each step.
- This is a port, not a re-derivation. The existing `engine_output/latest_signals.csv` currently yields 145 tracked assets. `engine_output/engine_results.json` holds 146 objects because one malformed duplicate row exists for Citrea, and 7 tracked assets do not have enough labeled history for a usable walk-forward summary. The current reusable walk-forward coverage is therefore 138 usable assets, with the incomplete rows called out explicitly instead of hidden. Those files are still the real output and should be carried over and re-emitted in the shared output schema below, not recomputed from a blank slate. If numbers drift from a fresh run, investigate the drift before treating either run as ground truth.

## Deferred, not dead

**Cross-Asset Trend (equities)** and **Mean Reversion (equities)** are out of scope for this launch, not cancelled. They stay documented here in skeleton form so the next phase doesn't start from zero:

- Cross-Asset Trend: same Markov regime/transition-matrix core as the crypto engine, with only the data adapter swapped — Massive Market Data MCP instead of CoinGecko, scoped to SPY/QQQ to start. Its purpose was always to prove the regime core is asset-agnostic; that proof is deferred along with the engine itself.
- Mean Reversion: new engine, RSI/Bollinger-band style, no existing local prototype, would reuse the same equity adapter and same walk-forward harness as Cross-Asset Trend rather than building a second adapter.

Revisit both once Cerberus is live, generating real walk-forward numbers in production, and the shared harness/adapter pattern below has actually been exercised by one real engine instead of just specified on paper.

## Shared contract (scoped to one engine for now, written so it still holds when #2 and #3 are picked back up)

### Input

A normalized OHLCV time series regardless of source:

```
{ date, asset, open, high, low, close, volume }
```

The CoinGecko data adapter is responsible for producing this shape; nothing source-specific should leak past the adapter boundary into the signal logic. This matters now even with only one engine, because keeping that boundary clean is what makes the deferred equity engines a real adapter-swap later rather than a rewrite.

### Signal interface

```
generateSignal(window) -> { direction, confidence, label }
```

- `direction`: long / short / flat, derived from `paper_position` (positive → long-leaning, negative → short-leaning, near-zero → flat)
- `confidence`: numeric, comparable across future engines even though derived differently per engine — for Cerberus this is `edge_bull_minus_bear` (or `|edge|` if a non-negative confidence scale is preferred — pick one and document it, don't leave it ambiguous)
- `label`: the regime name driving the call — `bull`, `bear`, or `sideways`, taken directly from `state` / `latest_signal.state`

### Backtest harness

One shared walk-forward runner. Even with a single engine today, build this as a reusable module (not inline in one engine's code), because the deferred equity engines are the reason it needs to be reusable at all. It must produce:

- cumulative return
- hit rate
- max drawdown
- Sharpe, where computable (explicitly `null`/missing when it isn't, never guessed) — note the existing output uses `sharpe_like_365d`, which should be relabeled or annotated clearly as an approximation, not presented as a textbook Sharpe ratio without caveat
- full per-asset breakdown, including losers — no cherry-picking winners out of the breakdown

This mirrors the existing rule from `engine-backtesting-foundation.md`: if a metric cannot be computed, it is explicitly missing rather than guessed.

### Output schema

The engine's real run produces a results JSON shaped like the existing `engine_results.json`, with per-asset detail, and a readiness status using the vocabulary already defined in `src/backtestDatasetRegistry.js`:

- `planned` — registry slot exists, no usable local data yet
- `partial` — some local data, not execution-grade
- `research-ready` — walk-forward research output exists and is reusable
- `replay-ready` — execution-grade venue replay is supported

Cerberus should launch at `research-ready` — the existing CSV/JSON output already qualifies. It does not need `replay-ready` for V1; that status is about execution-grade venue replay (fees, slippage, venue-normalized intraday data), a later milestone, not a launch blocker.

### UI presentation

One detail-page template, written generically even though only one engine uses it today:

- name
- one-line behavior/risk description
- supported asset classes
- full backtest chart, wins and losses both shown, not just the upside
- methodology disclosure section (what the signal is, what data it runs on, what it does not claim)
- "last validated" date stamp (use `latest_date` from the signal output, not the page's render time)

### Tier gating

Note: today's beta member model only has one tier in practice (`access_tier` defaults to `'beta-starter'` in `src/db.js`; nothing in the codebase currently branches on a basic/professional split). This section describes the intended mechanism for when that distinction is built, not something already wired up to hook into:

- basic tier: engine as-is, default parameters, no tuning surface
- professional tier: parameter tuning, but only within pre-tested ranges — no free-form parameter entry that could push the engine outside its validated walk-forward range

If/when a second engine arrives and needs a different tuning knob, that's fine — the *mechanism* (range-gated sliders, not raw inputs; tested ranges baked into the engine definition, not entered live) should still be the one shared mechanism, not a one-off settings UI per engine.

## Rollout note

This is the V1 launch lineup: one real engine. It replaces the current empty `Core Trend`, `Core Mean-Revert`, `Trend Reader`, `Momentum Radar`, and `Launch Screen` placeholder *live-stats claims* for the initial launch — those entries stay in `src/engineCatalog.js` in an `in research` state with no live stats shown, exactly as the prior plan specified, until each clears the same bar Cerberus clears here: real data adapter, shared signal interface, shared walk-forward harness, full win/loss breakdown, and a "last validated" date that means something.

## Immediate build sequence

1. Add a `crypto-markov-regime` entry to `src/engineCatalog.js` (no such entry exists yet — the catalog today is all placeholders) with real `memberFacingState`.
2. Add a matching dataset entry to `src/backtestDatasetRegistry.js` (`status: 'research-ready'`, scope = the CoinGecko crypto universe) and wire it into `getDatasetsForEngine()`.
3. Build the data path that reads `engine_output/latest_signals.csv` and `engine_output/engine_results.json` and serves them through the API in the shared output schema above — this is the one concrete plumbing task separating "spec" from "live."
4. Replace the synthetic `LAB_PRESETS['crypto-markov-regime']` entry in `src/backtesting.js` (or let it correctly fall through `createFallbackPreset` only until step 3 lands — don't ship a fake preset alongside a real one) with real curve/stats/scenarios derived from the walk-forward output.
5. Update the member-facing detail page / backtesting view to render the real per-asset win/loss breakdown for this one engine.
6. Leave the basic/professional tier-gating mechanism documented but unbuilt unless a concrete need arrives — don't build gating infrastructure for a distinction that doesn't exist in the member model yet.
7. Once this is live and stable, revisit Cross-Asset Trend and Mean Reversion using the now-proven adapter boundary and harness.
