# PartyKit Migration Spec (Server-Authoritative, Hidden Information)

Date: 2026-01-13

## 0) Executive Summary
We are migrating from a client-authoritative Yjs sync model to a **server-authoritative** architecture using **PartyKit**. The server becomes the only writer of shared state and the only source of truth for hidden information (libraries, hands, face-down identities). Clients become read-only consumers of public state, and send **intents** to the server for all mutations. Logs are emitted by the server for **every write**, but **stored only on the client** (ephemeral across reconnects), per requirement.

Key outcomes:
- No auth/login: access is via **capability tokens** in URLs.
- Minimal server: PartyKit room holds canonical state and broadcasts updates; clients never write shared state.
- Reconnect/resume: public Yjs snapshot + server-provided private overlays on connect.
- Privacy: players cannot see libraries, other hands, or face-down identities; spectators can see everything except library.
- Local-first feel: **optimistic client prediction** with authoritative reconciliation.

---

## 1) Goals & Constraints
- **No auth/login**.
- **Minimal server**, but authoritative.
- Clients must **connect/reconnect and resume state**.
- Players should **not** see:
  - Library contents or order (including their own library unless explicitly viewing).
  - Other players’ hands.
  - Face-down card identities.
- Spectators can see everything **except library contents**.
- **Every write must have an associated log**.
- Logs can be **client-side only** (not persisted on server).
- **Local-first snappiness** via optimistic prediction.

---

## 1.1) Progress Tracker
- [x] PartyKit server scaffold + PartySocket client
- [x] Public schema changes (hand slots, library counts, reveal maps)
- [x] Intent protocol + server validation
- [x] Optimistic prediction + reconciliation on client
- [x] Hidden state extraction (library/hand/face-down)
- [x] Private overlays (owner/spectator projections)
- [x] Server-emitted logs (client-stored)
- [x] Reconnect/resume verification (public + overlays)
- [x] Permission enforcement + denial UX
- [x] Simplify/remove legacy client-authoritative paths
- [x] Migration tests (new behavior only) + perf checks

---

## 2) Tech Stack Decision
**Use PartyKit** to host the authoritative room server and use `y-partykit` for public state replication.

Why keep Yjs for public state?
- Minimal client changes: the app already hydrates from Yjs snapshots.
- Durable, efficient sync and snapshot storage is already working.
- Server authoritative write path still guarantees correctness.

PartyKit building blocks:
- **Party.Server** for room logic.
- **PartySocket** for client WS with reconnection.
- **y-partykit** to provide Yjs sync server for the public doc.

---

## 3) Architecture Overview

### 3.1 Server-Only Writer Model
- **Clients never write shared state**.
- **Server is the sole writer** to the public Yjs doc.
- Clients send **intents** only; server validates, mutates, logs, broadcasts.

### 3.2 Data Separation
- **Public state** is in Yjs and visible to all.
- **Hidden state** is stored in PartyKit room storage and only exposed via server-driven private overlays.

### 3.3 Connections
- One PartySocket connection per client for intents + overlays + logs.
- One Yjs provider (via y-partykit) for public state replication.

### 3.4 Local-First Snappiness (Optimistic Prediction)
- Clients apply a **local reducer** immediately on intent creation.
- Intents carry a unique `intentId` to correlate local prediction with server results.
- Server applies intent, emits authoritative updates and logs.
- Client reconciles by:
  1) removing fulfilled intents
  2) rebasing remaining pending intents on the new authoritative snapshot
- If the server rejects an intent, the client rolls back predicted changes (and optionally shows a brief UI notice).
- For battlefield positioning, keep collision resolution deterministic across client + server to reduce reconciliation jitter.

---

## 4) Access Model (No Auth)
- Use **capability tokens** embedded in room URLs.
  - `playerToken`: grants ownership of a seat.
  - `spectatorToken`: grants omniscient view (hands + face-down battlefield), but **no library**.
- Single spectator link per room (shared by all spectators).
- Tokens are validated on every intent and private overlay request.
- Token reuse is permitted for reconnect; optional token rotation can be added later.

---

## 5) State Model

### 5.1 Public State (Yjs)
Visible to all clients. This is the **public snapshot**.

**Players**
- id, name, life, color
- counters, commanderDamage, commanderTax
- deckLoaded
- libraryCount, handCount
- battlefieldViewScale

