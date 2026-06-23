# Backtest generator - `build_engines.py`

Regenerates `data/backtests/engines.json`, the file served by the public
`GET /backtests/engines` route and rendered by the homepage backtest panel.

## Run it
```
pip install yfinance numpy pandas      # one-time
python scripts/build_engines.py        # from the repo root
```
It downloads ~20 years of daily data from Yahoo Finance, runs every engine on every
market net of fees vs buy & hold, computes the metric block + Monte Carlo, prints
a summary table, and overwrites `data/backtests/engines.json`. Deterministic
(fixed Monte Carlo seed) - same inputs give the same file.

After regenerating, commit + push so it deploys:
```
git add -A
git commit -m "Regenerate backtests"
git push
```
(Railway redeploys automatically; the panel reads the new data with no code change.)

## Method (one fixed rule per engine, nothing fit to the data)
- Daily split/dividend-adjusted closes.
- Positions act on the next day's close (no lookahead).
- Fees charged only on days the position changes, per side
  (equities 0.03%, crypto 0.40% Kraken taker).
- Equity = cumulative product of net daily returns; max drawdown from running peak.
- Monte Carlo = block bootstrap of net daily returns (path/sequence luck).

## Extend it
- Add a market: add one row to `ASSETS` (ticker, display, label, class, kind, fee).
- Add an engine: write a `signal_*(close, kind)` returning a 0/1 position Series,
  add one row to `ENGINES`, then update its `verdict` text by hand after you see
  the numbers. Verdicts are editorial; the metrics are auto.

## Guardrails (keep the product honest)
- Never fit parameters to this data - one fixed rule per engine.
- Always show losses. If an engine loses on a market, leave it in.
- Keep `status` honest: `validated` / `mixed` / `niche`.
- Data is research/education, not advice. Don't add return promises.
