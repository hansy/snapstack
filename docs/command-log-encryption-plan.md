# Command Log + Encryption Plan

This document captures the agreed design and implementation plan for hiding private information while keeping the system mostly client-side.

## Summary

- Keep a **single shared Yjs doc** to avoid multi-doc drift.
- Replace direct state sync with a **signed command log**.
- Encrypt hidden data (hands, libraries, face-down identities) in command payloads.
- Use **two URLs** maximum: one for players, one for spectators.

## Progress (2026-01-07)

- **Task 1 (Crypto utilities)**: complete (`apps/web/src/crypto/*`).
- **Task 2 (Identity + key storage)**: complete (`apps/web/src/lib/sessionIdentity.ts`, `apps/web/src/lib/sessionKeys.ts`).
- **Task 0 (Flag + compatibility)**: `useCommandLog` now wired into multiplayer sync with a legacy fallback and a one-time warning (`apps/web/src/hooks/game/multiplayer-sync/sessionResources.ts`).
- **Task 10 (Server gate)**: DO handshake now requires `role` + `accessKey`, with key hashes persisted per room and cleared on expiry (`apps/server/signalRoom.ts`, `apps/server/constants.ts`).
- **Task 3 (Yjs command log scaffolding)**: complete (added `commands`/`snapshots` arrays, MAC/sign/validation/log hash helpers, and a minimal local append path for `player.join`).

## Goals

- Hidden information is not readable by unauthorized clients.
- Honest clients converge on the same state via deterministic replay.
- Minimize server logic (relay only).
- Avoid multi-doc state fracture.
- Cap URLs to 2 (player and spectator).

## Non-Goals

- Full anti-cheat or authoritative rules enforcement.
- Preventing a malicious client from submitting illegal commands (we only validate signatures and ownership).

## URLs and Keys

Two shareable URLs:

- Player link: `/game/<sessionId>#k=<playerKey>`
- Spectator link: `/game/<sessionId>#s=<spectatorKey>`

Definitions:

- `sessionId` identifies the room (Durable Object name).
- `playerKey` is a shared room secret for players (join access).
- `spectatorKey` is a shared room secret for spectators (decrypts hands + face-down identities).

Notes:

- `playerKey` and `spectatorKey` are rotatable without changing `sessionId`.
- There is no per-player auth. Identity is derived from local keys.
- `playerKey` is also used to compute a command MAC (HMAC) so spectators cannot submit valid commands (MAC is required on all commands).

## Server Gate (Minimal)

Stricter (chosen):

- The server enforces `playerKey` for player connections.
- The server enforces `spectatorKey` for spectator connections.
- Spectators cannot connect without `spectatorKey`.
  - Note: URL hash fragments (`#k`/`#s`) are not visible to the server. Clients must send the key in an initial auth message after connect, or move to query params if enforcing at handshake time.

## Identity

- Each player generates:
  - an Ed25519 key pair (signing)
  - an X25519 key pair (encryption for selective reveals)
- `playerId = hash(signPubKey)` (e.g., first 16 bytes of SHA-256, hex).
- The private key is stored locally (per session).
- Spectators are read-only and do not have a signing key.

## Data Model (Single Yjs Doc)

Yjs root:

- `commands`: `Y.Array<CommandEnvelope>` (append-only)
- `snapshots`: `Y.Array<SignedSnapshot>` (optional, for fast sync)

There are **no** shared state maps (players, cards, zones). All state is derived from command replay.

## Command Envelope

```json
{
  "v": 1,
  "id": "uuid",
  "actorId": "playerId",
  "seq": 42,
  "ts": 1736225000000,
  "type": "card.move",
  "payloadPublic": { "...": "..." },
  "payloadOwnerEnc": "base64url(nonce||ct)",
  "payloadSpectatorEnc": "base64url(nonce||ct)",
  "payloadRecipientsEnc": {
    "playerId": { "epk": "base64url", "nonce": "base64url", "ct": "base64url" }
  },
  "pubKey": "base64(ed25519 public key)",
  "mac": "base64(hmac-sha256)",
  "sig": "base64(ed25519 signature)"
}
```

