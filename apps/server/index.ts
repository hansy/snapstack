/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

interface Env {
  WEBSOCKET_SERVER: DurableObjectNamespace;
  PING_INTERVAL?: string;
}

// Worker: routes requests to appropriate Durable Objects
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "");

    // Yjs sync endpoint (existing)
    if (pathname.startsWith("/signal")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }
      const roomFromPath = pathname.startsWith("/signal/") ? pathname.slice("/signal/".length) : null;
      const room = roomFromPath || url.searchParams.get("room");
      if (!room) {
        return new Response("Missing room name", { status: 400 });
      }
      if (!UUID_REGEX.test(room)) {
        return new Response("Invalid room name", { status: 400 });
      }
      const id = env.WEBSOCKET_SERVER.idFromName(room);
      const stub = env.WEBSOCKET_SERVER.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

type RoomName = string;

const messageSync = 0;
const messageAwareness = 1;

const MAX_MESSAGE_BYTES = 512 * 1024; // allow larger initial sync payloads
const RATE_LIMIT_WINDOW_MS = 5_000;
const RATE_LIMIT_MAX_MESSAGES = 120;
const RATE_LIMIT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_PING_INTERVAL_MS = 30_000;
const EMPTY_ROOM_GRACE_MS = 60 * 60 * 1000; // 1 hour persistence after all players leave
const PERSIST_DEBOUNCE_MS = 1_000; // Debounce storage writes
const STORAGE_KEY_DOC = "yjs:doc";
const STORAGE_KEY_TIMESTAMP = "yjs:timestamp";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEBUG_SIGNAL = true;

