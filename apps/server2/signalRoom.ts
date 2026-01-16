/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

import type { Env } from "./env";
import {
  DEFAULT_PING_INTERVAL_MS,
  EMPTY_ROOM_GRACE_MS,
  MAX_MESSAGE_BYTES,
  messageAwareness,
  messageSync,
  PERSIST_DEBOUNCE_MS,
  RATE_LIMIT_MAX_BYTES,
  RATE_LIMIT_MAX_MESSAGES,
  RATE_LIMIT_WINDOW_MS,
  STORAGE_KEY_DOC,
  STORAGE_KEY_TIMESTAMP,
  resolveDebugSignal,
} from "./constants";
import { type HandshakeParams, isValidHandshake, parseHandshakeParams } from "./handshake";
import { getRoomFromUrl, isValidRoomName } from "./request";

type RoomName = string;
type ConnectionMeta = HandshakeParams;
type UserConnection = HandshakeParams & { ws: WebSocket };
type ConnectionStats = {
  tokens: number;
  lastRefill: number;
  windowStart: number;
  bytes: number;
  lastMessage: number;
  heartbeat?: number;
};

// Durable Object implementing y-websocket style doc + awareness sync
export class SignalRoom extends DurableObject {
  conns: Set<WebSocket>;
  connClients: Map<WebSocket, Set<number>>;
  connMeta: Map<WebSocket, ConnectionMeta>;
  userToConn: Map<string, UserConnection>;
  userToLastVersion: Map<string, number>;
  connStats: Map<WebSocket, ConnectionStats>;
  awarenessOwners: Map<number, WebSocket>;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  env: Env;
  pingIntervalMs: number;
  idleTimeoutMs: number;
  emptyTimer: number | null;
  persistTimer: number | null;
  stateRestorePromise: Promise<void>;
  debugSignalEnabled: boolean;

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
    this.pingIntervalMs =
      Number.isFinite(parsedPing) && parsedPing > 0
        ? parsedPing
        : DEFAULT_PING_INTERVAL_MS;
    this.idleTimeoutMs = this.pingIntervalMs * 2;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.emptyTimer = null;
    this.persistTimer = null;
    this.debugSignalEnabled = resolveDebugSignal(this.env);
    // Restore state from storage on initialization - save promise so fetch() can await it
    this.stateRestorePromise = this.restoreFromStorage();
    this.setupDocListeners();
  }

  private async restoreFromStorage(): Promise<void> {
    try {
      const stored = await this.ctx.storage.get<ArrayBuffer>(STORAGE_KEY_DOC);
      const timestamp =
        await this.ctx.storage.get<number>(STORAGE_KEY_TIMESTAMP);

      if (stored && timestamp) {
        // Check if stored state is still within the grace period
        const age = Date.now() - timestamp;
        if (age < EMPTY_ROOM_GRACE_MS) {
          const update = new Uint8Array(stored);
          Y.applyUpdate(this.doc, update);
          this.dbg("restored from storage", {
            bytes: update.byteLength,
            ageMs: age,
          });
        } else {
          // State expired, clear it
          await this.clearStoredState();
          this.dbg("storage expired, cleared", { ageMs: age });
        }
      }
    } catch (err) {
      console.error("[signal] failed to restore from storage", err);
    }
  }

  private async clearStoredState() {
    await this.ctx.storage.delete(STORAGE_KEY_DOC);
    await this.ctx.storage.delete(STORAGE_KEY_TIMESTAMP);
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
    if (!this.debugSignalEnabled) return;
    try {
      console.log("[signal]", ...args);
    } catch (_err) {}
  }

  private tryClose(ws: WebSocket, code?: number, reason?: string) {
    try {
      if (code === undefined) {
        ws.close();
      } else {
        ws.close(code, reason);
      }
    } catch (_err) {}
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

    this.awareness.on(
      "update",
      (
        {
          added,
          updated,
          removed,
        }: { added: number[]; updated: number[]; removed: number[] },
        origin: any
      ) => {
        const changedClients = added.concat(updated, removed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
        );
        this.dbg(
          "awareness update bytes",
          encoding.length(encoder),
          "clients",
          changedClients.length
        );
        this.broadcast(origin as WebSocket | null, encoding.toUint8Array(encoder));
      }
    );
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
        await this.clearStoredState();
        this.dbg("cleared storage on empty room timeout");
      } catch (err) {
        console.error("[signal] failed to clear storage", err);
      }
      // Cancel any pending persist
      if (this.persistTimer !== null) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
      this.resetInMemoryState();
      this.emptyTimer = null;
    }, EMPTY_ROOM_GRACE_MS) as unknown as number;
  }

  private resetInMemoryState() {
    try {
      this.doc.destroy();
    } catch (_err) {}
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.connClients.clear();
    this.awarenessOwners.clear();
    this.connMeta.clear();
    this.userToConn.clear();
    this.userToLastVersion.clear();
    this.setupDocListeners();
  }

  private validateHandshake(
    room: RoomName,
    ws: WebSocket,
    params: URLSearchParams
  ): ConnectionMeta | null {
    const meta = parseHandshakeParams(params);

    if (!isValidHandshake(meta)) {
      this.dbg("reject handshake invalid", {
        room,
        userId: meta.userId,
        clientKey: meta.clientKey,
        sessionVersion: meta.sessionVersion,
      });
      this.tryClose(ws, 1008, "invalid handshake");
      return null;
    }

    const { userId, clientKey, sessionVersion } = meta;
    const lastVersion = this.userToLastVersion.get(userId);
    if (lastVersion !== undefined && sessionVersion < lastVersion) {
      this.dbg("reject stale session", {
        room,
        userId,
        clientKey,
        sessionVersion,
        lastVersion,
      });
      this.tryClose(ws, 4090, "stale session");
      return null;
    }

    const existing = this.userToConn.get(userId);
    if (existing && existing.clientKey !== clientKey) {
      this.dbg("reject duplicate user different key", {
        room,
        userId,
        clientKey,
        existing: existing.clientKey,
      });
      this.tryClose(ws, 4091, "user already connected");
      return null;
    }
    if (existing && existing.clientKey === clientKey) {
      this.dbg("close existing same key before replace", {
        room,
        userId,
        clientKey,
      });
      this.tryClose(existing.ws, 4001, "replaced connection");
    }

    return meta;
  }

  private registerConnection(ws: WebSocket, meta: ConnectionMeta) {
    const { userId, clientKey, sessionVersion } = meta;
    this.conns.add(ws);
    this.connClients.set(ws, new Set());
    this.connMeta.set(ws, meta);
    this.userToConn.set(userId, { ws, userId, clientKey, sessionVersion });
    this.userToLastVersion.set(userId, sessionVersion);
    if (this.emptyTimer !== null) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
    }
  }

  private initConnectionStats(ws: WebSocket) {
    const now = Date.now();
    const stats: ConnectionStats = {
      tokens: RATE_LIMIT_MAX_MESSAGES,
      lastRefill: now,
      windowStart: now,
      bytes: 0,
      lastMessage: now,
      heartbeat: undefined,
    };
    const heartbeat = setInterval(() => {
      const current = this.connStats.get(ws);
      if (!current) return;
      const idleFor = Date.now() - current.lastMessage;
      if (idleFor > this.idleTimeoutMs) {
        this.tryClose(ws, 1000, "idle timeout");
        clearInterval(heartbeat);
        this.connStats.delete(ws);
      }
    }, this.pingIntervalMs);
    stats.heartbeat = heartbeat as unknown as number;
    this.connStats.set(ws, stats);
  }

  private sendInitialSync(ws: WebSocket, userId: string) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    const step1 = encoding.toUint8Array(encoder);
    this.dbg("send sync step1 bytes", step1.byteLength, "to", userId);
    ws.send(step1);
  }

  private sendAwarenessSnapshot(ws: WebSocket, userId: string) {
    const awarenessStates = encoding.createEncoder();
    encoding.writeVarUint(awarenessStates, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessStates,
      awarenessProtocol.encodeAwarenessUpdate(
        this.awareness,
        Array.from(this.awareness.getStates().keys())
      )
    );
    const aware = encoding.toUint8Array(awarenessStates);
    this.dbg("send awareness snapshot bytes", aware.byteLength, "to", userId);
    ws.send(aware);
  }

  private handleMessage(ws: WebSocket, userId: string, evt: MessageEvent) {
    const raw = evt.data;
    const data =
      raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : typeof raw === "string"
          ? new TextEncoder().encode(raw)
          : new Uint8Array([]);
    this.dbg("recv bytes", data.byteLength, "from", userId);
    // console.log('[signal] msg', currentRoom, 'size', this.conns.size, 'type', typeof raw, 'len', raw instanceof ArrayBuffer ? raw.byteLength : (typeof raw === 'string' ? raw.length : 'n/a'));
    const size = data.byteLength;
    if (size > MAX_MESSAGE_BYTES) {
      this.tryClose(ws, 1009, "message too large");
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
      this.tryClose(ws, 1003, "decode error");
      return;
    }

    switch (messageType) {
      case messageSync: {
        try {
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);
        } catch (err) {
          console.warn("[signal] sync decode failed", err);
          this.tryClose(ws, 1003, "sync decode error");
          return;
        }
        if (encoding.length(encoder) > 1) {
          const resp = encoding.toUint8Array(encoder);
          this.dbg("send sync response bytes", resp.byteLength, "to", userId);
          try {
            ws.send(resp);
          } catch (_err) {
            ws.close();
          }
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
            const idleFor = ownerStats
              ? Date.now() - ownerStats.lastMessage
              : Number.POSITIVE_INFINITY;
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
  }

  async fetch(request: Request): Promise<Response> {
    // Wait for storage restoration before handling any connections
    await this.stateRestorePromise;

    const { 0: client, 1: server } = new WebSocketPair();
    const url = new URL(request.url);
    const room = getRoomFromUrl(url);
    if (!room) {
      return new Response("Missing room name", { status: 400 });
    }
    if (!isValidRoomName(room)) {
      return new Response("Invalid room name", { status: 400 });
    }
    this.handleConnection(server, room, url.searchParams);
    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(origin: WebSocket | null, data: ArrayBuffer | Uint8Array) {
    this.conns.forEach((conn) => {
      if (origin && conn === origin) return;
      try {
        conn.send(data);
      } catch (_err) {
        conn.close();
        this.conns.delete(conn);
      }
    });
  }

  private handleConnection(ws: WebSocket, room: RoomName, params: URLSearchParams) {
    const meta = this.validateHandshake(room, ws, params);
    if (!meta) return;
    const { userId, clientKey, sessionVersion } = meta;

    ws.accept();
    let closed = false;
    // room name preserved for potential logging
    const _roomNameForLog: RoomName = room;
    void _roomNameForLog;

    this.registerConnection(ws, meta);
    const snapPlayers = this.doc.getMap("players").size;
    const snapZones = this.doc.getMap("zones").size;
    const snapCards = this.doc.getMap("cards").size;
    this.initConnectionStats(ws);
    // console.log('[signal] joined room', currentRoom, 'size', this.conns.size);
    const stateSize = Y.encodeStateAsUpdate(this.doc).byteLength;
    this.dbg("accepted", {
      room,
      userId,
      clientKey,
      sessionVersion,
      connections: this.conns.size,
      stateSize,
      snapPlayers,
      snapZones,
      snapCards,
    });

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
        awarenessProtocol.removeAwarenessStates(
          this.awareness,
          Array.from(clientIds),
          "disconnect"
        );
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
      const code = evt && typeof evt.code === "number" ? evt.code : undefined;
      const reason =
        evt && typeof evt.reason === "string" ? evt.reason : undefined;
      // console.log('[signal] left room', currentRoom, 'size', this.conns.size);
      this.dbg("closed", {
        room,
        userId: meta?.userId,
        clientKey: meta?.clientKey,
        connections: this.conns.size,
        code,
        reason,
      });
      this.resetStateIfEmpty();
    });

    ws.addEventListener("message", (evt) => {
      if (closed) return;
      this.handleMessage(ws, userId, evt);
    });

    this.sendInitialSync(ws, userId);
    this.sendAwarenessSnapshot(ws, userId);
  }

  private consumeRateLimit(ws: WebSocket, size: number) {
    const now = Date.now();
    const stats = this.connStats.get(ws);
    if (!stats) return true;

    const refillRate = RATE_LIMIT_MAX_MESSAGES / RATE_LIMIT_WINDOW_MS;
    const elapsed = now - stats.lastRefill;
    stats.tokens = Math.min(
      RATE_LIMIT_MAX_MESSAGES,
      stats.tokens + elapsed * refillRate
    );
    stats.lastRefill = now;

    if (stats.tokens < 1) {
      this.tryClose(ws, 1013, "rate limited");
      return false;
    }
    stats.tokens -= 1;

    if (now - stats.windowStart > RATE_LIMIT_WINDOW_MS) {
      stats.windowStart = now;
      stats.bytes = 0;
    }
    if (stats.bytes + size > RATE_LIMIT_MAX_BYTES) {
      this.tryClose(ws, 1009, "rate limited");
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
        try {
          decoding.readVarUint(decoderUpdate);
        } catch (_err) {} // clock
        try {
          decoding.readVarString(decoderUpdate);
        } catch (_err) {} // payload
      }
    } catch (err) {
      console.warn("[signal] awareness id decode failed", err);
    }
    return ids;
  }
}
