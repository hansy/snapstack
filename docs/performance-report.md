# Performance Notes and Benchmarks

Last updated: 2026-01-17

This document captures the performance work, benchmarks, and measurement tooling added during the recent performance pass. Results were gathered locally (wrangler dev / local Durable Objects) and should be treated as directional until re-run in your target environment.

## Tooling and scripts

Benchmarks and load tools:
- `apps/server/scripts/overlay-bench.ts` (overlay generation)
- `apps/server/scripts/hidden-chunk-bench.ts` (hidden-state chunking)
- `apps/server/scripts/library-reveals-bench.ts` (library reveal sync)
- `apps/server/scripts/duplicate-bench.ts` (duplicate token positioning)
- `apps/server/scripts/intent-bench.ts` (intent hot path micro-bench)
- `apps/server/scripts/ws-load.ts` (websocket load generator)
- `apps/server/scripts/perf-metrics-parse.ts` (parse `[perf] room metrics` logs into CSV)
- `apps/server/scripts/perf-metrics-merge.ts` (merge perf metrics CSV with RSS samples)

Runtime instrumentation (opt-in):
- `[perf] room metrics` logs (enabled via `perfMetrics=1` URL param or `PERF_METRICS=1` env flag). These log counts for Yjs maps, hidden state sizes, and connection counts to correlate with memory usage.

Heap capture utilities (stored under `.context` for now):
- `.context/heap-snapshot.mjs` (take a heap snapshot via Wrangler inspector)
- `.context/heap-analyze.mjs` (CLI diff of heap snapshots)

## Results and commands

Below is the full baseline + after report captured during the work.

# Performance Baseline & After

Date: 2026-01-16

## Scenario
Overlay generation benchmark using `apps/server/scripts/overlay-bench.ts`.

Config: players=4, hand=80, library=120, battlefield=40, iterations=200

## Baseline (before changes)
Command:
- bun apps/server/scripts/overlay-bench.ts

Results:
- overlays: 1000
- total time: 64.5 ms
- avg time: 0.0645 ms/overlay
- heap delta: 3.4 MB

## After (snapshot reuse)
Command:
- bun apps/server/scripts/overlay-bench.ts --snapshot

Results:
- overlays: 1000
- total time: 47.9 ms
- avg time: 0.0479 ms/overlay
- heap delta: 2.9 MB

## Hidden-state chunking baseline
Command:
- bun apps/server/scripts/hidden-chunk-bench.ts

Results (before change):
- cards: 4000, iterations: 30
- total time: 5779.1 ms
- avg time: 192.638 ms/iteration
- heap delta: 40.0 MB

## Hidden-state chunking after
Command:
- bun apps/server/scripts/hidden-chunk-bench.ts

Results (after change):
- cards: 4000, iterations: 30
- total time: 51.3 ms
- avg time: 1.711 ms/iteration
- heap delta: 3.8 MB

## Library reveals sync baseline
Command:
- bun apps/server/scripts/library-reveals-bench.ts

Results (before change):
- cards: 1500, reveals: 250, iterations: 300
- total time: 172.2 ms
- avg time: 0.574 ms/iteration
- heap delta: 22.4 MB

## Library reveals sync after
Command:
- bun apps/server/scripts/library-reveals-bench.ts

Results (after change):
- cards: 1500, reveals: 250, iterations: 300
- total time: 159.8 ms
- avg time: 0.533 ms/iteration
- heap delta: 24.1 MB

## Overlay zone lookup baseline
Command:
- bun apps/server/scripts/overlay-bench.ts --snapshot

Results (before change):
- overlays: 1000
- total time: 51.4 ms
- avg time: 0.0514 ms/overlay
- heap delta: 3.0 MB

## Overlay zone lookup after
Command:
- bun apps/server/scripts/overlay-bench.ts --snapshot --zones

Results (after change):
- overlays: 1000
- total time: 41.4 ms
- avg time: 0.0414 ms/overlay
- heap delta: 2.8 MB

## Duplicate intent baseline
Command:
- bun apps/server/scripts/duplicate-bench.ts

Results (before change):
- battlefield cards: 800, other zone cards: 2500
- iterations: 200
- total time: 202.7 ms
- avg time: 1.013 ms/iteration
- heap delta: 11.9 MB

