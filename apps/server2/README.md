# Cloudflare WebSocket Worker (Durable Object)

Legacy transport. The PartyKit server now lives in `apps/server`.

Run commands from `apps/server2`:

- Dev: `wrangler dev --config wrangler.jsonc`
- Deploy: `wrangler deploy --config wrangler.jsonc`
- Endpoint: `wss://<worker-domain>/signal/<sessionId>` (or `?room=<sessionId>`, where `sessionId` is a UUIDv4)
- Behavior: y-websocket compatible Yjs doc + awareness relay, backed by a per-room Durable Object.
- Durable Object binding: `WEBSOCKET_SERVER` → class `SignalRoom`.