**Zones**
- Public zones only: battlefield, graveyard, exile, commander
- Hidden zones:
  - Hand: **slot IDs only** (no identities)
  - Library: **count only**
  - Sideboard: **count only**

**Cards (Public Only)**
- Public zone card identities and all visible state (controllerId, isCommander, customText, P/T, counters, transforms, etc.)
- Hand/library identities only appear when **revealed to all**

**Hand Slots**
- `handSlots[playerId] = [slotId...]` (order preserved)
- Slot ID list is public to allow positional tracking

**Reveals (To All)**
- `handRevealsToAll[slotId] -> CardIdentity`
- `libraryRevealsToAll[revealId] -> { cardIdentity, orderKey }`
  - orderKey preserves top-stack ordering for revealed cards
- `faceDownRevealsToAll[publicCardId] -> CardIdentity`

**Room Meta**
- hostId, locked, overCapacity, version

> Note: We remove shared `logs` from public Yjs doc.

### 5.2 Hidden State (PartyKit Storage)
Never exposed to unauthorized clients.

**Library**
- `library[ownerId] = [HiddenCard...]` ordered top → bottom

**Hand**
- `hand[ownerId] = [HiddenCard...]`
- `handSlotIds[ownerId] = [slotId...]` ordered to match hand UI
- `handSlotToHidden[slotId] = HiddenCardId`

**Sideboard**
- `sideboard[ownerId] = [HiddenCard...]`

**Face-down Battlefield**
- `faceDownBattlefield[publicCardId] = CardIdentity`

**Reveals (Per Player / To All)**
- `hiddenReveals[hiddenId] = { toAll, toPlayers[] }`
- `libraryReveals[ownerId] = { cardRef, toAll, toPlayers[], orderKey }`
- `libraryTopReveal[ownerId] = { mode: self|all }`

**Known-To-All**
- Tracks cards that became public and remain visible outside library.

---

## 6) Intents Protocol

### 6.1 Client → Server
All actions are sent as intents.

Naming conventions:
- Use `domain.action` or `domain.subdomain.action` (e.g. `card.move`, `card.counter.adjust`, `player.commanderTax.adjust`).
- Use `.set` for absolute assignment (use `null` to clear).
- Use `.adjust` for numeric deltas (positive/negative).
- Use `.move` for reordering with flexible targets (top/bottom/index).

```ts
interface Intent {
  id: string;          // uuid
  token: string;       // capability token
  type: string;        // e.g. "card.move", "library.draw", "library.revealTop"
  payload: object;
}
```

### 6.2 Server → Client
- `ack` (intent success/failure)
- `privateOverlay` (viewer-specific identity updates)
- `logEvent` (ephemeral, client-stored)
- public Yjs updates (through y-partykit)

---

## 7) Logs (Server-Emitted, Client-Stored)

Rules:
- **Every server mutation emits a log event**.
- Logs are **ephemeral** and **not persisted** server-side.
- Clients store logs locally; reconnect yields empty logs.
- Log names are viewer-specific:
  - Only public/revealed identities appear.
  - Otherwise use "a card".

---

## 8) Reconnect / Resume

On client connect:
1) Client receives public Yjs snapshot.
2) Server sends a private overlay based on token.
3) Logs start empty.

PartySocket will reconnect automatically and can buffer intents while offline.

### 8.1 Room Lifecycle
- If a room has **no active connections**, it may be destroyed.
- Canonical state (public + hidden) must be persisted to storage so a fresh room can restore state on reconnect.
- Logs are not persisted and will be empty on new connections.

---

## 9) Feature Mapping (Comprehensive)

This section maps **every significant current feature** to the new architecture.

### 9.1 Players & Room
- **Join/leave**: server validates token and seat availability; updates public doc + logs.
- **Usernames**: `setName` intent; server updates public `players`.
- **Room lock/host**: server updates `roomMeta`; blocks new player joins.
- **Capacity**: enforced server-side.
- **Spectators**: token-based; receive overlays for hand + face-down battlefield, never library.

### 9.2 Zones
- **Battlefield/Graveyard/Exile/Commander**: public Yjs zones, full identity.
- **Hand**:
  - Public: slot IDs + count only.
  - Private: identity per slot via overlay.
  - Reveal-to-all attaches identity to slot in public state.
