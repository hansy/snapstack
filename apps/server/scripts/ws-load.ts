const config = {
  url: "ws://localhost:8787/parties/rooms/bench",
  connections: 20,
  messages: 5,
  timeoutMs: 15000,
  windowMs: 2000,
  libraryCards: 40,
  mix: "coin.flip,library.view,card.tap,dice.roll",
  room: "bench",
};

const readArg = (name: string) => {
  const idx = process.argv.findIndex((arg) => arg === `--${name}`);
  if (idx === -1) return null;
  const raw = process.argv[idx + 1];
  if (!raw || raw.startsWith("--")) return null;
  return raw;
};

const hasArg = (name: string) => process.argv.includes(`--${name}`);

const readNumber = (name: string, fallback: number) => {
  const raw = readArg(name);
  if (!raw) return fallback;
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
};

const baseUrl = readArg("url") ?? config.url;
const connections = readNumber("connections", config.connections);
const messagesPerConnection = readNumber("messages", config.messages);
const timeoutMs = readNumber("timeoutMs", config.timeoutMs);
const windowMs = readNumber("windowMs", config.windowMs);
const libraryCards = readNumber("libraryCards", config.libraryCards);
const room = readArg("room") ?? config.room;
const mix = (readArg("mix") ?? config.mix)
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const perfMetricsRaw = readArg("perfMetrics");
const perfMetrics =
  perfMetricsRaw === "1" ||
  perfMetricsRaw === "true" ||
  (perfMetricsRaw === null && hasArg("perfMetrics"));
const perfMetricsIntervalMs = readArg("perfMetricsIntervalMs");

const percentile = (values: number[], pct: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
  return sorted[idx] ?? 0;
};

const formatMs = (value: number) => `${value.toFixed(2)} ms`;

const resolveRoomUrl = (raw: string, nextRoom: string) => {
  const url = new URL(raw);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 3) {
    parts[parts.length - 1] = nextRoom;
  }
  url.pathname = `/${parts.join("/")}`;
  return url.toString();
};

const roomUrl = resolveRoomUrl(baseUrl, room);

const decodeMessage = (data: unknown): string | null => {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data as ArrayBufferView);
  }
  if (data && typeof (data as { toString?: () => string }).toString === "function") {
    return (data as { toString: () => string }).toString();
  }
  return null;
};

const waitForMessage = <T>(ws: WebSocket, predicate: (payload: any) => payload is T) => {
  return new Promise<T>((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const text = decodeMessage(event.data);
      if (!text) return;
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (predicate(parsed)) {
        ws.removeEventListener("message", onMessage);
        clearTimeout(timer);
        resolve(parsed);
      }
    };
    ws.addEventListener("message", onMessage);
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error("timeout waiting for message"));
    }, timeoutMs);
    ws.addEventListener(
      "close",
      () => {
        clearTimeout(timer);
      },
      { once: true }
    );
  });
};

const getPlayerToken = async () => {
  const url = new URL(roomUrl);
  url.searchParams.set("role", "intent");
  url.searchParams.set("playerId", "p1");
  if (perfMetrics) {
    url.searchParams.set("perfMetrics", "1");
    if (perfMetricsIntervalMs) {
      url.searchParams.set("perfMetricsIntervalMs", perfMetricsIntervalMs);
    }
  }
  const ws = new WebSocket(url.toString());

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("socket error")), { once: true });
  });

  const payload = await waitForMessage<{ type: string; payload?: any }>(
    ws,
    (msg: any): msg is { type: string; payload?: any } => msg && msg.type === "roomTokens"
  );

  const playerToken = payload?.payload?.playerToken as string | undefined;
  if (!playerToken) {
    ws.close();
    throw new Error("missing player token");
  }
  ws.close();
  return playerToken;
};

const sendIntent = (ws: WebSocket, intent: Record<string, unknown>) => {
  const intentId = String(intent.id ?? crypto.randomUUID());
  const payload = { type: "intent", intent: { ...intent, id: intentId } };
  return new Promise<void>((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const text = decodeMessage(event.data);
      if (!text) return;
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (!parsed || parsed.type !== "ack" || parsed.intentId !== intentId) return;
      ws.removeEventListener("message", onMessage);
      if (parsed.ok) {
        resolve();
      } else {
        reject(new Error(parsed.error ?? "intent failed"));
      }
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify(payload));
  });
};

