# Cloudflare WebSocket Worker (Durable Object)

- Dev: `wrangler dev --config server/wrangler.jsonc`
- Deploy: `wrangler deploy --config server/wrangler.jsonc`
- Endpoint: `wss://<worker-domain>/signal?room=<roomName>` (or `/websocket`; defaults to `room=default`)
- Behavior: echoes messages back to the sender and broadcasts to all other clients connected to the same `room` Durable Object instance.
- Durable Object binding: `WEBSOCKET_SERVER` → class `SignalRoom`.