## Duplicate intent after
Command:
- bun apps/server/scripts/duplicate-bench.ts

Results (after change):
- battlefield cards: 800, other zone cards: 2500
- iterations: 200
- total time: 99.5 ms
- avg time: 0.498 ms/iteration
- heap delta: 5.7 MB

## Intent bench baseline
Command:
- bun apps/server/scripts/intent-bench.ts

Results (before change):
- players: 4, libraryCards: 2000, iterations: 5000
- total time: 60.4 ms
- avg time: 0.0121 ms/intent
- heap delta: 5.2 MB

## Intent bench after
Command:
- bun apps/server/scripts/intent-bench.ts

Results (after change):
- players: 4, libraryCards: 2000, iterations: 5000
- total time: 25.0 ms
- avg time: 0.0050 ms/intent
- heap delta: 5.2 MB

## Local websocket load baseline (coin.flip)
Server:
- bun run --cwd apps/server dev -- --local --port 8787

Load command:
- bun apps/server/scripts/ws-load.ts --url ws://localhost:8787/parties/rooms/bench --connections 5 --messages 3 --timeoutMs 10000 --windowMs 1000

Results:
- samples: 15
- avg: 4.66 ms
- p50: 3.99 ms
- p95: 9.09 ms
- p99: 9.09 ms

## Local websocket load (mixed intents)
Server:
- bun run --cwd apps/server dev -- --local --port 8787

Load command:
- bun apps/server/scripts/ws-load.ts --url ws://localhost:8787/parties/rooms/bench --connections 8 --messages 5 --timeoutMs 15000 --windowMs 1000 --libraryCards 40

Intent mix:
- coin.flip, library.view, card.tap, dice.roll

Results:
- samples: 40
- avg: 17.02 ms
- p50: 19.80 ms
- p95: 21.35 ms
- p99: 21.35 ms

## Local websocket load (mixed intents, higher concurrency)
Server:
- bun run --cwd apps/server dev -- --local --port 8787

Load command:
- bun apps/server/scripts/ws-load.ts --url ws://localhost:8787/parties/rooms/bench --connections 20 --messages 10 --timeoutMs 20000 --windowMs 2000 --libraryCards 80

Intent mix:
- coin.flip, library.view, card.tap, dice.roll

Results:
- samples: 200
- avg: 73.96 ms
- p50: 88.94 ms
- p95: 100.05 ms
- p99: 100.11 ms

## Local websocket load (mixed intents after hidden-state persist debounce)
Server:
- bun run --cwd apps/server dev -- --local --port 8791

Load command:
- bun apps/server/scripts/ws-load.ts --url ws://localhost:8791/parties/rooms/bench --room bench-mix-debounce --connections 20 --messages 10 --timeoutMs 20000 --windowMs 2000 --libraryCards 80

Intent mix:
- coin.flip, library.view, card.tap, dice.roll

Results:
- samples: 200
- avg: 27.31 ms (was 73.96 ms)
- p50: 30.21 ms (was 88.94 ms)
- p95: 42.14 ms (was 100.05 ms)
- p99: 46.23 ms (was 100.11 ms)

## Local websocket load (per-intent profiling, higher concurrency)
Server:
- bun run --cwd apps/server dev -- --local --port 8787

Common load settings:
- connections: 20
- messages/connection: 10
- timeoutMs: 20000
- windowMs: 2000
- libraryCards: 300

coin.flip:
- avg: 70.61 ms
- p50: 87.95 ms
- p95: 95.87 ms
- p99: 97.96 ms

dice.roll:
- avg: 16.14 ms
- p50: 19.28 ms
- p95: 21.25 ms
- p99: 21.85 ms

card.tap:
- avg: 25.28 ms
- p50: 27.19 ms
- p95: 37.67 ms
- p99: 41.44 ms

library.view:
- avg: 47.77 ms
- p50: 56.92 ms
- p95: 57.62 ms
- p99: 59.08 ms

library.draw:
- avg: 320.00 ms
- p50: 323.78 ms
- p95: 612.15 ms
- p99: 627.51 ms

card.move:
- avg: 26.40 ms
- p50: 31.78 ms
- p95: 38.40 ms
- p99: 39.56 ms

## Local websocket load (per-intent profiling after hidden-state persist debounce)
Server:
- bun run --cwd apps/server dev -- --local --port 8792

