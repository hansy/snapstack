# mtg monorepo

This repository now uses Bun workspaces with three apps:

- `apps/web`: TanStack React Start frontend (Cloudflare SSR).
- `apps/server`: PartyKit server (authoritative sync + intents).
- `apps/server2`: Cloudflare Durable Object WebSocket worker (legacy transport).

## Usage

From the repo root:

```bash
bun install
bun run dev           # web app
bun run dev:server    # PartyKit server
bun run dev:server2   # websocket worker (legacy)
```

Other helpful scripts:

- `bun run build` / `bun run preview` – build and preview the web app
- `bun run deploy:web` – deploy the web app worker via `wrangler`
- `bun run deploy:server` – deploy the PartyKit server
- `bun run deploy:server2` – deploy the Durable Object worker (legacy)
- `bun run ws:dev` – start the Durable Object worker from the web workspace

Vite env vars now live in `apps/web/.env`. `VITE_WEBSOCKET_SERVER` is recommended for non-dev builds.
