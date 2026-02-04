Sizing Refactor Plan (lg+ Only)

1. Goals
- Make the board layout fully derived from a sizing chain: seat height -> bottom bar percent -> battlefield height -> base card size -> side area width -> zone sizes.
- Apply the refactor only at lg and above (tablet/desktop). Below lg retains current sizing and behavior.
- Preserve all gameplay interactions: drag/snap, hover previews, overlays, and modal card grids.
- Maintain legibility: font sizes should rarely drop below 14px.

2. Scope
- In scope: board shell, seats, battlefield, hand, side zones, commander zone, card base size, hover previews, drag overlays, log drawer, sidenav, and all game-related modals/dialogs.
- Out of scope: mobile (< lg) layout changes, visual redesign unrelated to sizing, and server-side rules.

3. Decisions (Locked In)
- Breakpoint: lg and above only (min-width 1024px).
- lg detection: JS matchMedia("(min-width: 1024px)") as the source of truth; CSS @media uses the same breakpoint for any variable overrides.
- Bottom bar height baseline: 22% of seat height (user-resizable retained).
- Battlefield vertical fit target: 4 card heights.
- Side area width: based on card height (cards are landscape in side areas).
- All zones should be landscape.
- Exception: commander zone stays portrait.
- Base card height clamp: none for now (derived directly from battlefield height / 4).
- Modals should size to the base card size.
- Sidenav + log drawer can use clamp-based sizes.
- Minimum readable font size: ~14px.
- Hand resize bounds: 15% - 40% of seat height.
- Preview size: min = current preview width (200px), max = 2x min; use K = 1.6 as initial multiplier.
- Commander stack offset: 30% of base card height.
- Side area width: zone size + side area padding.
- Zone size: landscape card size + zone padding.
- Modal main area (horizontal layout): card preview size + modal padding.
- zonePadPx = 6 (derived from current side zone scale-90 against 120px width).
- sideAreaPadPx = 20 (derived from current sidebar width 160px - zone width 120px).
- modalPadPx = 24 (DialogContent default p-6).

4. Open Questions (Need confirmation)
- None for now.

5. Sizing Model (lg+)
- Definitions:
  - seatHeight: pixel height of the seat container.
  - bottomBarPct: 0.22 baseline.
  - battlefieldHeight: seatHeight - handHeight.
  - baseCardHeight: battlefieldHeight / 4 (before clamps).

- Proposed formula chain:
  - handHeight = clamp(seatHeight * bottomBarPct, seatHeight * 0.15, seatHeight * 0.40)
  - battlefieldHeight = seatHeight - handHeight
  - baseCardHeight = battlefieldHeight / 4

- Derived sizes (examples):
  - baseCardWidth = baseCardHeight * 2/3
  - landscapeCardWidth = baseCardHeight
  - landscapeCardHeight = baseCardHeight * 2/3
  - previewWidth = clamp(baseCardWidth * 1.6, 200, 400)
  - previewHeight = previewWidth / (2/3)
  - sideZoneWidth = landscapeCardWidth + (zonePadPx * 2)
  - sideZoneHeight = landscapeCardHeight + (zonePadPx * 2)
  - sideAreaWidth = sideZoneWidth + (sideAreaPadPx * 2)
  - cmdrStackOffset = baseCardHeight * 0.3
  - modalMainWidth = previewWidth + (modalPadPx * 2)
  - modalMaxWidth = min(90vw, modalMainWidth)
  - modalMaxHeight = min(90vh, previewHeight + (modalPadPx * 2))

6. Sizing Tokens (CSS variables)
- Global or seat-scoped variables (lg+ only):
  - --seat-h, --seat-w
  - --hand-h
  - --battlefield-h
  - --card-h, --card-w
  - --card-h-landscape, --card-w-landscape
  - --sidebar-w
  - --sidezone-w, --sidezone-h
  - --zone-pad
  - --sidearea-pad
  - --cmdr-offset
  - --preview-h
  - --modal-max-w, --modal-max-h
  - --modal-pad
  - --sidenav-w (clamp), --log-w (clamp)

7. Frontend Feature Inventory (Preserve)
- App shell + routing
  - Landing page background + orbit animation + hero CTA + resume card + footer links.
  - Username prompt screen (full-screen centered card).
  - Room full-screen states (room unavailable, full, invite required, etc.).