Common load settings:
- connections: 20
- messages/connection: 10
- timeoutMs: 20000
- windowMs: 2000
- libraryCards: 300

coin.flip:
- avg: 24.26 ms (was 70.61 ms)
- p50: 22.49 ms (was 87.95 ms)
- p95: 32.45 ms (was 95.87 ms)
- p99: 32.83 ms (was 97.96 ms)

dice.roll:
- avg: 31.93 ms (was 16.14 ms)
- p50: 29.15 ms (was 19.28 ms)
- p95: 47.41 ms (was 21.25 ms)
- p99: 49.36 ms (was 21.85 ms)

card.tap:
- avg: 32.91 ms (was 25.28 ms)
- p50: 33.97 ms (was 27.19 ms)
- p95: 46.89 ms (was 37.67 ms)
- p99: 48.19 ms (was 41.44 ms)

library.view:
- avg: 42.75 ms (was 47.77 ms)
- p50: 45.64 ms (was 56.92 ms)
- p95: 57.92 ms (was 57.62 ms)
- p99: 59.83 ms (was 59.08 ms)

library.draw:
- avg: 178.77 ms (was 320.00 ms)
- p50: 146.80 ms (was 323.78 ms)
- p95: 401.96 ms (was 612.15 ms)
- p99: 417.40 ms (was 627.51 ms)

card.move:
- avg: 25.33 ms (was 26.40 ms)
- p50: 23.83 ms (was 31.78 ms)
- p95: 37.82 ms (was 38.40 ms)
- p99: 38.25 ms (was 39.56 ms)

Rerun (fresh server, port 8793) for dice.roll and card.tap:
- dice.roll avg: 24.16 ms, p50: 26.12 ms, p95: 32.97 ms, p99: 33.93 ms
- card.tap avg: 27.03 ms, p50: 26.49 ms, p95: 41.01 ms, p99: 41.44 ms

## Memory trend (RSS sampling under sustained load)
Server:
- bun run --cwd apps/server dev -- --local --port 8794

Load loop:
- 10x runs of `ws-load.ts` (connections 20, messages 10, mix library.draw, windowMs 2000, libraryCards 300)
- 1s pause between runs

Sampling:
- `ps -o rss` every 2s for the server pid + listener pid (105 samples over ~3.5 minutes)

Observed RSS:
- main server pid: min 42.4 MB, max 104.6 MB, avg 72.1 MB
- listener/worker pid: min 0.8 MB, max 2.6 MB, avg 2.3 MB
- first 5 samples avg: 53.9 MB; last 5 samples avg: 104.6 MB (main pid)

Notes:
- RSS grew during the short run; needs a longer steady-state run to confirm whether it plateaus or indicates retention.

## Memory trend (RSS sampling, longer steady-state run)
Server:
- bun run --cwd apps/server dev -- --local --port 8795

Load loop:
- 30x runs of `ws-load.ts` (connections 20, messages 10, mix library.draw, windowMs 2000, libraryCards 300)
- 1s pause between runs (total ~10–11 minutes)

Sampling:
- `ps -o rss` every 5s (127 samples)

Observed RSS:
- main server pid: min 42.5 MB, max 132.2 MB, avg 79.0 MB
- listener/worker pid: min 2.6 MB, max 2.8 MB, avg 2.7 MB
- first 5 samples avg: 46.7 MB; last 5 samples avg: 91.7 MB (main pid)

Notes:
- RSS increased over the run with intermittent spikes; last samples are higher than the start, but below peak.
- This suggests either slow growth or delayed GC; needs heap profiling to confirm retention.

## Heap snapshots (start/mid/end under load)
Server:
- bun run --cwd apps/server dev -- --local --port 8797 --inspector-port 9231

Capture tool:
- `.context/heap-snapshot.mjs` (uses Wrangler inspector to call `HeapProfiler.takeHeapSnapshot`)

Files:
- `.context/heap-snapshots/heap-start.heapsnapshot` (1.4 MB)
- `.context/heap-snapshots/heap-mid.heapsnapshot` (3.6 MB)
- `.context/heap-snapshots/heap-end.heapsnapshot` (3.7 MB)

Notes:
- Snapshot file size grew from start → mid and then stabilized; inspect in DevTools to confirm retained object growth.

