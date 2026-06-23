#!/usr/bin/env python3
"""
build_engines.py — reproducible backtest generator for Obsidian Abyss.

Regenerates  data/backtests/engines.json  (the data the public /backtests/engines
route and the homepage panel consume).

Run from the repo root:

    python scripts/build_engines.py

Requires: yfinance, numpy, pandas        (pip install yfinance numpy pandas)

Method (one fixed rule per engine, no parameters fit to the data):
  * daily split/dividend-adjusted closes (Yahoo Finance)
  * positions act on the NEXT day's close (no lookahead)
  * fees charged only on days the position changes (per side)
  * equity = cumulative product of net daily returns
  * Monte Carlo = block bootstrap of net daily returns (path/sequence luck)

=== HOW TO EXTEND (B) ===
  * Add a market:  add one row to ASSETS below.
  * Add an engine: write a signal_*() function (returns a 0/1 position Series),
                   then add one row to ENGINES. Update its verdict text by hand
                   after you see the numbers (verdicts are editorial, not auto).
"""
import json, os, pickle, datetime as dt
import numpy as np, pandas as pd, yfinance as yf

# --------------------------------------------------------------------------- #
# CONFIG  (edit here to extend)
# --------------------------------------------------------------------------- #
END        = "2026-06-23"
EQ_START   = "2005-01-01"      # equities history start
BTC_START  = "2014-09-01"      # crypto history start

# ticker, display, label, assetClass, kind ("eq"|"btc"), feeAssumption
ASSETS = [
    ("SPY",     "SPY",  "S&P 500",    "equity index", "eq",  "0.03%/side"),
    ("QQQ",     "QQQ",  "Nasdaq 100", "equity index", "eq",  "0.03%/side"),
    ("NVDA",    "NVDA", "NVIDIA",     "single stock", "eq",  "0.03%/side"),
    ("GLD",     "GLD",  "Gold",       "commodity",    "eq",  "0.03%/side"),
    ("IWM",     "IWM",  "Small caps", "equity index", "eq",  "0.03%/side"),
    ("TLT",     "TLT",  "Long Treasuries", "bonds",   "eq",  "0.03%/side"),
    ("BTC-USD", "BTC",  "Bitcoin",    "crypto",       "btc", "0.40%/side (Kraken)"),
]

FEE = {"eq": 0.0003, "btc": 0.004}     # per side
ANN = {"eq": 252,    "btc": 365}       # annualization factor
MOM = {"eq": 126,    "btc": 182}       # momentum lookback (~6 months)

MC_PATHS  = 2000
MC_BLOCK  = 10
CURVE_PTS = 120

# --------------------------------------------------------------------------- #
# SIGNALS  (each returns a 0/1 position Series; warmup = bars to skip)
# --------------------------------------------------------------------------- #
def signal_orthrus(close, kind):
    return (close > close.rolling(200).mean()).astype(float).fillna(0), 200

def signal_hydra(close, kind):
    return (close.pct_change(MOM[kind]) > 0).astype(float).fillna(0), MOM[kind]

def signal_sisyphus(close, kind):
    mid = close.rolling(20).mean(); sd = close.rolling(20).std()
    return (close < (mid - 2 * sd)).astype(float).fillna(0), 20

# key, name, type, glyph, status, tagline, rule, signal-fn, verdict
ENGINES = [
    ("orthrus", "Orthrus", "Trend-following", "orthrus", "validated",
     "Follows the dominant current.",
     "Hold while price is above its 200-day average; cash below. Acts next day's close.",
     signal_orthrus,
     "The steady hand, now tested across 2008, 2020 and 2022. It lags buy & hold on raw "
     "return in every market — the price of sitting out dips — but it roughly HALVED the "
     "worst drawdown on the stock and crypto markets. The exception is long Treasuries: there "
     "it mostly just missed the bond bull and barely cut drawdown (-47% vs -48%), its weakest "
     "result. A risk-reducer on stocks, not a free lunch on bonds."),
    ("hydra", "Hydra", "Momentum", "hydra", "mixed",
     "Strength begets strength.",
     "Hold while the trailing 6-month return is positive; cash otherwise. Acts next day's close.",
     signal_hydra,
     "Mixed, and we show it. Decent on large indices and gold, and the best of the three on long "
     "Treasuries — it cut bond drawdown to -30% vs -48% while keeping most of the return. But it "
     "lagged badly on small caps and trades more for it. Momentum whipsaws in choppy tape — "
     "regime-dependent, not a free lunch."),
    ("sisyphus", "Sisyphus", "Mean-reversion", "sisyphus", "niche",
     "The boulder always rolls back.",
     "Buy when price falls below its lower Bollinger band (oversold); flat otherwise. Acts next day's close.",
     signal_sisyphus,
     "The sniper. In the market only a sliver of the time, buying deep oversold dips, so its "
     "drawdowns are tiny — but over 20 years that under-participation costs it against anything "
     "that simply trends up: it captured almost none of the bond bull (+1% vs +88%) and posted "
     "outright LOSSES on gold and Bitcoin. Precision over participation, and not for one-way markets."),
]