Rules:

- `payloadPublic` is always visible.
- `payloadOwnerEnc` is encrypted with the owner key.
- `payloadSpectatorEnc` is encrypted with the spectator key.
- `payloadRecipientsEnc` maps recipient `playerId` to encrypted payloads (selective reveals).
- `sig` signs the canonical bytes of the envelope (minus `sig`).
- `mac` is required for all commands (and snapshots) and is computed from `playerKey`.

## Canonical Encoding + Signature

Canonical serialization rules (for `sig` and `mac`):

- Build a plain object with fields in this exact order:
  `v`, `id`, `actorId`, `seq`, `ts`, `type`, `payloadPublic`, `payloadOwnerEnc`,
  `payloadSpectatorEnc`, `payloadRecipientsEnc`, `pubKey`, `mac`.
- Omit any fields that are `undefined` (do not include as `null`).
- Arrays keep their order. Object keys are sorted lexicographically at every level.
- Encode as UTF-8 bytes of the canonical JSON string (no extra whitespace).
- `mac` = HMAC-SHA256 over canonical bytes **excluding** `mac` and `sig`, using `playerKey`-derived MAC key.
- `sig` = Ed25519 signature over canonical bytes **including** `mac` but **excluding** `sig`.
- Use a known canonical JSON library (RFC 8785), e.g. `canonicalize` or `json-canonicalize`.

## Key Derivation and Storage

Key formats:

- `playerKey` and `spectatorKey`: 32 random bytes, base64url encoded.
- `ownerKey`: 32 random bytes per player per session, base64url encoded.
- `encPubKey`: X25519 public key, base64.

Derivation (HKDF-SHA256 suggested):

- `playerMacKey` = HKDF(`playerKey`, info = "room-mac", salt = `sessionId`).
- `spectatorAesKey` = HKDF(`spectatorKey`, info = "spectator-aes", salt = `sessionId`).
- `ownerAesKey` = HKDF(`ownerKey`, info = "owner-aes", salt = `sessionId`).

Storage:

- `playerKey` and `spectatorKey` are read from the URL and cached per `sessionId`.
- `ownerKey` and the signing keypair are stored locally per `sessionId`.
- `encPubKey` is published in `player.join` so others can encrypt selective reveals.

## Selective Reveal Encryption (Per-Recipient)

Selective reveal uses the recipient's `encPubKey` (X25519):

- Generate an ephemeral X25519 key pair.
- Compute shared secret via X25519 (ephemeralPriv, recipientEncPub).
- Derive AES-GCM key via HKDF-SHA256 (info = "reveal", salt = sessionId).
- Encrypt payload and store in `payloadRecipientsEnc[recipientId]`.
- Ciphertext format for selective reveal: `{ epk, nonce, ct }` where each field is base64url and `ct` includes the GCM tag.

## Crypto Library Choice

Default (recommended):

- `@noble/curves` for Ed25519 + X25519.

Alternatives:

- `libsodium-wrappers`: very full-featured and battle-tested, but heavier bundle and async init.
- `tweetnacl` / `tweetnacl-util`: small and fast, but fewer conveniences and less ergonomic APIs.
- WebCrypto: does **not** reliably support Ed25519/X25519 across browsers yet (not recommended).

Rationale for `@noble/curves`:

- Small, tree-shakable, modern APIs.
- Good fit for web (no WASM init).
- Clean support for Ed25519 + X25519 in one dependency.

## Zone and Card IDs

Proposed deterministic zone IDs (avoid explicit zone creation commands):

- `zoneId = "<playerId>:<zoneType>"` for player zones:
  `library`, `hand`, `battlefield`, `graveyard`, `exile`, `commander`, `sideboard`.
