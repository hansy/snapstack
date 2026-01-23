# Scalable Anti-Cheat Overlay Architecture Plan

## Purpose

Scale to ~10,000 concurrent players across ~3,000 rooms while preserving:
- Server-authoritative hidden information (no client peeking)
- Selective reveals (to any subset)
- Optional omniscient spectators
- Strong anti-leak guarantees
- Minimal bandwidth, CPU, and storage overhead

This document is designed to be tracked over time. Each section includes status checkboxes so progress is explicit and auditable.

----

## Phase 0 — Baseline Instrumentation (Do First)

Goal: Measure reality before optimizing.

Metrics to Add
- [x] intent_apply_ms (avg / p95)
- [x] overlay_build_ms (avg / p95) per viewer type (player vs spectator)
- [x] overlay_bytes_sent by message type (snapshot vs diff)
- [x] overlay_messages_sent_count
- [x] overlay_resync_count (client needed full snapshot)
- [x] yjs_bytes_sent + update frequency
- [x] library_views_active_count per room
- [x] room_hotness (intents/sec per room)

Exit Criteria: Metrics visible in dashboard/logs and validated under normal play.

----

## Phase 1 — Protocol & Data Model (Low Code, Unblocks Everything)

Goal: Make overlay diffs, versioning, and capability negotiation possible.

1. Overlay Versioning Model
- [x] Introduce overlayVersion (monotonic per connection)
- [x] Require baseOverlayVersion on diffs
- [x] Fallback to snapshot on version mismatch

2. Message Types

privateOverlay (Snapshot)
- [x] Add overlayVersion
- [x] Add viewerId, roomId
- [x] Add schemaVersion

privateOverlayDiff
- [x] Define diff payload shape
- [x] Support upsert, remove
- [x] Support versioned zoneOrders
- [x] Include minimal metadata (counts, flags)

3. CardLite Contract (Critical)

Invariant: Overlay payloads must never include heavy oracle data.
- [x] Define minimal CardLite schema
- [x] Remove oracle text / images from overlay payloads
- [x] Ensure client fetches oracle data from CDN/db by oracleId

4. Capability Negotiation
- [x] Client sends hello { capabilities }
- [x] Server responds with accepted capabilities
- [x] Store capabilities per connection

5. Library View Lifecycle
- [x] Implement library.view.close intent
- [x] Implement library.view.ping (10-15s heartbeat)
- [x] Auto-expire views after 30-60s of no ping
- [x] Cleanup views on disconnect

Exit Criteria: Server can safely stop sending large library overlays when view closes.

----

## Phase 2 — Immediate Server Savings

Goal: Reduce waste before building full diff pipeline.

1. Skip Unchanged Overlays
- [x] Track last overlay revision/digest per connection
- [x] Skip send if unchanged
- [x] Avoid expensive JSON.stringify comparisons

2. Persistence Cadence
- [x] Increase debounce to ~1-2s
- [x] Add idle flush (no hidden changes for N seconds)
- [x] Flush on room teardown
- [x] Flush on last player disconnect
- [x] Flush on server shutdown (best effort)

----

## Phase 3 — Overlay Diff Pipeline (Biggest Bandwidth Win)

Goal: Stop snapshot spam entirely in steady state.

1. Per-Connection Overlay Cache
- [x] Cache visible CardInstanceId -> hash
- [x] Cache last zoneOrders versions
- [x] Track current overlayVersion

2. Diff Generation
- [x] Compute upserts (new or changed cards)
- [x] Compute removes (no longer visible)
- [x] Include zoneOrders only if version changed

3. Large Diff Fallback
- [x] Define size threshold (bytes or % of snapshot)
- [x] Auto-fallback to snapshot when exceeded

4. Client Diff Apply
- [x] Apply diff only if baseOverlayVersion matches
- [x] Request or accept snapshot on mismatch
- [x] Reset cache on snapshot

Exit Criteria: Average overlay payload size drops by >80% during normal play.

----

## Phase 4 — Reduce Overlay Recompute CPU

Goal: Stop rebuilding overlays for unaffected viewers.

1. Intent Impact Report

Modify applyIntentToDoc to return:
- [x] changedOwners
- [x] changedZones
- [x] changedRevealScopes
- [x] changedPublicDoc

2. Targeted Overlay Broadcast
- [x] Determine affected viewers from impact report
- [x] Recompute overlays only for those viewers
- [x] Always include omniscient spectators when relevant

3. (Optional) Visibility Index
- [ ] Maintain visibleCardIds per connection
- [ ] Update incrementally on intents
- [ ] Avoid full overlay rebuilds entirely

Exit Criteria: Overlay recompute CPU scales with affected players, not room size.

----

## Phase 5 — Persistence Optimization

Goal: Reduce storage I/O without sacrificing recoverability.

Decision Point
- [x] Evaluate Snapshot + Intent Log approach
- [x] Decide if bucketed writes are necessary

Option A — Snapshot + Intent Log (Preferred)
- [x] Append-only intent log per room
- [x] Periodic compact snapshot (hidden + public state)
- [x] Replay from last snapshot on restore

Option B — Bucketed Hidden State Writes
- [ ] Define stable buckets by hash(cardId) % N
- [ ] Track dirty buckets
- [ ] Write only dirty buckets on flush
- [ ] One-time migration from legacy chunks

----

## Phase 6 — Client Updates & Tests

Goal: Make correctness enforceable.

Client Changes
- [x] Send capability handshake
- [x] Send library.view.ping / library.view.close
- [x] Apply overlay diffs with version checks
- [x] Reset overlay on snapshot

Required Tests
- [x] Overlay diff add / update / remove
- [x] Zone order versioning correctness
- [x] Large diff -> snapshot fallback
- [x] Out-of-order diff handling
- [x] Spectator omniscience without leakage to players
- [x] Library view lifecycle (open -> ping -> expire)
- [x] Persistence debounce + idle flush

----

## Global Safety Invariants (Never Break)

- [x] Clients never receive hidden info they cannot see
- [x] Overlay caches are per-connection (never shared)
- [x] Spectator overlays cannot leak to players
- [x] Server remains sole holder of hidden plaintext

----

## Tracking Notes

- Use this document as a living checklist
- Mark items [x] as completed
- Add dates or PR links inline if useful
- New phases or constraints should be appended, not rewritten

----

## End State

A scalable, auditable, server-authoritative MTG tabletop engine that remains secure under modified clients and scales efficiently to thousands of concurrent rooms.