- Game board shell
  - Full-screen board with DnD context, connection status pill, and selection blocking of native context menu.
  - Grid layout for seats based on player count (single/split/quadrant).
  - Log drawer that slides in/out and auto-scrolls on new entries.
- Sidenav + menu
  - Fixed left action rail with icon tooltips.
  - Menu hover/expand with connection status + keyboard shortcuts entry + leave button.
  - Spectator mode variants (reduced actions).
- Seat + HUD
  - Seat scaling via transform/inverse size.
  - Life box with editable life, commander damage drawer, and username editing (self only).
  - Zone labels and counters; colored seat border glow.
- Battlefield
  - Free-form zone with card placement, grid overlay while dragging, ghost overlays, and selection rectangle.
  - Mouse wheel zoom (blocked by UI where needed) + keyboard zoom shortcuts.
  - Context menu on battlefield (create token, dice roller, etc.).
  - Placeholder name watermark.
- Hand + bottom bar
  - Resizable hand height with snap-to-default behavior.
  - Horizontal scroll, overlapping cards with hover expand, and drag-to-reorder.
  - Hand label with card count, top/bottom inversion, left/right alignment.
- Side zones (library/graveyard/exile)
  - Landscape card presentation, counters, hover tooltips, and context menu.
  - Library top reveal handling and opponent reveal indicator.
  - Double-click to draw (self), click to open zone viewer (graveyard/exile).
- Commander zone
  - Stack display, commander tax controls for owner, hover actions.
  - Portrait orientation exception (to preserve existing behavior).
- Cards (CardView)
  - Tap/rotate visuals, selection ring, owner color highlight, hover scale, drag visuals.
  - Face-down rendering rules and custom text overlay.
  - Counters, badges (commander), and P/T overlays.
- Card preview
  - Hover preview with delay on battlefield; immediate in hand/commander.
  - Lock-on-long-press, flip/transform preview, reveal icon display.
  - External P/T adjust controls for controller.
- Context menu system
  - Nested submenus, disabled reasons via tooltip, shortcuts display, and separator items.
- Drag-and-drop system
  - DnD Kit sensors, drag overlays, group dragging, ghost card positions, snap-to-grid, and drop highlighting.
  - Drag disable rules for spectators or invalid moves.
- Keyboard shortcuts
  - Global shortcut handling with UI-blocking rules, toggle shortcuts drawer, zoom, draw, shuffle, etc.
- Modals + dialogs
  - Zone viewer (filtering, grouped vs linear view, reorder, context menu, pinned cards).
  - Token creation (grid, filters, counts).
  - Load deck, Share room, Add counter, Coin flip, Dice roll, Number/Text prompt dialogs.
  - Opponent library reveals modal.
  - Shortcuts drawer.
  - Edit username dialog.

8. Detailed Task Plan (Trackable)

Status legend: not-started | in-progress | blocked | done

Epic E-01: Sizing Discovery and Spec
- T-001 (done): Inventory all sizing points and px usages across board, zones, previews, overlays, and modals.
  - Files: `apps/web/src/components/game/**`, `apps/web/src/components/username/**`, `apps/web/src/components/landing/**`, `apps/web/src/lib/constants.ts`, `apps/web/src/hooks/game/**`
  - Output: a checklist of fixed sizes and where they are used.
- T-002 (done): Finalize sizing formulas and clamp ranges for hand height, card height, preview sizes, modal max sizes.
- T-003 (done): Decide device class detection for lg (CSS media vs JS, Tailwind breakpoint value).