- Optional global zones (if needed later): `global:stack`, `global:shared`.

Card IDs remain UUIDs generated by the creator.
Card identity retention:

- If a known public card moves to a player's hand, keep the same `cardId` (knowledge preserved).
- If a known public card moves into a library, **forget** its identity and treat it as a new hidden card with a new `cardId` inside encrypted payloads (public only gets the count change).

## Command Vocabulary (MVP)

Public commands (unencrypted):

- `player.join`:
  `payloadPublic: { playerId, name?, color?, signPubKey, encPubKey }`
- `player.leave`:
  `payloadPublic: { playerId }`
- `player.update`:
  `payloadPublic: { playerId, name?, color?, life?, counters?, commanderDamage?, commanderTax?, deckLoaded?, libraryTopReveal? }`
- `card.create.public` (tokens or revealed cards in public zones):
  `payloadPublic: { cardId, ownerId, controllerId, zoneId, position, rotation, tapped, counters, faceDown?, identity }`
- `card.update.public` (patch state in public zones):
  `payloadPublic: { cardId, zoneId, tapped?, counters?, rotation?, position?, faceDown?, controllerId? }`
- `card.move.public` (public-to-public or reorder):
  `payloadPublic: { cardId, fromZoneId, toZoneId, position?, rotation?, faceDown?, controllerId? }`
- `card.remove.public`:
  `payloadPublic: { cardId, zoneId }`
- `global.counter.set`:
  `payloadPublic: { key, value }`

Hidden-zone commands (encrypted):

- `zone.set.hidden` (owner only, replaces entire zone):
  `payloadPublic: { ownerId, zoneType, count }`
  `payloadOwnerEnc: { cards: CardIdentity[], order: cardId[] }`
  `payloadSpectatorEnc: { cards: CardIdentity[], order: cardId[] }` (hand only)
- `library.shuffle` (owner only):
  `payloadPublic: { ownerId, count }`
  `payloadOwnerEnc: { order: cardId[] }`
- `card.draw` (owner only):
  `payloadPublic: { ownerId, count }`
  `payloadOwnerEnc: { hand: CardIdentity[], order: cardId[] }`
  `payloadSpectatorEnc: { hand: CardIdentity[] }`
- `card.reveal.set` (owner only; selective or all):
  `payloadPublic: { cardId, zoneId, revealToAll, revealTo }`
  - if `revealToAll === true`, include `payloadPublic.identity`
  - if `revealTo` is non-empty, include `payloadRecipientsEnc`
- `library.topReveal.set` (owner only):
  `payloadPublic: { ownerId, mode: "self" | "all" }`
  - if `mode === "all"`, include `payloadPublic.cardId` + `payloadPublic.identity`

Notes:

- Selective reveal (to specific opponents) is supported via `payloadRecipientsEnc`.
- `CardIdentity` uses existing `ScryfallCardLite` fields plus `name`, `imageUrl`, `scryfallId`, `layout`.

## Ownership Rules Matrix

Match existing permissions (`apps/web/src/rules/permissions.ts`):

- Spectators cannot mutate anything.
- Hidden zones (library, hand, sideboard):
  - Only the zone owner can move cards out.
  - Only the destination hidden-zone owner can move cards in.
- Battlefields:
  - Moving between battlefields: owner or controller.
  - Moving into a battlefield: owner or controller.
- Non-battlefield seat zones (graveyard/exile/commander/sideboard/library/hand):
  - Cards may only enter their owner’s seat zones (except any battlefield).
  - Commander zone: only the card owner may move cards into it.
  - Tokens leaving battlefield: only the owner may move them off battlefield (they vanish).
  - Host may move cards within their own non-hidden zones (public piles).
- Card state (tap/untap, counters, P/T, transform, custom text):
  - Only controller, and only on battlefield.
- Token creation:
  - Only the owner of the destination battlefield.
