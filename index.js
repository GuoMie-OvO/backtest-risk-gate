const fs = require("node:fs");
const path = require("node:path");

const aliases = {
  date: ["date", "time", "datetime", "exit_date", "close_time", "日期", "时间", "平仓时间"],
  pnl: ["pnl", "profit", "net_profit", "profit_loss", "pl", "盈亏", "净收益", "收益"],
  fee: ["fee", "fees", "commission", "cost", "手续费", "佣金", "成本"],
};

function input(name, fallback) {
  const value = process.env[`INPUT_${name.replaceAll("-", "_").toUpperCase()}`];
  return value == null || value === "" ? fallback : value;
}

function parseLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { cells.push(current.trim()); current = ""; }
    else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function findColumn(headers, group, required = false) {
  const index = headers.findIndex((header) => aliases[group].includes(header.toLowerCase()));
  if (required && index < 0) throw new Error(`Missing ${group} column. Accepted names: ${aliases[group].join(", ")}`);
  return index;
}

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV must contain a header and at least one trade.");
  const headers = parseLine(lines[0]).map((value) => value.trim());
  const pnlIndex = findColumn(headers, "pnl", true);
  const dateIndex = findColumn(headers, "date", false);
  const feeIndex = findColumn(headers, "fee", false);
  const trades = lines.slice(1).map((line, rowIndex) => {
    const cells = parseLine(line);
    const pnl = Number(String(cells[pnlIndex] || "").replaceAll(",", ""));
    const fee = feeIndex >= 0 ? Number(String(cells[feeIndex] || "0").replaceAll(",", "")) : 0;
    if (!Number.isFinite(pnl) || !Number.isFinite(fee)) throw new Error(`Invalid number on CSV row ${rowIndex + 2}.`);
    return { date: dateIndex >= 0 ? cells[dateIndex] : String(rowIndex + 1), pnl: pnl - fee };
  });
  return trades;
}

function analyze(trades, config) {
  let equity = config.initialCapital;
  let peak = equity;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let lossStreak = 0;
  let longestLossStreak = 0;
  for (const trade of trades) {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    if (trade.pnl > 0) { grossProfit += trade.pnl; wins += 1; lossStreak = 0; }
    else if (trade.pnl < 0) { grossLoss += Math.abs(trade.pnl); lossStreak += 1; longestLossStreak = Math.max(longestLossStreak, lossStreak); }
  }
  const net = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const maxDrawdownPct = maxDrawdown / config.initialCapital * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const stressNet = net - trades.length * config.extraCost;
  const reasons = [];
  if (trades.length < config.minTrades) reasons.push(`Only ${trades.length} trades; gate requires ${config.minTrades}.`);
  if (maxDrawdownPct > config.maxDrawdownPct) reasons.push(`Max drawdown ${maxDrawdownPct.toFixed(2)}% exceeds ${config.maxDrawdownPct.toFixed(2)}%.`);
  if (profitFactor < config.minProfitFactor) reasons.push(`Profit factor ${profitFactor.toFixed(2)} is below ${config.minProfitFactor.toFixed(2)}.`);
  if (config.requireStressProfit && stressNet <= 0) reasons.push(`Cost-stressed net profit is ${stressNet.toFixed(2)}.`);
  let score = 100;
  score -= Math.min(35, maxDrawdownPct * 1.2);
  if (profitFactor < 1) score -= 30; else if (profitFactor < 1.5) score -= 15;
  if (trades.length < 30) score -= 15;
  if (stressNet <= 0) score -= 20;
  return { passed: reasons.length === 0, score: Math.max(0, Math.round(score)), trades: trades.length, net, winRate: wins / trades.length * 100, profitFactor, maxDrawdown, maxDrawdownPct, longestLossStreak, stressNet, reasons };
}

function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function markdown(result, config, csvPath) {
  const verdict = result.passed ? "PASS" : "FAIL";
  const rows = [
    ["Trades", result.trades], ["Net P&L", result.net.toFixed(2)], ["Win rate", `${result.winRate.toFixed(2)}%`],
    ["Profit factor", result.profitFactor.toFixed(2)], ["Max drawdown", `${result.maxDrawdown.toFixed(2)} (${result.maxDrawdownPct.toFixed(2)}%)`],
    ["Longest loss streak", result.longestLossStreak], ["Cost-stressed net", result.stressNet.toFixed(2)], ["Risk score", `${result.score}/100`],
  ].map(([key, value]) => `| ${key} | ${value} |`).join("\n");
  const failures = result.reasons.length ? result.reasons.map((reason) => `- ${reason}`).join("\n") : "- All configured gates passed.";
  return `# Backtest Risk Gate: ${verdict}\n\nSource: \`${csvPath}\`\n\n| Metric | Value |\n|---|---:|\n${rows}\n\n## Gate result\n${failures}\n\n## Configuration\n- Max drawdown: ${config.maxDrawdownPct}%\n- Min profit factor: ${config.minProfitFactor}\n- Min trades: ${config.minTrades}\n- Extra cost/trade: ${config.extraCost}\n\n> Historical backtests do not guarantee future returns.`;
}

function main() {
  const csvPath = path.resolve(input("csv-path", ""));
  const config = {
    initialCapital: Number(input("initial-capital", "100000")), maxDrawdownPct: Number(input("max-drawdown-pct", "20")),
    minProfitFactor: Number(input("min-profit-factor", "1.2")), minTrades: Number(input("min-trades", "30")),
    extraCost: Number(input("extra-cost-per-trade", "0")), requireStressProfit: input("require-stress-profit", "true").toLowerCase() === "true",
  };
  for (const [key, value] of Object.entries(config)) if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Invalid numeric input: ${key}.`);
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);
  const result = analyze(parseCsv(csvPath), config);
  const report = { generatedAt: new Date().toISOString(), source: csvPath, config, ...result };
  fs.writeFileSync("risk-report.json", `${JSON.stringify(report, null, 2)}\n`);
  const summary = markdown(result, config, csvPath);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  console.log(summary);
  writeOutput("passed", String(result.passed)); writeOutput("score", result.score); writeOutput("max-drawdown-pct", result.maxDrawdownPct.toFixed(4)); writeOutput("profit-factor", result.profitFactor.toFixed(4));
  if (!result.passed) { console.error(`Backtest risk gates failed:\n${result.reasons.join("\n")}`); process.exitCode = 1; }
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`Backtest Risk Gate error: ${error.message}`); process.exitCode = 1; }
}

module.exports = { parseLine, parseCsv, analyze };