// Durable Object implementing y-websocket style doc + awareness sync
export class SignalRoom extends DurableObject {
  conns: Set<WebSocket>;
  connClients: Map<WebSocket, Set<number>>;
  connMeta: Map<WebSocket, { userId: string; clientKey: string; sessionVersion: number }>;
  userToConn: Map<string, { ws: WebSocket; clientKey: string; sessionVersion: number }>;
  userToLastVersion: Map<string, number>;
  connStats: Map<WebSocket, {
    tokens: number;
    lastRefill: number;
    windowStart: number;
    bytes: number;
    lastMessage: number;
    heartbeat?: number;
  }>;
  awarenessOwners: Map<number, WebSocket>;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  env: Env;
  pingIntervalMs: number;
  idleTimeoutMs: number;
  emptyTimer: number | null;
  persistTimer: number | null;
  stateRestorePromise: Promise<void>;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.conns = new Set();
    this.connClients = new Map();
    this.connMeta = new Map();
    this.userToConn = new Map();
    this.userToLastVersion = new Map();
    this.connStats = new Map();
    this.awarenessOwners = new Map();
    const parsedPing = Number.parseInt(this.env.PING_INTERVAL ?? "", 10);
    this.pingIntervalMs = Number.isFinite(parsedPing) && parsedPing > 0 ? parsedPing : DEFAULT_PING_INTERVAL_MS;
    this.idleTimeoutMs = this.pingIntervalMs * 2;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.emptyTimer = null;
    this.persistTimer = null;
    // Restore state from storage on initialization - save promise so fetch() can await it
    this.stateRestorePromise = this.restoreFromStorage();
    this.setupDocListeners();
  }

  private async restoreFromStorage(): Promise<void> {
    try {
      const stored = await this.ctx.storage.get<ArrayBuffer>(STORAGE_KEY_DOC);
      const timestamp = await this.ctx.storage.get<number>(STORAGE_KEY_TIMESTAMP);
      
      if (stored && timestamp) {
        // Check if stored state is still within the grace period
        const age = Date.now() - timestamp;
        if (age < EMPTY_ROOM_GRACE_MS) {
          const update = new Uint8Array(stored);
          Y.applyUpdate(this.doc, update);
          this.dbg("restored from storage", { bytes: update.byteLength, ageMs: age });
        } else {
          // State expired, clear it
          await this.ctx.storage.delete(STORAGE_KEY_DOC);
          await this.ctx.storage.delete(STORAGE_KEY_TIMESTAMP);
          this.dbg("storage expired, cleared", { ageMs: age });
        }
      }
    } catch (err) {
      console.error("[signal] failed to restore from storage", err);
    }
  }

  private schedulePersist() {
    if (this.persistTimer !== null) return;
    this.persistTimer = setTimeout(async () => {
      this.persistTimer = null;
      try {
        const update = Y.encodeStateAsUpdate(this.doc);
        await this.ctx.storage.put(STORAGE_KEY_DOC, update.buffer);
        await this.ctx.storage.put(STORAGE_KEY_TIMESTAMP, Date.now());
        this.dbg("persisted to storage", { bytes: update.byteLength });
      } catch (err) {
        console.error("[signal] failed to persist to storage", err);
      }
    }, PERSIST_DEBOUNCE_MS) as unknown as number;
  }

  private dbg(...args: any[]) {
    if (!DEBUG_SIGNAL) return;
    try { console.log("[signal]", ...args); } catch (_err) {}
  }

  private setupDocListeners() {
    this.doc.on("update", (update) => {
      this.dbg("doc update bytes", update.byteLength, "conns", this.conns.size);
      // Broadcast doc updates to everyone (including origin) per y-websocket server behavior.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      this.broadcast(null, encoding.toUint8Array(encoder));
      // Persist to storage (debounced)
      this.schedulePersist();
    });

    this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: any) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      this.dbg("awareness update bytes", encoding.length(encoder), "clients", changedClients.length);
      this.broadcast(origin as WebSocket | null, encoding.toUint8Array(encoder));
    });
  }

  private resetStateIfEmpty() {
    if (this.conns.size > 0) return;
    if (this.emptyTimer !== null) return;
    this.emptyTimer = setTimeout(async () => {
      if (this.conns.size > 0) {
        this.emptyTimer = null;
        return;
      }
      // Clear persisted state
      try {
        await this.ctx.storage.delete(STORAGE_KEY_DOC);
        await this.ctx.storage.delete(STORAGE_KEY_TIMESTAMP);
        this.dbg("cleared storage on empty room timeout");
      } catch (err) {
        console.error("[signal] failed to clear storage", err);
      }
      // Cancel any pending persist
      if (this.persistTimer !== null) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
      try { this.doc.destroy(); } catch (_err) {}
      this.doc = new Y.Doc();
      this.awareness = new awarenessProtocol.Awareness(this.doc);
      this.connClients.clear();
      this.awarenessOwners.clear();
      this.connMeta.clear();
      this.userToConn.clear();
      this.userToLastVersion.clear();
      this.setupDocListeners();
      this.emptyTimer = null;
    }, EMPTY_ROOM_GRACE_MS) as unknown as number;
  }

  async fetch(request: Request): Promise<Response> {
    // Wait for storage restoration before handling any connections
    await this.stateRestorePromise;
    
    const { 0: client, 1: server } = new WebSocketPair();
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    const roomFromPath = pathname.startsWith("/signal/") ? pathname.slice("/signal/".length) : null;
    const room = roomFromPath || url.searchParams.get("room");
    if (!room) {
      return new Response("Missing room name", { status: 400 });
    }
    if (!UUID_REGEX.test(room)) {
      return new Response("Invalid room name", { status: 400 });
    }
    this.handleConnection(server, room, url.searchParams);
    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(origin: WebSocket | null, data: ArrayBuffer | Uint8Array) {
    this.conns.forEach(conn => {
      if (origin && conn === origin) return;
      try { conn.send(data); } catch (_err) { conn.close(); this.conns.delete(conn); }
    });
  }

  private handleConnection(ws: WebSocket, room: RoomName, params: URLSearchParams) {
    const userId = params.get("userId") || "";
    const clientKey = params.get("clientKey") || "";
    const sessionVersionRaw = params.get("sessionVersion") || "";
    const sessionVersion = Number.parseInt(sessionVersionRaw, 10);

    if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(clientKey) || !Number.isFinite(sessionVersion) || sessionVersion < 0) {
      this.dbg("reject handshake invalid", { room, userId, clientKey, sessionVersion });
      try { ws.close(1008, "invalid handshake"); } catch (_err) {}
      return;
    }

    const lastVersion = this.userToLastVersion.get(userId);
    if (lastVersion !== undefined && sessionVersion < lastVersion) {
      this.dbg("reject stale session", { room, userId, clientKey, sessionVersion, lastVersion });
      try { ws.close(4090, "stale session"); } catch (_err) {}
      return;
    }

    const existing = this.userToConn.get(userId);
    if (existing && existing.clientKey !== clientKey) {
      this.dbg("reject duplicate user different key", { room, userId, clientKey, existing: existing.clientKey });
      try { ws.close(4091, "user already connected"); } catch (_err) {}
      return;
    }
    if (existing && existing.clientKey === clientKey) {
      this.dbg("close existing same key before replace", { room, userId, clientKey });
      try { existing.ws.close(4001, "replaced connection"); } catch (_err) {}
    }

    ws.accept();
    let closed = false;
    // room name preserved for potential logging
    const _roomNameForLog: RoomName = room;
    void _roomNameForLog;

    this.conns.add(ws);
    this.connClients.set(ws, new Set());
    this.connMeta.set(ws, { userId, clientKey, sessionVersion });
    this.userToConn.set(userId, { ws, clientKey, sessionVersion });
    this.userToLastVersion.set(userId, sessionVersion);
    if (this.emptyTimer !== null) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
    }
    const snapPlayers = this.doc.getMap("players").size;
    const snapZones = this.doc.getMap("zones").size;
    const snapCards = this.doc.getMap("cards").size;
    const now = Date.now();
    const stats = {
      tokens: RATE_LIMIT_MAX_MESSAGES,
      lastRefill: now,
      windowStart: now,
      bytes: 0,
      lastMessage: now,
      heartbeat: undefined as number | undefined,
    };
    const heartbeat = setInterval(() => {
      const current = this.connStats.get(ws);
      if (!current) return;
      const idleFor = Date.now() - current.lastMessage;
      if (idleFor > this.idleTimeoutMs) {
        try { ws.close(1000, "idle timeout"); } catch (_err) {}
        clearInterval(heartbeat);
        this.connStats.delete(ws);
      }
    }, this.pingIntervalMs);
    stats.heartbeat = heartbeat as unknown as number;
    this.connStats.set(ws, stats);
      // console.log('[signal] joined room', currentRoom, 'size', this.conns.size);
    const stateSize = Y.encodeStateAsUpdate(this.doc).byteLength;
    this.dbg("accepted", { room, userId, clientKey, sessionVersion, connections: this.conns.size, stateSize, snapPlayers, snapZones, snapCards });

    ws.addEventListener("close", (evt: CloseEvent) => {
      closed = true;
      this.conns.delete(ws);
      const meta = this.connMeta.get(ws);
      if (meta) {
        const locked = this.userToConn.get(meta.userId);
        if (locked && locked.ws === ws) {
          this.userToConn.delete(meta.userId);
        }
      }
      const clientIds = this.connClients.get(ws);
      if (clientIds && clientIds.size > 0) {
        awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(clientIds), "disconnect");
        clientIds.forEach((id) => {
          const owner = this.awarenessOwners.get(id);
          if (owner === ws) this.awarenessOwners.delete(id);
        });
      }
      this.connClients.delete(ws);
      const stat = this.connStats.get(ws);
      if (stat?.heartbeat !== undefined) clearInterval(stat.heartbeat);
      this.connStats.delete(ws);
      this.connMeta.delete(ws);
      const code = (evt && typeof evt.code === "number") ? evt.code : undefined;
      const reason = (evt && typeof evt.reason === "string") ? evt.reason : undefined;
      // console.log('[signal] left room', currentRoom, 'size', this.conns.size);
      this.dbg("closed", { room, userId: meta?.userId, clientKey: meta?.clientKey, connections: this.conns.size, code, reason });
      this.resetStateIfEmpty();
    });

    ws.addEventListener("message", (evt) => {
      if (closed) return;
      const raw = evt.data;
      const data = raw instanceof ArrayBuffer ? new Uint8Array(raw) : typeof raw === "string" ? new TextEncoder().encode(raw) : new Uint8Array([]);
      this.dbg("recv bytes", data.byteLength, "from", userId);
      // console.log('[signal] msg', currentRoom, 'size', this.conns.size, 'type', typeof raw, 'len', raw instanceof ArrayBuffer ? raw.byteLength : (typeof raw === 'string' ? raw.length : 'n/a'));
      const size = data.byteLength;
      if (size > MAX_MESSAGE_BYTES) {
        try { ws.close(1009, "message too large"); } catch (_err) {}
        return;
      }

      if (!this.consumeRateLimit(ws, size)) {
        return;
      }

      const decoder = decoding.createDecoder(data);
      const encoder = encoding.createEncoder();
      let messageType: number;
      try {
        messageType = decoding.readVarUint(decoder);
      } catch (err) {
        console.warn("[signal] failed to decode message type", err);
        try { ws.close(1003, "decode error"); } catch (_err) {}
        return;
      }

      switch (messageType) {
        case messageSync: {
          try {
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);
          } catch (err) {
            console.warn("[signal] sync decode failed", err);
            try { ws.close(1003, "sync decode error"); } catch (_err) {}
            return;
          }
          if (encoding.length(encoder) > 1) {
            const resp = encoding.toUint8Array(encoder);
            this.dbg("send sync response bytes", resp.byteLength, "to", userId);
            try { ws.send(resp); } catch (_err) { ws.close(); }
          } else {
            this.dbg("empty sync response", { to: userId });
          }
          break;
        }
        case messageAwareness: {
          const update = decoding.readVarUint8Array(decoder);
          if (!update || update.length === 0) {
            break;
          }
          const clientIds = this.extractAwarenessClientIds(update);
          if (clientIds.length === 0) break;
          const set = this.connClients.get(ws);
          for (const clientId of clientIds) {
            const owner = this.awarenessOwners.get(clientId);
            // Reclaim if owner socket is gone; otherwise block hijack.
            if (owner && owner !== ws) {
              const ownerStats = this.connStats.get(owner);
              const idleFor = ownerStats ? (Date.now() - ownerStats.lastMessage) : Number.POSITIVE_INFINITY;
              if (!this.conns.has(owner) || idleFor > this.idleTimeoutMs) {
                this.awarenessOwners.set(clientId, ws);
              } else {
                return;
              }
            } else {
              this.awarenessOwners.set(clientId, ws);
            }
            if (set) set.add(clientId);
          }
          try {
            awarenessProtocol.applyAwarenessUpdate(this.awareness, update, ws);
          } catch (err) {
            console.error("[signal] awareness update failed", err);
          }
          break;
        }
        default:
          console.warn("[signal] unknown message type", messageType);
      }
    });

    // Initial sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    const step1 = encoding.toUint8Array(encoder);
    this.dbg("send sync step1 bytes", step1.byteLength, "to", userId);
    ws.send(step1);

    // Send current awareness states
    const awarenessStates = encoding.createEncoder();
    encoding.writeVarUint(awarenessStates, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessStates,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(this.awareness.getStates().keys()))
    );
    const aware = encoding.toUint8Array(awarenessStates);
    this.dbg("send awareness snapshot bytes", aware.byteLength, "to", userId);
    ws.send(aware);
  }

  private consumeRateLimit(ws: WebSocket, size: number) {
    const now = Date.now();
    const stats = this.connStats.get(ws);
    if (!stats) return true;

    const refillRate = RATE_LIMIT_MAX_MESSAGES / RATE_LIMIT_WINDOW_MS;
    const elapsed = now - stats.lastRefill;
    stats.tokens = Math.min(RATE_LIMIT_MAX_MESSAGES, stats.tokens + elapsed * refillRate);
    stats.lastRefill = now;

    if (stats.tokens < 1) {
      try { ws.close(1013, "rate limited"); } catch (_err) {}
      return false;
    }
    stats.tokens -= 1;

    if (now - stats.windowStart > RATE_LIMIT_WINDOW_MS) {
      stats.windowStart = now;
      stats.bytes = 0;
    }
    if (stats.bytes + size > RATE_LIMIT_MAX_BYTES) {
      try { ws.close(1009, "rate limited"); } catch (_err) {}
      return false;
    }
    stats.bytes += size;
    stats.lastMessage = now;
    return true;
  }

  private extractAwarenessClientIds(update: Uint8Array): number[] {
    const ids: number[] = [];
    try {
      const decoderUpdate = decoding.createDecoder(update);
      const len = decoding.readVarUint(decoderUpdate);
      for (let i = 0; i < len; i++) {
        const clientID = decoding.readVarUint(decoderUpdate);
        ids.push(clientID);
        try { decoding.readVarUint(decoderUpdate); } catch (_err) {} // clock
        try { decoding.readVarString(decoderUpdate); } catch (_err) {} // payload
      }
    } catch (err) {
      console.warn("[signal] awareness id decode failed", err);
    }
    return ids;
  }
}