- Player updates:
  - Self only (cannot change others’ life/name/commander damage).
- Reveals (hand/library):
  - Only owner may reveal to some/all or revoke.
- Library top reveal:
  - Only owner may set `mode: self | all`.

These rules are enforced client-side; invalid commands are ignored.

## Snapshot Format and Selection

Snapshot envelope:

```json
{
  "v": 1,
  "id": "uuid",
  "actorId": "playerId",
  "seq": 9001,
  "ts": 1736225000000,
  "upToIndex": 1234,
  "logHash": "hex(sha256-chain)",
  "publicState": { "...": "..." },
  "ownerEncByPlayer": { "playerId": "base64url(nonce||ct)" },
  "spectatorEnc": "base64url(nonce||ct)",
  "pubKey": "base64(ed25519 public key)",
  "mac": "base64(hmac-sha256)",
  "sig": "base64(ed25519 signature)"
}
```

Log hash chain:

- `cmdHash = sha256(canonicalCommandBytes)`
- `logHash(0) = sha256("init")`
- `logHash(n) = sha256(logHash(n-1) || cmdHash(n))`

Snapshot selection:

- Accept only snapshots with valid `sig` and `mac`.
- Prefer the snapshot with the highest `upToIndex` whose `logHash` matches local chain.
- Replay commands after `upToIndex`.

## Encryption

- AES-GCM, 96-bit nonce, base64url output.
- Ciphertext format: single base64url string of `nonce || ciphertext+tag` (nonce first).
- Hidden zones:
  - Library: owner only (`payloadOwnerEnc`).
  - Hand: owner + spectators (`payloadOwnerEnc` + `payloadSpectatorEnc`).
  - Face-down identity on battlefield: spectators only (`payloadSpectatorEnc`).
- Public payload always includes **counts** (hand size, library size).

Leakage (acceptable):

- Timing and size of encrypted updates are visible to all clients.
- No card identities or library order are exposed without keys.

## Validation Rules (Client-Side)

Commands are applied only if all checks pass:

1. Signature is valid for `pubKey`.
2. `actorId === hash(pubKey)`.
3. `seq === lastSeq[actorId] + 1`.
4. `mac` is valid for all commands (using `playerKey`).
5. Ownership rules per **Ownership Rules Matrix** (mirrors `apps/web/src/rules/permissions.ts`).

Invalid commands are ignored. Honest clients converge on the same state.

## State Derivation

- State is derived via deterministic replay of the command log.
- Apply in Yjs array order.
- Use decrypted payloads when keys are available.
- Store derived state in Zustand (not in Yjs).

## Snapshots

To avoid replaying long logs:

- Periodically emit signed snapshots (every 200 commands or 60 seconds).
- Keep the last 3 snapshots; do not prune command log in MVP.
- A snapshot contains:
  - public state + counts (plain)
  - encrypted owner payloads (per-player)
  - encrypted spectator payloads (all hands + face-down identities)
- New clients:
  1. Load latest valid snapshot.
  2. Replay newer commands.

Snapshots are optional but recommended.

## Spectators

- Spectators are read-only (no signing key).
- Spectator link provides `spectatorKey` to decrypt hands + face-down identities.
- Spectators cannot see libraries.
- Commands without a valid `mac` are ignored, so spectators cannot mutate state.

## Threat Model / Limitations

- This design does **not** prevent illegal moves from malicious clients.
- It does prevent **impersonation** and **private data disclosure**.
- It does not prevent a malicious player from submitting nonsense commands
  (clients will apply them if they are signed and ownership-allowed).

## Incremental Implementation Plan

### Phase 0: Flag + Compatibility

- Add feature flag `useCommandLog`.
- Keep existing Yjs state path as fallback.

### Phase 1: Crypto Primitives

- Add Ed25519 sign/verify, SHA-256 hash.
- Add AES-GCM encrypt/decrypt.
- Add canonical JSON encoding for signatures.

