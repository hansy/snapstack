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
- [ ] intent_apply_ms (avg / p95)
- [ ] overlay_build_ms (avg / p95) per viewer type (player vs spectator)
- [ ] overlay_bytes_sent by message type (snapshot vs diff)
- [ ] overlay_messages_sent_count
- [ ] overlay_resync_count (client needed full snapshot)
- [ ] yjs_bytes_sent + update frequency
- [ ] library_views_active_count per room
- [ ] room_hotness (intents/sec per room)

Exit Criteria: Metrics visible in dashboard/logs and validated under normal play.

----

## Phase 1 — Protocol & Data Model (Low Code, Unblocks Everything)

Goal: Make overlay diffs, versioning, and capability negotiation possible.

1. Overlay Versioning Model
- [ ] Introduce overlayVersion (monotonic per connection)
- [ ] Require baseOverlayVersion on diffs
- [ ] Fallback to snapshot on version mismatch

2. Message Types

privateOverlay (Snapshot)
- [ ] Add overlayVersion
- [ ] Add viewerId, roomId
- [ ] Add schemaVersion

privateOverlayDiff
- [ ] Define diff payload shape
- [ ] Support upsert, remove
- [ ] Support versioned zoneOrders
- [ ] Include minimal metadata (counts, flags)

3. CardLite Contract (Critical)

Invariant: Overlay payloads must never include heavy oracle data.
- [ ] Define minimal CardLite schema
- [ ] Remove oracle text / images from overlay payloads
- [ ] Ensure client fetches oracle data from CDN/db by oracleId

4. Capability Negotiation
- [ ] Client sends hello { capabilities }
- [ ] Server responds with accepted capabilities
- [ ] Store capabilities per connection

5. Library View Lifecycle
- [ ] Implement library.view.close intent
- [ ] Implement library.view.ping (10-15s heartbeat)
- [ ] Auto-expire views after 30-60s of no ping
- [ ] Cleanup views on disconnect

Exit Criteria: Server can safely stop sending large library overlays when view closes.

----

## Phase 2 — Immediate Server Savings

Goal: Reduce waste before building full diff pipeline.

1. Skip Unchanged Overlays
- [ ] Track last overlay revision/digest per connection
- [ ] Skip send if unchanged
- [ ] Avoid expensive JSON.stringify comparisons

2. Persistence Cadence
- [ ] Increase debounce to ~1-2s
- [ ] Add idle flush (no hidden changes for N seconds)
- [ ] Flush on room teardown
- [ ] Flush on last player disconnect
- [ ] Flush on server shutdown (best effort)

----

## Phase 3 — Overlay Diff Pipeline (Biggest Bandwidth Win)

Goal: Stop snapshot spam entirely in steady state.

1. Per-Connection Overlay Cache
- [ ] Cache visible CardInstanceId -> hash
- [ ] Cache last zoneOrders versions
- [ ] Track current overlayVersion

2. Diff Generation
- [ ] Compute upserts (new or changed cards)
- [ ] Compute removes (no longer visible)
- [ ] Include zoneOrders only if version changed

3. Large Diff Fallback
- [ ] Define size threshold (bytes or % of snapshot)
- [ ] Auto-fallback to snapshot when exceeded

4. Client Diff Apply
- [ ] Apply diff only if baseOverlayVersion matches
- [ ] Request or accept snapshot on mismatch
- [ ] Reset cache on snapshot

Exit Criteria: Average overlay payload size drops by >80% during normal play.

----

## Phase 4 — Reduce Overlay Recompute CPU

Goal: Stop rebuilding overlays for unaffected viewers.

1. Intent Impact Report

Modify applyIntentToDoc to return:
- [ ] changedOwners
- [ ] changedZones
- [ ] changedRevealScopes
- [ ] changedPublicDoc

2. Targeted Overlay Broadcast
- [ ] Determine affected viewers from impact report
- [ ] Recompute overlays only for those viewers
- [ ] Always include omniscient spectators when relevant

3. (Optional) Visibility Index
- [ ] Maintain visibleCardIds per connection
- [ ] Update incrementally on intents
- [ ] Avoid full overlay rebuilds entirely

Exit Criteria: Overlay recompute CPU scales with affected players, not room size.

----

## Phase 5 — Persistence Optimization

Goal: Reduce storage I/O without sacrificing recoverability.

Decision Point
- [ ] Evaluate Snapshot + Intent Log approach
- [ ] Decide if bucketed writes are necessary

Option A — Snapshot + Intent Log (Preferred)
- [ ] Append-only intent log per room
- [ ] Periodic compact snapshot (hidden + public state)
- [ ] Replay from last snapshot on restore

Option B — Bucketed Hidden State Writes
- [ ] Define stable buckets by hash(cardId) % N
- [ ] Track dirty buckets
- [ ] Write only dirty buckets on flush
- [ ] One-time migration from legacy chunks

----

## Phase 6 — Client Updates & Tests

Goal: Make correctness enforceable.

Client Changes
- [ ] Send capability handshake
- [ ] Send library.view.ping / library.view.close
- [ ] Apply overlay diffs with version checks
- [ ] Reset overlay on snapshot

Required Tests
- [ ] Overlay diff add / update / remove
- [ ] Zone order versioning correctness
- [ ] Large diff -> snapshot fallback
- [ ] Out-of-order diff handling
- [ ] Spectator omniscience without leakage to players
- [ ] Library view lifecycle (open -> ping -> expire)
- [ ] Persistence debounce + idle flush

----

## Global Safety Invariants (Never Break)

- [ ] Clients never receive hidden info they cannot see
- [ ] Overlay caches are per-connection (never shared)
- [ ] Spectator overlays cannot leak to players
- [ ] Server remains sole holder of hidden plaintext

----

## Tracking Notes

- Use this document as a living checklist
- Mark items [x] as completed
- Add dates or PR links inline if useful
- New phases or constraints should be appended, not rewritten

----

## End State

A scalable, auditable, server-authoritative MTG tabletop engine that remains secure under modified clients and scales efficiently to thousands of concurrent rooms.