const setupRoom = async (playerToken: string) => {
  const url = new URL(roomUrl);
  url.searchParams.set("role", "intent");
  url.searchParams.set("playerId", "p1");
  url.searchParams.set("gt", playerToken);
  if (perfMetrics) {
    url.searchParams.set("perfMetrics", "1");
    if (perfMetricsIntervalMs) {
      url.searchParams.set("perfMetricsIntervalMs", perfMetricsIntervalMs);
    }
  }
  const ws = new WebSocket(url.toString());

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("socket error")), { once: true });
  });

  await waitForMessage<{ type: string }>(
    ws,
    (msg: any): msg is { type: string } => msg && msg.type === "roomTokens"
  );

  const player = {
    id: "p1",
    name: "Load Player",
    life: 20,
    counters: [],
    commanderDamage: {},
    commanderTax: 0,
  };

  await sendIntent(ws, {
    id: "setup-player",
    type: "player.join",
    payload: { actorId: "p1", player },
  });

  await sendIntent(ws, {
    id: "setup-zone-library",
    type: "zone.add",
    payload: { actorId: "p1", zone: { id: "library-p1", type: "library", ownerId: "p1", cardIds: [] } },
  });

  await sendIntent(ws, {
    id: "setup-zone-hand",
    type: "zone.add",
    payload: { actorId: "p1", zone: { id: "hand-p1", type: "hand", ownerId: "p1", cardIds: [] } },
  });

  await sendIntent(ws, {
    id: "setup-zone-battlefield",
    type: "zone.add",
    payload: { actorId: "p1", zone: { id: "battlefield-p1", type: "battlefield", ownerId: "p1", cardIds: [] } },
  });

  await sendIntent(ws, {
    id: "setup-zone-graveyard",
    type: "zone.add",
    payload: { actorId: "p1", zone: { id: "graveyard-p1", type: "graveyard", ownerId: "p1", cardIds: [] } },
  });

  await sendIntent(ws, {
    id: "setup-card-battlefield",
    type: "card.add",
    payload: {
      actorId: "p1",
      card: {
        id: "bf-1",
        name: "Benchmark Card",
        ownerId: "p1",
        controllerId: "p1",
        zoneId: "battlefield-p1",
        tapped: false,
        faceDown: false,
        position: { x: 0.5, y: 0.5 },
        rotation: 0,
        counters: [],
      },
    },
  });

  for (let i = 0; i < libraryCards; i += 1) {
    await sendIntent(ws, {
      id: `setup-card-lib-${i}`,
      type: "card.add",
      payload: {
        actorId: "p1",
        card: {
          id: `lib-${i}`,
          name: `Library ${i}`,
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "library-p1",
          tapped: false,
          faceDown: false,
          position: { x: 0.5, y: 0.5 },
          rotation: 0,
          counters: [],
        },
      },
    });
  }

  ws.close();
};

const run = async () => {
  const playerToken = await getPlayerToken();
  await setupRoom(playerToken);
  const latencies: number[] = [];
  const sockets: WebSocket[] = [];

  const connectionPromises = Array.from({ length: connections }, async (_, index) => {
    const url = new URL(roomUrl);
    url.searchParams.set("role", "intent");
    url.searchParams.set("playerId", "p1");
    url.searchParams.set("gt", playerToken);
    if (perfMetrics) {
      url.searchParams.set("perfMetrics", "1");
      if (perfMetricsIntervalMs) {
        url.searchParams.set("perfMetricsIntervalMs", perfMetricsIntervalMs);
      }
    }

    const ws = new WebSocket(url.toString());
    sockets.push(ws);

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("socket error")), { once: true });
    });

    await waitForMessage<{ type: string }>(
      ws,
      (msg: any): msg is { type: string } => msg && msg.type === "roomTokens"
    );

    const pending = new Map<string, number>();
    ws.addEventListener("message", (event) => {
      const text = decodeMessage(event.data);
      if (!text) return;
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (!parsed || parsed.type !== "ack") return;
      const sentAt = pending.get(parsed.intentId);
      if (typeof sentAt !== "number") return;
      pending.delete(parsed.intentId);
      latencies.push(performance.now() - sentAt);
    });

    for (let i = 0; i < messagesPerConnection; i += 1) {
      const intentId = `intent-${index}-${i}`;
      const mixIndex = mix.length ? (i + index) % mix.length : 0;
      const intentType = mix.length ? mix[mixIndex] : "coin.flip";
      let intentPayload: Record<string, unknown>;

      switch (intentType) {
        case "library.view":
          intentPayload = { actorId: "p1", playerId: "p1", count: 7 };
          break;
        case "library.draw":
          intentPayload = { actorId: "p1", playerId: "p1", count: 1 };
          break;
        case "card.move": {
          const toZoneId = i % 2 === 0 ? "graveyard-p1" : "battlefield-p1";
          intentPayload = { actorId: "p1", cardId: "bf-1", toZoneId };
          break;
        }
        case "card.tap":
          intentPayload = { actorId: "p1", cardId: "bf-1", tapped: i % 2 === 0 };
          break;
        case "dice.roll":
          intentPayload = { actorId: "p1", sides: 6, count: 1, results: [3] };
          break;
        case "coin.flip":
        default:
          intentPayload = { actorId: "p1", count: 1, results: ["heads"] };
          break;
      }

      pending.set(intentId, performance.now());
      ws.send(
        JSON.stringify({
          type: "intent",
          intent: {
            id: intentId,
            type: intentType,
            payload: intentPayload,
          },
        })
      );
    }
  });

  await Promise.race([
    Promise.all(connectionPromises),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
  ]);

  await new Promise((resolve) => setTimeout(resolve, windowMs));
  sockets.forEach((socket) => {
    try {
      socket.close();
    } catch {
      // ignore close errors
    }
  });

  if (latencies.length === 0) {
    throw new Error("no ack latencies recorded");
  }

  const avg = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  console.log("ws load results");
  console.log(`url: ${roomUrl}`);
  console.log(`room: ${room}`);
  console.log(`connections: ${connections}, messages/connection: ${messagesPerConnection}`);
  console.log(`mix: ${mix.length ? mix.join(", ") : "coin.flip"}`);
  console.log(`samples: ${latencies.length}`);
  console.log(`avg: ${formatMs(avg)}`);
  console.log(`p50: ${formatMs(p50)}`);
  console.log(`p95: ${formatMs(p95)}`);
  console.log(`p99: ${formatMs(p99)}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