Epic E-01 Outputs
- T-001 inventory summary: base card/board constants in `packages/shared/src/constants/geometry.ts` and `apps/web/src/lib/constants.ts`; board shell and overlays in `apps/web/src/components/game/board/MultiplayerBoardView.tsx`; seat/sidebar/hand/commander in `apps/web/src/components/game/seat/SeatView.tsx`, `apps/web/src/components/game/seat/handSizing.ts`, `apps/web/src/components/game/seat/SideZone.tsx`, `apps/web/src/components/game/seat/CommanderZoneView.tsx`, `apps/web/src/components/game/seat/BottomBar.tsx`, `apps/web/src/components/game/seat/Hand.tsx`, `apps/web/src/components/game/player/LifeBoxView.tsx`; battlefield overlays in `apps/web/src/components/game/seat/BattlefieldGridOverlay.tsx` and `apps/web/src/components/game/seat/BattlefieldGhostOverlay.tsx`; card/face overlays in `apps/web/src/components/game/card/**`; preview sizing in `apps/web/src/components/game/card/CardPreview.tsx` and `apps/web/src/components/game/card/CardPreviewView.tsx`; modals/dialogs in `apps/web/src/components/game/**` (zone viewer, token creation, load deck, share room, add counter, coin/dice, prompts, opponent reveals, shortcuts); sidenav/log in `apps/web/src/components/game/sidenav/SidenavView.tsx` and `apps/web/src/components/game/log-drawer/LogDrawerView.tsx`; username + landing in `apps/web/src/components/username/**` and `apps/web/src/components/landing/**`.
- T-002 formulas/clamps: previewWidth clamp finalized to 200-400px using K=1.6; modal max sizes bounded by 90vw/90vh; hand height clamp remains 15%-40% of seat height; base card height remains unclamped (battlefieldHeight / 4).
- T-003 lg detection: JS matchMedia("(min-width: 1024px)") aligned with Tailwind lg.

Epic E-02: Sizing Foundation
- T-010 (done): Implement a seat sizing hook (ResizeObserver) that computes seat sizes and derived variables.
  - Proposed file: `apps/web/src/hooks/game/seat/useSeatSizing.ts`
  - Outputs: `handHeightPx`, `baseCardHeightPx`, `viewScale`, `sideAreaWidthPx`, `sideZoneDims`, `previewHeightPx`.
- T-011 (done): Apply CSS variables to the seat root in `SeatView` and expose computed scales to children.
  - Files: `apps/web/src/components/game/seat/SeatView.tsx`
- T-012 (done): Introduce lg-only gating for new sizing (CSS `@media (min-width: lg)` or JS check).
- T-013 (done): Add unit tests for sizing formula outputs and lg gating.
  - Files: new tests in `apps/web/src/hooks/game/seat/__tests__`
- T-014 (done): Finalize padding constants (zonePadPx, sideAreaPadPx, modalPadPx) and document them.

Epic E-03: Board + Seat Layout Conversion
- T-020 (done): Replace fixed sidebar width with `--sidebar-w`.
  - Files: `apps/web/src/components/game/seat/SeatView.tsx`
- T-021 (done): Replace fixed side zone sizes with landscape vars.
  - Files: `apps/web/src/components/game/seat/SideZone.tsx`
- T-022 (done): Update commander zone sizing (portrait) with proportional offsets.
  - Files: `apps/web/src/components/game/seat/CommanderZoneView.tsx`
- T-023 (done): Update hand container to use `--hand-h` and responsive min/max.
  - Files: `apps/web/src/components/game/seat/BottomBar.tsx`, `apps/web/src/components/game/seat/handSizing.ts`
- T-024 (done): Adjust life box and HUD sizes to use card-based vars (avoid <14px text).
  - Files: `apps/web/src/components/game/player/LifeBoxView.tsx`
- T-025 (done): Update component tests/snapshots affected by seat sizing changes.
  - Files: `apps/web/src/components/game/seat/__tests__/**`, `apps/web/src/components/game/player/__tests__/**`

Epic E-04: Card Size + Battlefield Math
- T-030 (done): Replace card base classes to use `--card-h` and `--card-w` at lg+.
  - Files: `apps/web/src/lib/constants.ts`, `apps/web/src/components/game/card/CardView.tsx`
- T-031 (done): Update battlefield viewScale, grid, snapping, and ghost overlays to match new base card size.
  - Files: `apps/web/src/components/game/seat/Battlefield.tsx`, `apps/web/src/lib/positions.ts`, `packages/shared/src/positions.ts`
- T-032 (done): Update drag overlay sizing in `MultiplayerBoardView` to use computed base card sizes.
  - Files: `apps/web/src/components/game/board/MultiplayerBoardView.tsx`
- T-033 (done): Update math-related tests (positions, DnD, battlefield collision) for new sizing inputs.
  - Files: `apps/web/src/lib/__tests__/positions.unit.test.ts`, `apps/web/src/lib/__tests__/battlefieldCollision.unit.test.ts`, `apps/web/src/lib/__tests__/dndBattlefield.unit.test.ts`

Epic E-05: Previews, Overlays, and Hover
- T-040 (done): Set hover/locked preview sizes based on base card size with clamps.
  - Files: `apps/web/src/components/game/card/CardPreview.tsx`
