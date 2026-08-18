const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseCsv, analyze } = require("../index.js");

test("healthy fixture passes reasonable gates", () => {
  const trades = parseCsv(path.join(__dirname, "fixtures", "healthy.csv"));
  const result = analyze(trades, { initialCapital: 10000, maxDrawdownPct: 20, minProfitFactor: 1.2, minTrades: 10, extraCost: 2, requireStressProfit: true });
  assert.equal(result.passed, true);
  assert.ok(result.profitFactor > 1.2);
});

test("fragile fixture fails drawdown and profit factor gates", () => {
  const trades = parseCsv(path.join(__dirname, "fixtures", "fragile.csv"));
  const result = analyze(trades, { initialCapital: 10000, maxDrawdownPct: 10, minProfitFactor: 1.2, minTrades: 10, extraCost: 5, requireStressProfit: true });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.length >= 2);
});
