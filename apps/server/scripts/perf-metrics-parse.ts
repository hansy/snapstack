import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import vm from "node:vm";

type Metrics = {
  ts?: number;
  timestamp?: string;
  intervalMs?: number;
  room?: string;
  reason?: string;
  connections?: number;
  intentConnections?: number;
  overlays?: number;
  libraryViews?: number;
  yjs?: Record<string, number>;
  hidden?: Record<string, number> | null;
};

const args = process.argv.slice(2);
const readArg = (name: string) => {
  const idx = args.findIndex((arg) => arg === `--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

const inputPath = readArg("input");
if (!inputPath) {
  console.error("Usage: bun apps/server/scripts/perf-metrics-parse.ts --input <logfile> [--output <csv>]");
  process.exit(1);
}
const outputPath = readArg("output") ?? `${inputPath}.perf.csv`;

const content = readFileSync(inputPath, "utf8");
const lines = content.split(/\r?\n/);

type ParseState = {
  braceCount: number;
  inSingle: boolean;
  inDouble: boolean;
  escaped: boolean;
};

const updateState = (state: ParseState, text: string) => {
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (state.escaped) {
      state.escaped = false;
      continue;
    }
    if (char === "\\") {
      state.escaped = true;
      continue;
    }
    if (!state.inDouble && char === "'") {
      state.inSingle = !state.inSingle;
      continue;
    }
    if (!state.inSingle && char === "\"") {
      state.inDouble = !state.inDouble;
      continue;
    }
    if (state.inSingle || state.inDouble) continue;
    if (char === "{") state.braceCount += 1;
    if (char === "}") state.braceCount -= 1;
  }
};

const parseTimestamp = (line: string): string | null => {
  const match = line.match(/\d{4}-\d{2}-\d{2}[T ][0-9:.+-Z]+/);
  if (!match) return null;
  const ts = Date.parse(match[0]);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toISOString();
};

const records: Array<{ index: number; timestamp: string | null; metrics: Metrics }> = [];

let buffer = "";
let collecting = false;
let state: ParseState = { braceCount: 0, inSingle: false, inDouble: false, escaped: false };
let currentTimestamp: string | null = null;
let index = 0;

for (const line of lines) {
  if (!collecting) {
    const marker = line.indexOf("[perf] room metrics");
    if (marker === -1) continue;
    const braceStart = line.indexOf("{", marker);
    if (braceStart === -1) continue;
    collecting = true;
    buffer = line.slice(braceStart);
    state = { braceCount: 0, inSingle: false, inDouble: false, escaped: false };
    updateState(state, buffer);
    currentTimestamp = parseTimestamp(line);
  } else {
    buffer += `\n${line}`;
    updateState(state, line);
  }

  if (collecting && state.braceCount === 0) {
    collecting = false;
    index += 1;
    let metrics: Metrics | null = null;
    try {
      metrics = vm.runInNewContext(`(${buffer})`) as Metrics;
    } catch (err) {
      console.warn(`Failed to parse perf metrics record #${index}: ${(err as Error).message}`);
    }
    if (metrics) {
      const metricsTimestamp =
        typeof metrics.timestamp === "string" && metrics.timestamp
          ? metrics.timestamp
          : typeof metrics.ts === "number"
            ? new Date(metrics.ts).toISOString()
            : null;
      records.push({ index, timestamp: currentTimestamp ?? metricsTimestamp, metrics });
    }
    buffer = "";
    currentTimestamp = null;
  }
}

if (records.length === 0) {
  console.error(`No perf metrics records found in ${basename(inputPath)}`);
  process.exit(1);
}