- T-041 (done): Ensure preview positioning avoids clipping at lg sizes (edge-aware padding).
  - Files: `apps/web/src/components/game/card/CardPreview.tsx`
- T-042 (done): Update preview-related tests to assert sizing/clamping behavior.
  - Files: `apps/web/src/components/game/card/__tests__/CardPreview.component.test.tsx`

Epic E-06: Modals and Dialogs
- T-050 (not-started): Zone Viewer modal dimensions + card sizes tied to base card size.
  - Files: `apps/web/src/components/game/zone-viewer/ZoneViewerModalView.tsx`, `apps/web/src/components/game/zone-viewer/ZoneViewerLinearView.tsx`
- T-051 (not-started): Token creation modal grid + card tiles tied to base card size.
  - Files: `apps/web/src/components/game/token-creation/TokenCreationModalView.tsx`
- T-052 (not-started): Load deck modal sizing tied to base card size.
  - Files: `apps/web/src/components/game/load-deck/LoadDeckModalView.tsx`
- T-053 (not-started): Share room modal sizing tied to base card size.
  - Files: `apps/web/src/components/game/share/ShareRoomDialog.tsx`
- T-054 (not-started): Add counter modal sizing tied to base card size.
  - Files: `apps/web/src/components/game/add-counter/AddCounterModalView.tsx`
- T-055 (not-started): Coin/Dice dialogs sizing tied to base card size.
  - Files: `apps/web/src/components/game/coin/CoinFlipDialog.tsx`, `apps/web/src/components/game/dice/DiceRollDialog.tsx`
- T-056 (not-started): Prompt dialogs sizing tied to base card size.
  - Files: `apps/web/src/components/game/prompts/NumberPromptDialog.tsx`, `apps/web/src/components/game/prompts/TextPromptDialog.tsx`
- T-057 (not-started): Opponent library reveals modal sizing tied to base card size.
  - Files: `apps/web/src/components/game/opponent-library-reveals/OpponentLibraryRevealsModalView.tsx`
- T-058 (not-started): Shortcuts drawer sizing and layout tied to base card size.
  - Files: `apps/web/src/components/game/shortcuts/ShortcutsDrawer.tsx`
- T-059 (not-started): Edit username and other non-game dialogs sized via base card tokens.
  - Files: `apps/web/src/components/username/EditUsernameDialog.tsx`
- T-060 (not-started): Update modal/dialog tests affected by sizing changes.
  - Files: `apps/web/src/components/game/zone-viewer/__tests__/**`, `apps/web/src/components/game/opponent-library-reveals/__tests__/**`, `apps/web/src/components/username/__tests__/**`

Epic E-07: Global UI + Shell
- T-070 (not-started): Replace `pl-12` board padding with CSS grid and `--sidenav-w` alignment.
  - Files: `apps/web/src/components/game/board/MultiplayerBoardView.tsx`, `apps/web/src/components/game/sidenav/SidenavView.tsx`
- T-071 (not-started): Log drawer width uses `--log-w` with clamp (lg+).
  - Files: `apps/web/src/components/game/log-drawer/LogDrawerView.tsx`
- T-072 (not-started): Use dynamic viewport units (dvh/dvw) for full-screen root to avoid iPad issues.
  - Files: `apps/web/src/components/game/board/MultiplayerBoardView.tsx`
- T-073 (not-started): Update board shell tests/snapshots affected by layout changes.
  - Files: `apps/web/src/components/game/seat/__tests__/BottomBar.component.test.tsx`, `apps/web/src/components/game/board/__tests__/**`

Manual QA Checklist (lg+)
- Landscape/portrait, split/quadrant layouts.
- Log drawer open/closed, sidenav open/hover.
- Zoom controls and wheel zoom, keyboard zoom shortcuts.
- Drag/snap, group drag, ghost overlays, selection rectangle.
- Hover previews (delayed/immediate), locked previews, flip/transform.
- Modals with large card counts (Zone Viewer, Token Creation, Opponent Reveals).

9. Acceptance Criteria
- For lg+ viewports, all board sizes are derived from seat height and the sizing chain.
- Card size, zones, previews, and modal contents scale proportionally and stay aligned with drag/snap math.
- No UI text appears smaller than 14px (except intentionally tiny labels).
- Below lg, existing behavior is unchanged.

10. Next Steps (Blocking)
- Approve sizing ratios (sideAreaRatio, sideZoneRatio, cmdr offsets, modal scale).