# --------------------------------------------------------------------------- #
# ENGINE
# --------------------------------------------------------------------------- #
def load(ticker, kind):
    start = EQ_START if kind == "eq" else BTC_START
    df = yf.download(ticker, start=start, end=END, progress=False, auto_adjust=True)
    s = df["Close"]
    if isinstance(s, pd.DataFrame):
        s = s.iloc[:, 0]
    return s.dropna()

def block_mc(strat, seed=7):
    rng = np.random.default_rng(seed)
    n = len(strat); nb = int(np.ceil(n / MC_BLOCK))
    starts = rng.integers(0, n - MC_BLOCK + 1, size=(MC_PATHS, nb))
    idx = (starts[:, :, None] + np.arange(MC_BLOCK)[None, None, :]).reshape(MC_PATHS, -1)[:, :n]
    term = np.prod(1 + strat[idx], axis=1) - 1
    p5, p50, p95 = np.percentile(term, [5, 50, 95]) * 100
    return dict(p5Pct=round(float(p5), 1), p50Pct=round(float(p50), 1), p95Pct=round(float(p95), 1),
                profitOddsPct=round(float((term > 0).mean() * 100), 0), paths=MC_PATHS,
                method=f"block bootstrap ({MC_BLOCK}-day blocks, {MC_PATHS} paths), net of fees")

def mdd(eq):
    peak = np.maximum.accumulate(eq)
    return float((eq / peak - 1).min() * 100)

def backtest(close, pos, kind, warm):
    r = close.pct_change().fillna(0).values
    pos = pos.astype(float).values
    held = np.roll(pos, 1); held[0] = 0.0                      # act next day
    turn = np.abs(np.diff(np.concatenate([[0.0], held])))      # position change (side)
    strat_all = held * r - FEE[kind] * turn
    m = np.zeros(len(r), bool); m[warm:] = True
    strat = strat_all[m]; rr = r[m]; he = held[m]
    a = ANN[kind]; n = len(strat); yrs = n / a
    eq = np.cumprod(1 + strat); beq = np.cumprod(1 + rr)
    sd = strat.std(); mu = strat.mean()
    dn = strat[strat < 0]; dsd = dn.std() if len(dn) else 0.0
    md = mdd(eq); cagr = (eq[-1] ** (1 / yrs) - 1) * 100 if eq[-1] > 0 else -100.0
    gains = strat[strat > 0].sum(); losses = -strat[strat < 0].sum()
    entries = int(((he > 0) & (np.roll(he, 1) <= 0)).sum())
    M = dict(
        totalReturnPct=round(float((eq[-1] - 1) * 100), 1),
        cagrPct=round(float(cagr), 1),
        sharpe=round(float(mu / sd * np.sqrt(a)) if sd > 0 else 0.0, 2),
        sortino=round(float(mu / dsd * np.sqrt(a)) if dsd > 0 else 0.0, 2),
        volatilityPct=round(float(sd * np.sqrt(a) * 100), 1),
        maxDrawdownPct=round(md, 1),
        calmar=round(float(cagr / abs(md)) if md != 0 else 0.0, 2),
        profitFactor=round(float(gains / losses) if losses > 0 else 0.0, 2),
        trades=entries,
        pctInMarket=round(float((he > 0).mean() * 100), 1),
        monteCarlo=block_mc(strat),
    )
    bsd = rr.std(); bmu = rr.mean()
    B = dict(totalReturnPct=round(float((beq[-1] - 1) * 100), 1),
             sharpe=round(float(bmu / bsd * np.sqrt(a)) if bsd > 0 else 0.0, 2),
             maxDrawdownPct=round(mdd(beq), 1))
    return eq, beq, M, B, n