- **Library**:
  - Public: count only.
  - Private: ordered identities in server storage; only visible via explicit view.
- **Sideboard**: same privacy as library.

### 9.3 Cards (State)
- **Name/image/oracle/type**: public only if card is public or revealed-to-all.
- **Tapped/counters/rotation/position**: public on battlefield.
- **Controller**: public on battlefield; change via `card.controller.set` with log.
- **Custom text**: `card.customText.set` (text or null); public if card is public; hidden otherwise.
- **Face index / transform / flip**: public for public cards; hidden for face-down.

### 9.4 Face-Down / Morph
- Public shell exists on battlefield.
- Identity is hidden; only controller + spectators receive overlay.
- Morph display (2/2) still shown using public faceDownMode.
- Face-down reveals to other players are handled via `hiddenReveals`, delivered as private overlays (or `faceDownRevealsToAll` when revealed to all).

### 9.5 Transform / Flip / DFC
- Transform is a server intent; if card is public, everyone sees updated face.
- Flip is a server intent; if card is public, everyone sees updated face.
- If card is face-down, identity remains hidden.

### 9.6 Movement
- `move` intent handled by server; server validates permissions.
- Moving public → hand:
  - Creates new slot ID.
  - If card is known-to-all, server publishes identity in `handRevealsToAll`.
- Moving to library clears known info unless explicitly revealed.

### 9.7 Draw / Discard / Shuffle / Mulligan / Reset / Unload
- All are intents.
- Server mutates hidden library + hand order.
- Server updates public counts/slots.
- Shuffle/reset clears library reveals and top-card reveal.
- Logs emitted for all.

### 9.8 Reveal System
- **Reveal top card** (toggle self/all): server computes top from hidden library.
- **View top X**: server returns identities to owner only; reveal optional.
- **Reveal specific cards**: server publishes to all or to specific players.
- **Reveal lifetime**: persists until owner hides or shuffle/reset.

### 9.9 Library Viewer (Owner Only)
- Requires explicit intent to view.
- Server returns full ordered list (private overlay only).
- UI remains identical; public state unchanged.
- Owner can reorder viewed library cards via `library.moveCard` (top/bottom/index); server updates hidden order.

### 9.10 Tokens
- Create token intent.
- Server creates public card in battlefield.
- Remove token intent deletes token card.

### 9.11 Counters
- `card.counter.adjust` intent (delta +/-).
- Server validates controller + zone.
- Updates public card state.

### 9.12 Power/Toughness
- `card.pt.set` intent.
- Server validates controller + battlefield.
- Updates public card state.

### 9.13 Commander
- Commander zone public.
- `card.commander.set` intent (boolean).
- `player.commanderTax.adjust` intent (delta +/-).
- Commander flag/tax updates are server validated.
- Commander decklist sync remains local preference.

### 9.14 Selection / Reorder
- Hand reorder intent for owner.
- Public hand slot order updated; identities only by overlay/reveal.

### 9.15 Dice Roller
- Client picks random results, sends intent for logging.

### 9.16 Shortcuts
- Client-side; each shortcut dispatches the corresponding intent.

### 9.17 Logs
- All intents produce server log events.
- Client stores logs locally.

---

## 10) Server Enforcement

The server must:
- Reject any client-sent Yjs updates.
- Validate all intents against permissions.
- Emit a log for every state mutation.

---

## 11) Migration Phases

### Phase 0: Setup PartyKit
- Add PartyKit server scaffold
- Add PartySocket client

### Phase 1: Server-only writer
- Move current mutations behind intents
- Server writes public Yjs only
- Client stops writing Yjs
- Add optimistic prediction + reconciliation layer on client

### Phase 2: Hidden state extraction
- Move library/hand/face-down identity to PartyKit storage
- Replace public hand/library identities with counts + slot IDs
- Implement private overlays

### Phase 3: Logs
- [x] Remove shared Yjs logs
- [x] Server emits logs; clients store locally

### Phase 4: Harden
- Token gating
- Audit visibility

---

## 12) Simplifications & Removals (During Migration)
Target cleanups to reduce surface area and remove old behavior:
- Remove all **client-authored Yjs writes**; clients only send intents.
- Remove **public hand/library identities** from the shared doc (keep counts + slot IDs only).
- Remove **shared Yjs logs** and any UI code that reads logs from the doc.
- Remove or refactor **public `revealedTo` arrays**; replace with server overlays + reveal maps.
- Remove any **client-side access paths** to full library/hand data outside overlay responses.
- Remove legacy UI/actions that assume card identities are always available in hand/library.

