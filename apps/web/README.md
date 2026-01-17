# Web App

## What is this?
Snapstack's web client, built with TanStack React Start and Vite. It renders the multiplayer board UI, manages client-side state, and connects to the realtime PartyServer. Path: `apps/web`.

## Responsibilities and boundaries
- Owns the UI, routing, and client-side stores (`src/store`, `src/components`, `src/routes`).
- Manages client sync setup (Yjs provider + intent socket) and local overlays.
- Fetches card data from Scryfall and caches it locally.
- **Does not** apply authoritative game rules or permissions; that happens in `apps/server`.

## Public API
- Routes: `/` and `/game/$sessionId` (see `src/routes`).
- Invite tokens are accepted via query params `gt` (player) and `st` (spectator) on the game route (see `src/lib/partyKitToken.ts`).
- PartyServer message types used by the client are defined in `src/partykit/messages.ts`.

## Local development
Run these from `apps/web` (or prefix with `bun run --cwd apps/web` from the repo root):

```bash
bun run dev
bun run build
bun run preview
bun run test
bun run typecheck
bun run cf-typegen
bun run deploy
```

## Configuration
- `VITE_WEBSOCKET_SERVER`: optional override for the PartyServer host (host or full URL). In dev, the client falls back to `localhost:8787` when unset. See `src/hooks/game/multiplayer-sync/sessionResources.ts` and `src/lib/partyKitHost.ts`.
- Cloudflare env values for deploy live in `wrangler.jsonc`.
- `.env*` files are loaded by Vite from this directory if you create them (none are checked in). If more env vars are added later, search for `import.meta.env`.

## Key files
- [src/routes/index.tsx](src/routes/index.tsx)
- [src/routes/game.$sessionId.tsx](src/routes/game.$sessionId.tsx)
- [src/components/game/board/MultiplayerBoardView.tsx](src/components/game/board/MultiplayerBoardView.tsx)
- [src/hooks/game/multiplayer-sync/sessionResources.ts](src/hooks/game/multiplayer-sync/sessionResources.ts)
- [src/store/gameStore.ts](src/store/gameStore.ts)
- [src/services/deck-import/](src/services/deck-import/)
- [src/services/scryfall/scryfallCache.ts](src/services/scryfall/scryfallCache.ts)
- [src/partykit/messages.ts](src/partykit/messages.ts)

## Tests
`bun run test` (Vitest; config in `vitest.config.ts`).

## Related docs
- [../../README.md](../../README.md)
- [../server/README.md](../server/README.md)