def downsample(dates, eq, beq, k=CURVE_PTS):
    n = len(eq)
    idx = list(range(n)) if n <= k else [int(round(i * (n - 1) / (k - 1))) for i in range(k)]
    return ([dates[i].strftime("%Y-%m-%d") for i in idx],
            [round(float(eq[i]), 4) for i in idx],
            [round(float(beq[i]), 4) for i in idx])

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(here, "..", "data", "backtests", "engines.json")
    data = {}
    for tk, disp, label, ac, kind, fee in ASSETS:
        data[tk] = load(tk, kind)
        s = data[tk]
        print(f"loaded {tk:8s} {len(s):5d} rows  {s.index.min().date()} -> {s.index.max().date()}")

    engines = []
    print(f"\n{'engine':9s} {'tkr':5s} {'strat%':>11s} {'B&H%':>11s} {'sDD%':>7s} {'bDD%':>7s} {'sharpe':>7s} {'trades':>7s}")
    for ek, en, etype, glyph, status, tag, rule, sigfn, verdict in ENGINES:
        assets = []
        for tk, disp, label, ac, kind, fee in ASSETS:
            close = data[tk]
            pos, warm = sigfn(close, kind)
            eq, beq, M, B, ndays = backtest(close, pos, kind, warm)
            dates = list(close.index[warm:])
            d2, s2, b2 = downsample(dates, eq, beq)
            assets.append(dict(ticker=disp, label=label, assetClass=ac, evalDays=ndays,
                               feeAssumption=fee,
                               metrics=dict(strategy=M, benchmark=B),
                               curve=dict(dates=d2, strategy=s2, benchmark=b2)))
            print(f"{en:9s} {disp:5s} {M['totalReturnPct']:11.1f} {B['totalReturnPct']:11.1f} "
                  f"{M['maxDrawdownPct']:7.1f} {B['maxDrawdownPct']:7.1f} {M['sharpe']:7.2f} {M['trades']:7d}")
        engines.append(dict(key=ek, name=en, type=etype, glyph=glyph, status=status,
                            tagline=tag, rule=rule, verdict=verdict, assets=assets))

    out = dict(
        generatedAt=dt.date.today().isoformat(),
        dataSource="Yahoo Finance daily bars (split/dividend-adjusted)",
        evalWindow="~20 years (equities since 2005, Bitcoin since 2014) — spans 2008, 2020 and 2022",
        benchmark="buy & hold",
        fees=dict(modeled=True,
                  equities="0.03% per side (commission-free; spread/slippage)",
                  crypto="0.40% per side (Kraken Pro base taker)",
                  applied="charged only on days the strategy trades"),
        metricsGlossary=dict(
            cagr="annualized return", sortino="return per unit of downside risk",
            calmar="CAGR / worst drawdown", volatility="annualized",
            profitFactor="gross gains / gross losses",
            pctInMarket="share of days holding a position",
            monteCarlo="resampled return distribution over the full ~20-yr history (block bootstrap): "
                       "90% of paths land between p5 and p95; profit-odds = share of paths ending "
                       "positive. Measures path/sequence luck across the sampled regimes."),
        caveats=[
            "Each engine is one fixed rule, walk-forward style — no parameters fit to this data.",
            "~20 years of daily history; spans the 2008 crash, the 2020 COVID shock, and the 2022 bear.",
            "Prices are split/dividend-adjusted (Yahoo Finance). Bitcoin history starts 2014.",
            "Fees modeled; equities commission-free, crypto at Kraken taker.",
            "Research and education only. Not advice, not a promise. Losses shown."],
        honestSummary="Three engines across seven markets over ~20 years, net of fees, losses shown. None "
                      "beat buy & hold on raw return — they are risk tools, not alpha machines. Across "
                      "2008, 2020 and 2022, the trend and momentum engines roughly halved the worst "
                      "drawdown on the stock and crypto markets — long Treasuries the notable exception, "
                      "where the trend overlay mostly just missed the rally. The mean-reversion engine "
                      "barely participates and loses on one-way markets like gold and Bitcoin.",
        engines=engines)

    out_path = os.path.normpath(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"\nwrote {out_path}  ({len(json.dumps(out))} bytes)")

if __name__ == "__main__":
    main()
