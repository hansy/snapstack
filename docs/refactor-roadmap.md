# Refactor Roadmap (mtg)

## Scope
- Reviewed source under apps/web and apps/server2.
- Ignored generated and vendor artifacts (node_modules, dist, .wrangler, routeTree.gen.ts).

## Findings (ranked, most -> least critical)

1. Critical: Duplicate keyboard zoom handlers lead to double zoom steps and inconsistent blocking.
   - Files: apps/web/src/hooks/game/shortcuts/useGameShortcuts.ts, apps/web/src/hooks/game/board/useBattlefieldZoomControls.ts, apps/web/src/models/game/shortcuts/gameShortcuts.ts
   - Impact: Pressing + or - can apply two zoom updates in one keypress.
   - Fix: Centralize keyboard handling so only one listener owns zoom shortcuts.

2. High: Room player limits are duplicated and can drift.
   - Files: apps/web/src/lib/room.ts, apps/web/src/yjs/sanitizeLimits.ts, apps/web/src/store/gameStore/actions/room.ts, apps/web/src/hooks/game/board/useMultiplayerBoardController.ts
   - Impact: UI and Yjs sanitization can disagree on capacity if one value changes.
   - Fix: Define a single MAX_PLAYERS constant and import it from both layers.

3. High: Server debug logging is always enabled.
   - Files: apps/server2/constants.ts, apps/server2/signalRoom.ts
   - Impact: Log spam and potential leakage of room metadata in production.
   - Fix: Gate debug logs behind an env flag and default to off.

4. High: Battlefield selection and drag paths are monolithic and O(n) per pointer move.
   - Files: apps/web/src/components/game/seat/Battlefield.tsx, apps/web/src/hooks/game/dnd/useGameDnD.ts
   - Impact: Drag/selection can degrade with large battlefields; logic is hard to change safely.
   - Fix: Extract selection logic to a hook, cache card bounds, throttle via requestAnimationFrame.

5. Medium: Multiplayer sync orchestration remains large and side-effect heavy.
   - Files: apps/web/src/hooks/game/multiplayer-sync/useMultiplayerSync.ts, apps/web/src/hooks/game/board/useMultiplayerBoardController.ts
   - Impact: Hard to test lifecycle edge cases and reconnection behavior.
   - Fix: Split into smaller modules (session lifecycle, provider events, awareness, store hydration).

6. Medium: SignalRoom mixes handshake, rate limiting, persistence, and awareness.
   - Files: apps/server2/signalRoom.ts
   - Impact: High regression risk and limited test coverage for protocol changes.
   - Fix: Extract helpers for handshake validation, rate limiting, awareness updates, persistence.

7. Medium: Context menu blocks on related card fetch; TODO still present.
   - Files: apps/web/src/hooks/game/context-menu/useGameContextMenu.ts, apps/web/src/models/game/context-menu/menu/cardActions/relatedParts.ts, apps/web/src/hooks/game/context-menu/relatedParts.ts
   - Impact: Context menu feels laggy and can fail silently on slow network.
   - Fix: Open menu immediately and hydrate related items asynchronously.

8. Medium: Deck import fetch does not rate-limit requests.
   - Files: apps/web/src/services/deck-import/fetchScryfallCards.ts, apps/web/src/services/scryfall/cache/scryfallApi.ts
   - Impact: Large imports can hit Scryfall rate limits and fail.
   - Fix: Add rate limiting or reuse the cache batching logic.

9. Low: Player ordering and color logic is duplicated.
   - Files: apps/web/src/hooks/game/player/usePlayerLayout.ts, apps/web/src/lib/playerColors.ts, apps/web/src/hooks/game/board/useMultiplayerBoardController.ts
   - Impact: Risk of drift in seat order vs color order over time.
   - Fix: Centralize ordering in resolveOrderedPlayerIds and reuse everywhere.

10. Low: Log payloads are untyped.
    - Files: apps/web/src/logging/logStore.ts, apps/web/src/components/game/log-drawer/LogDrawerView.tsx, apps/web/src/logging/eventRegistry.ts
    - Impact: Runtime assumptions in log rendering, weak IDE support.
    - Fix: Introduce a LogEventPayloadMap and typed log entry model.

11. Low: Card preview does not recompute position on resize/scroll.
    - Files: apps/web/src/components/game/card/CardPreview.tsx
    - Impact: Preview can drift on window resize or scroll.
    - Fix: Add resize/scroll listeners or use a positioning hook.

12. Low: Legacy constants and magic numbers remain.
    - Files: apps/web/src/lib/constants.ts, apps/web/src/hooks/game/board/useBoardScale.ts
    - Impact: Harder to reason about sizing changes.
    - Fix: Remove legacy aliases and centralize base sizes.

## Refactor Plan

### Phase 0 - Correctness and safety
- [x] Unify keyboard zoom handling so only one listener processes +/-. Add a regression test for single-step zoom.
- [x] Centralize MAX_PLAYERS and update all imports.
- [x] Make DEBUG_SIGNAL env-driven and default it to false in production builds.

### Phase 1 - Sync and server modularity
- [x] Split useMultiplayerSync into smaller modules (session lifecycle, provider events, awareness, store hydration).
- [x] Split useMultiplayerBoardController into smaller hooks (room state, modal state, action dispatchers).
- [x] Break SignalRoom into focused helpers (handshake, rate limiter, awareness, persistence) and add tests.

### Phase 2 - Battlefield and drag performance
- [x] Extract selection rectangle logic from Battlefield into a dedicated hook.
- [x] Cache card bounds for hit testing and throttle selection updates with requestAnimationFrame.
- [x] Extract ghost overlay and grid overlay into separate components to reduce re-render surface.

### Phase 3 - Menu and Scryfall workflows
- [x] Open context menus immediately and hydrate related parts asynchronously.
- [x] Replace the related parts TODO by calling useScryfallCard or cache utilities.
- [x] Add rate limiting / backoff to deck import fetch paths.

### Phase 4 - DRY, types, and cleanup
- [x] Split apps/web/src/types/index.ts into smaller domain modules.
- [x] Add typed log payloads and a log view model to remove payload as any.
- [x] Deduplicate player ordering and color resolution.
- [x] Improve useScryfallCards dependency tracking and dedupe input IDs.
- [x] Remove legacy constants and replace magic sizing values with shared constants.
- [x] Recompute card preview positioning on resize and scroll.

## Suggested tests
- Keyboard zoom should step once per key press and respect UI blocking.
- Multiplayer sync join blocked, reconnection, and cleanup sequences.
- SignalRoom rate limiting, invalid handshake, and awareness ownership handling.
- Battlefield selection rectangle selects expected cards under drag.
