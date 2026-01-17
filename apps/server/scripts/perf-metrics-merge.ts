import { readFileSync, writeFileSync } from "node:fs";

type MetricsRow = Record<string, string>;
type RssRow = { ts: number; rssKb: number };

const args = process.argv.slice(2);
const readArg = (name: string) => {
  const idx = args.findIndex((arg) => arg === `--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

const metricsPath = readArg("metrics");
const rssPath = readArg("rss");
if (!metricsPath || !rssPath) {
  console.error(
    "Usage: bun apps/server/scripts/perf-metrics-merge.ts --metrics <perf.csv> --rss <rss.csv> [--output <csv>] [--windowSec 5]"
  );
  process.exit(1);
}
const outputPath = readArg("output") ?? `${metricsPath}.merged.csv`;
const windowSec = Number(readArg("windowSec") ?? "5");
const windowMs = Number.isFinite(windowSec) ? Math.max(1, windowSec) * 1000 : 5000;

const parseCsv = (content: string): MetricsRow[] => {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const parts = line.split(",");
    const row: MetricsRow = {};
    headers.forEach((header, idx) => {
      row[header] = parts[idx] ?? "";
    });
    return row;
  });
};

const parseRss = (content: string): RssRow[] => {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const byTs = new Map<number, number>();
  for (const line of lines.slice(1)) {
    const [tsRaw, _pid, rssRaw] = line.split(",");
    const ts = Number(tsRaw);
    const rssKb = Number(rssRaw);
    if (!Number.isFinite(ts) || !Number.isFinite(rssKb)) continue;
    const tsMs = ts * 1000;
    byTs.set(tsMs, (byTs.get(tsMs) ?? 0) + rssKb);
  }
  return Array.from(byTs.entries()).map(([ts, rssKb]) => ({ ts, rssKb }));
};

const metricsRows = parseCsv(readFileSync(metricsPath, "utf8"));
const rssRows = parseRss(readFileSync(rssPath, "utf8"));

if (metricsRows.length === 0) {
  console.error("No metrics rows found.");
  process.exit(1);
}
if (rssRows.length === 0) {
  console.error("No RSS rows found.");
  process.exit(1);
}

const rssByTs = rssRows.sort((a, b) => a.ts - b.ts);
const rssWindowAvg = (centerTs: number) => {
  let sum = 0;
  let count = 0;
  const lower = centerTs - windowMs;
  const upper = centerTs + windowMs;
  for (const row of rssByTs) {
    if (row.ts < lower) continue;
    if (row.ts > upper) break;
    sum += row.rssKb;
    count += 1;
  }
  return count ? sum / count : 0;
};

const headers = [...Object.keys(metricsRows[0]), "rss_kb_avg_window"];
const lines = [headers.join(",")];

for (const row of metricsRows) {
  const tsEpoch = Number(row.ts_epoch ?? 0);
  const rssAvg = tsEpoch > 0 ? rssWindowAvg(tsEpoch) : 0;
  const values = headers.map((header) => {
    if (header === "rss_kb_avg_window") return rssAvg.toFixed(2);
    return row[header] ?? "";
  });
  lines.push(values.join(","));
}

writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${metricsRows.length} rows to ${outputPath}`);
