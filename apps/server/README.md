# Server

## What is this?
Snapstack's realtime backend, built on PartyServer and Cloudflare Durable Objects. It hosts the authoritative Yjs document for each room, applies intents, and manages hidden state. Path: `apps/server`.

## Responsibilities and boundaries
- Owns the authoritative Yjs state for a room and persists it in Durable Object storage.
- Applies intents and permission checks, and sends private overlays to viewers.
- Issues and validates player/spectator room tokens.
- **Does not** render UI or fetch Scryfall data; those are handled by `apps/web`.

## Public API
- PartyServer room name: `rooms` (see `src/server.ts` and `apps/web/src/partykit/config.ts`).
- Connection roles via query params: `role=sync` (Yjs provider) and `role=intent` (intent channel). Tokens are passed via `gt` (player) or `st` (spectator), along with optional `playerId` and `viewerRole` (see `apps/web/src/partykit/intentSocket.ts` and `apps/web/src/hooks/game/multiplayer-sync/sessionResources.ts`).
- Message envelopes: `intent`, `ack`, `privateOverlay`, `logEvent`, `roomTokens` (see `apps/web/src/partykit/messages.ts` and `src/domain/types.ts`).
- Non-Party requests return `404` (see `src/server.ts`).

## Local development
Run these from `apps/server` (or prefix with `bun run --cwd apps/server` from the repo root):

```bash
bun run dev
bun run build
bun run deploy
bun run test
bun run typecheck
```

## Configuration
- Durable Object binding `rooms` is defined in `wrangler.jsonc` and is required for local/dev/prod.
- Compatibility dates are set in `wrangler.jsonc` and `partykit.json`.
- Env vars: **TBD** (no `process.env` usage found; see `src/server.ts`).

## Key files
- [src/server.ts](src/server.ts)
- [src/domain/intents/applyIntentToDoc.ts](src/domain/intents/applyIntentToDoc.ts)
- [src/domain/hiddenState.ts](src/domain/hiddenState.ts)
- [src/domain/overlay.ts](src/domain/overlay.ts)
- [src/domain/permissions.ts](src/domain/permissions.ts)
- [wrangler.jsonc](wrangler.jsonc)
- [partykit.json](partykit.json)

## Tests
`bun run test` (Vitest).

## Related docs
- [../../README.md](../../README.md)
- [../web/README.md](../web/README.md)