### Phase 2: Identity Switch

- Replace UUID playerId with `hash(pubKey)`.
- Store key pair per session in localStorage.

### Phase 3: Command Log Infrastructure

- Add `commands` array to Yjs doc handles.
- Implement `appendCommand()`.
- Implement `validateCommand()` and reducer/replay.

### Phase 4: Public-Only Commands

- Migrate public actions (move, tap, counters, player updates) to commands.
- Stop direct Yjs state writes for these actions when flag is on.

### Phase 5: Hidden Zones + Encryption

- Add encrypted payloads for hand/library/face-down identity.
- Migrate draw, shuffle, mulligan, move-to-hand/library.

### Phase 6: Spectator Mode

- Add spectator URL parsing.
- Decrypt spectator payloads and render read-only UI.

### Phase 7: Signed Snapshots

- Emit and validate periodic snapshots.
- Fast-sync on join.

### Phase 8: Clean-Up

- Remove legacy shared state maps if command log is default.
- Add tests for validation, replay determinism, encryption behavior, snapshots.

## Task Breakdown (Implementation Tickets)

1) **Crypto utilities** (complete): add RFC 8785 canonical JSON encoding (use `canonicalize` or `json-canonicalize`), base64url helpers, SHA-256, HKDF, AES-GCM, Ed25519 + X25519 using `@noble/curves`, with unit tests (`apps/web/src/crypto/*`).
2) **Identity + key storage** (complete): generate signing + encryption keypairs, derive `playerId = hash(signPubKey)`, store per-session in localStorage, parse `#k`/`#s` URL params, cache `playerKey`/`spectatorKey` (`apps/web/src/store/gameStore/actions/session.ts`, URL parsing helpers).
3) **Yjs command log scaffolding** (complete): add `commands` + `snapshots` arrays to `apps/web/src/yjs/yDoc.ts`, create `appendCommand`, `validateCommand`, MAC/sign helpers, log hash chain (`apps/web/src/commandLog/*`).
4) **Reducer + replay**: implement deterministic replay engine from command log to Zustand state, wire into `fullSyncToStore` / multiplayer sync path behind a feature flag.
5) **Public commands migration**: move player join/update, public card create/update/move, tap/untap, counters, token creation, global counters into commands; stop direct Yjs mutations when flag on.
6) **Hidden zones + encryption**: implement encrypted hand/library commands (`zone.set.hidden`, `library.shuffle`, `card.draw`, mulligan flows), and derive counts in public payloads; update UI selectors to use decrypted zones.
7) **Selective reveals**: implement `card.reveal.set` with per-recipient encryption using X25519 and `payloadRecipientsEnc`; publish `encPubKey` in `player.join`; support revoke.
8) **Library top reveal**: implement `library.topReveal.set` with `mode: self|all`, and only include identity when `mode === all`.
9) **Snapshots**: signed snapshot emitter/validator, fast-load path, pruning policy.
10) **Server gate** (complete): enforce `playerKey` for player connections and `spectatorKey` for spectator connections in `apps/server/signalRoom.ts`/`apps/server/worker.ts`.
11) **Cleanup + tests**: remove legacy shared maps behind flag, add regression tests for permissions parity, signature/MAC validation, replay determinism, selective reveal, snapshot correctness.

## Decisions Already Made

- Two URLs max: player + spectator.
- Signed command log (client-side).
- Encryption acceptable despite timing/size metadata leakage.
- Spectators can see all hands + face-down identities (not libraries).
- Zone IDs are deterministic (`"<playerId>:<zoneType>"`).
- Selective reveal to some/all is supported (with revoke via `card.reveal.set`).
- Owner key is stored in localStorage per session.
- Permissions match existing rules in `apps/web/src/rules/permissions.ts`.
- Spectator connections require `spectatorKey` to connect.
- No key-rotation UI in MVP (keys can be rotated by issuing new links out-of-band).