---

## 13) Test Plan (New Behavior Only)
Write new tests that explicitly assert the new server-authoritative behavior:
- **Visibility**: players cannot see other hands/libraries/face-down identities; spectators can (except library).
- **Reveals**: to-all vs to-specific overlays; reveal lifetime until hide/shuffle/reset.
- **Library**: view, viewTopX, revealTop; `library.moveCard` order changes persist.
- **Movement**: moving public -> hand keeps identity only if known-to-all; moving to library hides identity.
- **Face-down**: owner/spectator overlays work; revealed viewers see preview/P/T.
- **Permissions**: server rejects invalid intents; client handles rejection rollback.
- **Logs**: server emits one log per mutation; logs are viewer-specific and ephemeral.
- **Reconnect**: public snapshot + overlays reconstructs client state.

Remove or rewrite tests that assert the **old client-authoritative behavior** (public hands/libraries, client-written logs, client-writable doc).

---

## 14) Open Questions
- Should spectator link be revocable/rotatable by host?

---

## 15) Compatibility Notes (Recent Changes)
- Face-down battlefield cards can be revealed to specific viewers, and revealed viewers should see full preview/P/T (current behavior from 2026-01-13 change).
- New architecture must preserve this by driving preview visibility from server-provided reveal grants/overlays rather than shared `revealedTo` arrays.

---

## 16) Appendix: Intent List (Draft)
- `player.join`
- `player.leave`
- `player.setName`
- `room.lock`
- `deck.load`
- `deck.unload`
- `deck.reset`
- `library.shuffle`
- `library.draw`
- `library.discard`
- `library.view`
- `library.viewTopX`
- `library.revealTop`
- `library.revealCards`
- `library.moveCard`
- `hand.reorder`
- `card.move`
- `card.controller.set`
- `card.tap`
- `card.pt.set`
- `card.transform`
- `card.flip`
- `card.faceDown`
- `card.counter.adjust`
- `card.customText.set`
- `card.commander.set`
- `token.create`
- `token.remove`
- `player.commanderTax.adjust`
- `dice.roll`

---

## 17) Appendix: PartyKit References
- PartyKit overview: https://www.partykit.io/
- PartySocket API: https://docs.partykit.io/reference/partysocket-api/
- Party.Server API: https://docs.partykit.io/reference/partyserver-api/
- y-partykit API: https://docs.partykit.io/reference/y-partykit-api/
- Hibernation limitations (Yjs): https://docs.partykit.io/guides/scaling-partykit-servers-with-hibernation/

---

## 18) Migration Audit (2026-01-15)
Findings from a codebase scan to verify the migration state:
- **Runtime Yjs writes:** none found in production paths. Client reads Yjs snapshots and applies them to the store; all mutations flow through intents.
- **Yjs mutation helpers:** no production imports of `apps/web/src/yjs/mutations/*`. They remain **legacy/test-only**.
- **Legacy isolation:** `apps/web/src/yjs/yMutations.ts` now exports **only** types + `sharedSnapshot`. Legacy helpers are re-exported in `apps/web/src/yjs/legacyMutations.ts` for tests.
- **Server authority:** server enforces intent-only writes and read-only Yjs sync connections (`readOnly: true` on y-partykit server). Token gating is validated on sync + intent connections.
- **Additional hardening:** server now rejects token creation outside battlefield and rejects client attempts to mutate server-managed card identity/visibility fields via `card.update`.

## 19) Cleanup Tasks (Remaining)
- [ ] Add a lint rule to forbid importing `@/yjs/legacyMutations` outside test files.
- [ ] Remove `apps/web/src/yjs/mutations/*` once legacy tests are deleted or moved to server-side equivalents.
- [ ] Remove the legacy mutation test suites (`apps/web/src/yjs/__tests__/yMutations.test.ts`, `apps/web/src/yjs/__tests__/meta.test.ts`) if we no longer want to maintain client-side Yjs mutation behavior.
- [ ] Consider relocating any remaining “legacy” mutation coverage to server-side tests that exercise intent application.
