# Backtest Risk Gate

Stop fragile trading strategies from reaching `main`. This dependency-free GitHub Action reads a trade CSV and fails CI when a change breaches your risk policy.

[Get the Pro audit pack](https://github.com/GuoMie-OvO/backtest-risk-gate/blob/main/BUY_PRO.md) for baseline regression, monthly stability, tail-loss, profit-concentration, and break-even cost analysis.

It checks:

- maximum drawdown percentage;
- minimum profit factor;
- minimum trade sample size;
- transaction-cost/slippage stress profitability;
- win rate and longest losing streak for the job summary.

## Usage

```yaml
name: Backtest risk policy
on: [pull_request]

jobs:
  risk-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: GuoMie-OvO/backtest-risk-gate@v1
        with:
          csv-path: backtests/trades.csv
          initial-capital: "100000"
          max-drawdown-pct: "15"
          min-profit-factor: "1.3"
          min-trades: "50"
          extra-cost-per-trade: "3"
```

The action writes a readable GitHub job summary, produces `risk-report.json`, exposes machine-readable outputs, and returns a non-zero exit code when a gate fails.

## CSV format

```csv
date,pnl,fee
2026-01-01,220,2
2026-01-02,-80,2
```

Accepted P&L aliases include `pnl`, `profit`, `net_profit`, `profit_loss`, `盈亏`, and `净收益`. Fee is optional.

## Why a CI gate?

A single attractive backtest is not a release criterion. Risk thresholds should be explicit, reproducible, reviewed with the code, and applied again whenever strategy logic changes.

## Pro audit pack

The free Action is intentionally focused and dependency-free. The separate Pro CLI adds deeper, deterministic analysis for teams and serious strategy developers:

- compare a new backtest with a saved baseline;
- detect drawdown and profit-factor regressions;
- measure monthly stability and profit concentration;
- calculate worst-5% tail loss and break-even extra cost per trade;
- generate versionable Markdown and JSON audit reports.

Launch price: **¥29 for one GitHub account**. [See features and delivery instructions](https://github.com/GuoMie-OvO/backtest-risk-gate/blob/main/BUY_PRO.md).

## Local test

```bash
npm test
```

## Disclaimer

This project evaluates historical trade records. It does not execute orders, predict returns, or provide investment advice.

## License

MIT