### Heap diff summary (CLI analysis)
- total JS self_size: 1.07 MB (start) → 2.95 MB (mid) → 3.04 MB (end)
- mid → end growth: +0.10 MB with +2,084 nodes (small)
- largest growth buckets: V8 bytecode/feedback arrays + generic Objects/strings (warmup)
- no obvious app-specific retained object surge detected from shallow size deltas
- pattern scan (heap-end) for “map/array/set/overlay/hidden/card/zone” shows only small instruction streams + generic Maps; no large app object classes surfaced

## In-process metrics (opt-in)
Enable per-room size counters by adding `perfMetrics=1` to the WebSocket URL or passing `--perfMetrics` to `ws-load.ts`.
Security: URL params are only honored when `PERF_METRICS_ALLOW_PARAM=1` is set in the environment.
Optional: pass `perfMetricsIntervalMs=<ms>` (or `--perfMetricsIntervalMs <ms>`) to lower the log interval for short runs (clamped to 5s–5m).
When enabled, the server will emit `[perf] room metrics { ... }` with `reason: "interval"` on a timer, plus occasional event-triggered logs.

Example:
- `bun apps/server/scripts/ws-load.ts --url ws://localhost:8800/parties/rooms/bench --perfMetrics`

To parse logs into CSV:
- `bun apps/server/scripts/perf-metrics-parse.ts --input /path/to/wrangler.log --output /tmp/perf-metrics.csv`

To merge perf metrics with RSS samples:
- `bun apps/server/scripts/perf-metrics-merge.ts --metrics /tmp/perf-metrics.csv --rss /tmp/partyserver-mem.csv --output /tmp/perf-metrics-merged.csv`

## Perf metrics + RSS correlation run (interval 5s)
Server:
- bun run --cwd apps/server dev -- --local --port 8809

Load command:
- bun apps/server/scripts/ws-load.ts --url ws://localhost:8809/parties/rooms/bench --room bench-metrics-long7 --connections 20 --messages 200 --timeoutMs 20000 --windowMs 30000 --libraryCards 300 --mix library.draw --perfMetrics --perfMetricsIntervalMs 5000

RSS sampling:
- `ps -o rss` every 5s for wrangler pid + listener pid (summed per timestamp)

Perf metrics parsing:
- `perf-metrics-parse.ts` → `/tmp/perf-metrics-8809.csv` (9 records)
- `perf-metrics-merge.ts` → `/tmp/perf-metrics-8809-merged.csv`

Steady-state rows (connections=20, 6 samples):
- yjs_zones: 4
- yjs_cards: 1 (battlefield)
- hidden_cards: 300
- hidden_handCards: 300
- hidden_libraryCards: 0
- RSS sum min/avg/max: ~98.6MB / 105.0MB / 119.4MB (100,928 / 107,496 / 122,368 KB)

Correlation note:
- Over this short run, object counts stayed flat while RSS drifted within ~20MB; no strong correlation observed.

## Local websocket load (library.draw after overlay caching)
Server:
- bun run --cwd apps/server dev -- --local --port 8787

Load command:
- bun apps/server/scripts/ws-load.ts --url ws://localhost:8787/parties/rooms/bench --room bench-draw-after-<ts> --connections 20 --messages 10 --timeoutMs 20000 --windowMs 2000 --libraryCards 300 --mix library.draw

Results:
- samples: 200
- avg: 204.86 ms (was 320.00 ms)
- p50: 187.22 ms (was 323.78 ms)
- p95: 384.90 ms (was 612.15 ms)
- p99: 403.49 ms (was 627.51 ms)

## Local websocket load (library.draw after hidden-state persist debounce)
Server:
- bun run --cwd apps/server dev -- --local --port 8790

Load command:
- bun apps/server/scripts/ws-load.ts --url ws://localhost:8790/parties/rooms/bench --room bench-draw-debounce --connections 20 --messages 10 --timeoutMs 20000 --windowMs 2000 --libraryCards 300 --mix library.draw

Results:
- samples: 200
- avg: 170.53 ms (was 204.86 ms)
- p50: 167.62 ms (was 187.22 ms)
- p95: 344.40 ms (was 384.90 ms)
- p99: 360.04 ms (was 403.49 ms)
