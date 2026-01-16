# mtg monorepo

This repository now uses Bun workspaces with two apps:

- `apps/web`: TanStack React Start frontend (Cloudflare SSR).
- `apps/server`: PartyServer (wrangler + Durable Object for authoritative sync + intents).

## Usage

From the repo root:

```bash
bun install
bun run dev           # web app
bun run dev:server    # PartyServer (wrangler dev, defaults to localhost:8787)
```

Other helpful scripts:

- `bun run build` / `bun run preview` – build and preview the web app
- `bun run deploy:web` – deploy the web app worker via `wrangler`
- `bun run deploy:server` – deploy the PartyServer worker

Vite env vars now live in `apps/web/.env`. `VITE_WEBSOCKET_SERVER` is recommended for non-dev builds.