const flatten = (metrics: Metrics) => {
  const yjs = metrics.yjs ?? {};
  const hidden = metrics.hidden ?? {};
  return {
    ts_epoch: typeof metrics.ts === "number" ? metrics.ts : 0,
    ts_iso: metrics.timestamp ?? "",
    interval_ms: typeof metrics.intervalMs === "number" ? metrics.intervalMs : 0,
    room: metrics.room ?? "",
    reason: metrics.reason ?? "",
    connections: metrics.connections ?? 0,
    intentConnections: metrics.intentConnections ?? 0,
    overlays: metrics.overlays ?? 0,
    libraryViews: metrics.libraryViews ?? 0,
    yjs_players: yjs.players ?? 0,
    yjs_zones: yjs.zones ?? 0,
    yjs_cards: yjs.cards ?? 0,
    yjs_zoneCardOrders: yjs.zoneCardOrders ?? 0,
    yjs_handRevealsToAll: yjs.handRevealsToAll ?? 0,
    yjs_libraryRevealsToAll: yjs.libraryRevealsToAll ?? 0,
    yjs_faceDownRevealsToAll: yjs.faceDownRevealsToAll ?? 0,
    yjs_playerOrder: yjs.playerOrder ?? 0,
    hidden_cards: hidden.cards ?? 0,
    hidden_handPlayers: hidden.handPlayers ?? 0,
    hidden_handCards: hidden.handCards ?? 0,
    hidden_libraryPlayers: hidden.libraryPlayers ?? 0,
    hidden_libraryCards: hidden.libraryCards ?? 0,
    hidden_sideboardPlayers: hidden.sideboardPlayers ?? 0,
    hidden_sideboardCards: hidden.sideboardCards ?? 0,
    hidden_faceDownBattlefield: hidden.faceDownBattlefield ?? 0,
    hidden_handReveals: hidden.handReveals ?? 0,
    hidden_libraryReveals: hidden.libraryReveals ?? 0,
    hidden_faceDownReveals: hidden.faceDownReveals ?? 0,
  };
};

const headers = [
  "index",
  "timestamp",
  "ts_epoch",
  "ts_iso",
  "interval_ms",
  "room",
  "reason",
  "connections",
  "intentConnections",
  "overlays",
  "libraryViews",
  "yjs_players",
  "yjs_zones",
  "yjs_cards",
  "yjs_zoneCardOrders",
  "yjs_handRevealsToAll",
  "yjs_libraryRevealsToAll",
  "yjs_faceDownRevealsToAll",
  "yjs_playerOrder",
  "hidden_cards",
  "hidden_handPlayers",
  "hidden_handCards",
  "hidden_libraryPlayers",
  "hidden_libraryCards",
  "hidden_sideboardPlayers",
  "hidden_sideboardCards",
  "hidden_faceDownBattlefield",
  "hidden_handReveals",
  "hidden_libraryReveals",
  "hidden_faceDownReveals",
];

const rows = [headers.join(",")];
for (const record of records) {
  const flat = flatten(record.metrics);
  const row = [
    record.index,
    record.timestamp ?? "",
    flat.ts_epoch,
    flat.ts_iso,
    flat.interval_ms,
    flat.room,
    flat.reason,
    flat.connections,
    flat.intentConnections,
    flat.overlays,
    flat.libraryViews,
    flat.yjs_players,
    flat.yjs_zones,
    flat.yjs_cards,
    flat.yjs_zoneCardOrders,
    flat.yjs_handRevealsToAll,
    flat.yjs_libraryRevealsToAll,
    flat.yjs_faceDownRevealsToAll,
    flat.yjs_playerOrder,
    flat.hidden_cards,
    flat.hidden_handPlayers,
    flat.hidden_handCards,
    flat.hidden_libraryPlayers,
    flat.hidden_libraryCards,
    flat.hidden_sideboardPlayers,
    flat.hidden_sideboardCards,
    flat.hidden_faceDownBattlefield,
    flat.hidden_handReveals,
    flat.hidden_libraryReveals,
    flat.hidden_faceDownReveals,
  ].join(",");
  rows.push(row);
}

writeFileSync(outputPath, `${rows.join("\n")}\n`, "utf8");
console.log(`Wrote ${records.length} records to ${outputPath}`);
