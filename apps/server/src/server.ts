import {
  routePartykitRequest,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";

import type { Card } from "../../web/src/types/cards";

import {
  HIDDEN_STATE_CARDS_PREFIX,
  HIDDEN_STATE_KEY,
  HIDDEN_STATE_META_KEY,
  ROOM_TOKENS_KEY,
} from "./domain/constants";
import type {
  HiddenState,
  HiddenStateMeta,
  Intent,
  IntentConnectionState,
  RoomTokens,
  Snapshot,
} from "./domain/types";
import { applyIntentToDoc } from "./domain/intents/applyIntentToDoc";
import {
  buildOverlayForViewer,
  buildOverlayZoneLookup,
} from "./domain/overlay";
import {
  chunkHiddenCards,
  createEmptyHiddenState,
  migrateHiddenStateFromSnapshot,
  normalizeHiddenState,
} from "./domain/hiddenState";
import {
  buildSnapshot,
  clearYMap,
  getMaps,
  isRecord,
  syncPlayerOrder,
} from "./domain/yjsStore";

const INTENT_ROLE = "intent";
const EMPTY_ROOM_GRACE_MS = 30_000;
const ROOM_TEARDOWN_CLOSE_CODE = 1013;
const Y_DOC_STORAGE_KEY = "yjs:doc";
const HIDDEN_STATE_PERSIST_DEBOUNCE_MS = 250;
const HIDDEN_STATE_CLEANUP_INTERVAL_MS = 10 * 60_000;
const PERF_METRICS_INTERVAL_MS = 30_000;
const PERF_METRICS_MIN_INTERVAL_MS = 5_000;
const PERF_METRICS_MAX_INTERVAL_MS = 300_000;

export type Env = {
  rooms: DurableObjectNamespace;
  PERF_METRICS?: string;
  PERF_METRICS_INTERVAL_MS?: string;
  PERF_METRICS_ALLOW_PARAM?: string;
};

export { applyIntentToDoc } from "./domain/intents/applyIntentToDoc";
export { buildOverlayForViewer } from "./domain/overlay";
export { createEmptyHiddenState } from "./domain/hiddenState";

const isNetworkConnectionLost = (error: unknown) => {
  if (!error) return false;
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : "";
  return (
    message.trim().replace(/\.$/, "").toLowerCase() ===
    "network connection lost"
  );
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return (
        (await routePartykitRequest(request, env)) ??
        new Response("Not Found", { status: 404 })
      );
    } catch (error) {
      const isWsUpgrade =
        request.headers.get("Upgrade")?.toLowerCase() === "websocket";
      if (isWsUpgrade && isNetworkConnectionLost(error)) {
        return new Response("Client Closed", { status: 499 });
      }
      throw error;
    }
  },
};

export class Room extends YServer<Env> {
  private intentConnections = new Set<Connection>();
  private hiddenState: HiddenState | null = null;
  private roomTokens: RoomTokens | null = null;
  private libraryViews = new Map<
    string,
    { playerId: string; count?: number }
  >();
  private overlaySummaries = new Map<
    string,
    { cardCount: number; cardsWithArt: number }
  >();
  private connectionRoles = new Map<Connection, "player" | "spectator">();
  private pendingPlayerConnections = 0;
  private emptyRoomTimer: number | null = null;
  private teardownGeneration = 0;
  private resetGeneration = 0;
  private teardownInProgress = false;
  private hiddenStatePersistTimer: number | null = null;
  private hiddenStatePersistInFlight: Promise<void> | null = null;
  private hiddenStatePersistQueued: {
    resetGeneration: number;
    connId?: string | null;
  } | null = null;
  private lastHiddenStateCleanupAt = 0;
  private lastPerfMetricsAt = 0;
  private perfMetricsEnabledFlag = false;
  private perfMetricsIntervalMs = PERF_METRICS_INTERVAL_MS;
  private perfMetricsTimer: number | null = null;

  async onLoad() {
    const stored = await this.ctx.storage.get<ArrayBuffer>(Y_DOC_STORAGE_KEY);
    if (!stored) return;
    try {
      Y.applyUpdate(this.document, new Uint8Array(stored));
    } catch (err: any) {
      console.error("[party] failed to load yjs state", {
        room: this.name,
        error: err?.message ?? String(err),
      });
    }
  }

  async onSave() {
    try {
      const update = Y.encodeStateAsUpdate(this.document);
      await this.ctx.storage.put(Y_DOC_STORAGE_KEY, update.buffer);
    } catch (err: any) {
      console.error("[party] failed to save yjs state", {
        room: this.name,
        error: err?.message ?? String(err),
      });
    }
  }

  onMessage(conn: Connection, message: WSMessage) {
    if (this.intentConnections.has(conn)) {
      return;
    }
    return super.onMessage(conn, message);
  }

  onError(conn: Connection, error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error);
    const normalized = message.trim().replace(/\.$/, "").toLowerCase();
    if (normalized === "network connection lost") {
      return;
    }
    return super.onError(conn, error);
  }

  isReadOnly(): boolean {
    return true;
  }

  private async ensureHiddenState(doc: Y.Doc) {
    if (this.hiddenState) return this.hiddenState;
    const storedMeta = await this.ctx.storage.get<HiddenStateMeta>(
      HIDDEN_STATE_META_KEY
    );
    if (storedMeta) {
      const cards: Record<string, Card> = {};
      const chunkKeys = Array.isArray(storedMeta.cardChunkKeys)
        ? storedMeta.cardChunkKeys
        : [];
      for (const key of chunkKeys) {
        const chunk = await this.ctx.storage.get<Record<string, Card>>(key);
        if (chunk && isRecord(chunk)) {
          Object.assign(cards, chunk as Record<string, Card>);
        }
      }
      const { cardChunkKeys: _keys, ...rest } = storedMeta;
      this.hiddenState = normalizeHiddenState({ ...rest, cards });
      return this.hiddenState;
    }

    const stored = await this.ctx.storage.get<HiddenState>(HIDDEN_STATE_KEY);
    if (stored) {
      this.hiddenState = normalizeHiddenState(stored);
      return this.hiddenState;
    }
    let migrated: HiddenState | null = null;
    doc.transact(() => {
      migrated = migrateHiddenStateFromSnapshot(getMaps(doc));
    });
    this.hiddenState = migrated ?? createEmptyHiddenState();
    await this.persistHiddenState();
    return this.hiddenState;
  }

  private shouldPersistHiddenState(expectedResetGeneration?: number) {
    if (this.teardownInProgress) return false;
    if (
      typeof expectedResetGeneration === "number" &&
      expectedResetGeneration !== this.resetGeneration
    ) {
      return false;
    }
    return true;
  }

  private async persistHiddenState(expectedResetGeneration?: number) {
    if (!this.hiddenState) return;
    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    const { cards, ...rest } = this.hiddenState;
    const chunks = chunkHiddenCards(cards);
    const writeId = crypto.randomUUID();
    const chunkKeys = chunks.map(
      (_chunk, index) => `${HIDDEN_STATE_CARDS_PREFIX}${writeId}:${index}`
    );

    for (let index = 0; index < chunks.length; index += 1) {
      if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
      const key = chunkKeys[index];
      await this.ctx.storage.put(key, chunks[index]);
    }

    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    const prevMeta = await this.ctx.storage.get<HiddenStateMeta>(
      HIDDEN_STATE_META_KEY
    );

    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    const nextMeta: HiddenStateMeta = {
      ...rest,
      cardChunkKeys: chunkKeys,
    };
    await this.ctx.storage.put(HIDDEN_STATE_META_KEY, nextMeta);

    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    if (prevMeta?.cardChunkKeys?.length) {
      for (const key of prevMeta.cardChunkKeys) {
        if (!chunkKeys.includes(key)) {
          if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
          try {
            await this.ctx.storage.delete(key);
          } catch (_err) {}
        }
      }
    }

    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    await this.maybeCleanupHiddenStateChunks(nextMeta, expectedResetGeneration);

    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    try {
      await this.ctx.storage.delete(HIDDEN_STATE_KEY);
    } catch (_err) {}
  }

  private async maybeCleanupHiddenStateChunks(
    meta: HiddenStateMeta,
    expectedResetGeneration?: number
  ) {
    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    const now = Date.now();
    if (now - this.lastHiddenStateCleanupAt < HIDDEN_STATE_CLEANUP_INTERVAL_MS)
      return;
    this.lastHiddenStateCleanupAt = now;
    if (!Array.isArray(meta.cardChunkKeys)) return;

    const storage = this.ctx.storage as unknown as {
      list?: () => Promise<
        Map<string, unknown> | Iterable<[string, unknown]> | string[]
      >;
      delete?: (key: string) => Promise<void>;
    };
    if (
      typeof storage.list !== "function" ||
      typeof storage.delete !== "function"
    )
      return;

    let listed: Map<string, unknown> | Iterable<[string, unknown]> | string[];
    try {
      listed = await storage.list();
    } catch (_err) {
      return;
    }

    const allowed = new Set(meta.cardChunkKeys);
    const orphanKeys: string[] = [];
    const recordKey = (key: string) => {
      if (!key.startsWith(HIDDEN_STATE_CARDS_PREFIX)) return;
      if (allowed.has(key)) return;
      orphanKeys.push(key);
    };

    if (Array.isArray(listed)) {
      listed.forEach((key) => {
        if (typeof key === "string") recordKey(key);
      });
    } else if (listed instanceof Map) {
      listed.forEach((_value, key) => {
        if (typeof key === "string") recordKey(key);
      });
    } else if (Symbol.iterator in Object(listed)) {
      for (const entry of listed as Iterable<[string, unknown]>) {
        if (entry && typeof entry[0] === "string") recordKey(entry[0]);
      }
    }

    for (const key of orphanKeys) {
      if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
      try {
        await storage.delete(key);
      } catch (_err) {}
    }
  }

  private async loadRoomTokens(): Promise<RoomTokens | null> {
    if (this.roomTokens) return this.roomTokens;
    const stored = await this.ctx.storage.get<RoomTokens>(ROOM_TOKENS_KEY);
    if (
      stored &&
      typeof stored.playerToken === "string" &&
      typeof stored.spectatorToken === "string"
    ) {
      this.roomTokens = stored;
      return stored;
    }
    return null;
  }

  private async ensureRoomTokens(): Promise<RoomTokens> {
    const existing = await this.loadRoomTokens();
    if (existing) return existing;
    const generated = {
      playerToken: crypto.randomUUID(),
      spectatorToken: crypto.randomUUID(),
    };
    this.roomTokens = generated;
    await this.ctx.storage.put(ROOM_TOKENS_KEY, generated);
    return generated;
  }

  private sendRoomTokens(
    conn: Connection,
    tokens: RoomTokens,
    viewerRole: "player" | "spectator"
  ) {
    const payload =
      viewerRole === "player"
        ? tokens
        : { spectatorToken: tokens.spectatorToken };
    try {
      conn.send(JSON.stringify({ type: "roomTokens", payload }));
    } catch (_err) {}
  }

  private hasPlayerConnections(): boolean {
    if (this.pendingPlayerConnections > 0) return true;
    for (const role of this.connectionRoles.values()) {
      if (role === "player") return true;
    }
    return false;
  }

  private clearEmptyRoomTimer() {
    if (this.emptyRoomTimer !== null) {
      clearTimeout(this.emptyRoomTimer);
      this.emptyRoomTimer = null;
    }
  }

  private clearHiddenStatePersistTimer() {
    if (this.hiddenStatePersistTimer !== null) {
      clearTimeout(this.hiddenStatePersistTimer);
      this.hiddenStatePersistTimer = null;
    }
    this.hiddenStatePersistQueued = null;
  }

  private clearPerfMetricsTimer() {
    if (this.perfMetricsTimer !== null) {
      clearInterval(this.perfMetricsTimer);
      this.perfMetricsTimer = null;
    }
  }

  private scheduleHiddenStatePersist(
    expectedResetGeneration: number,
    connId?: string
  ) {
    if (!this.hiddenState) return;
    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    if (this.hiddenStatePersistTimer !== null) {
      clearTimeout(this.hiddenStatePersistTimer);
    }
    const scheduledGeneration = expectedResetGeneration;
    const scheduledConnId = connId ?? null;
    this.hiddenStatePersistTimer = setTimeout(() => {
      this.hiddenStatePersistTimer = null;
      this.enqueueHiddenStatePersist(scheduledGeneration, scheduledConnId);
    }, HIDDEN_STATE_PERSIST_DEBOUNCE_MS) as unknown as number;
    this.maybeLogPerfMetrics("hidden-state-change");
  }

  private enqueueHiddenStatePersist(
    expectedResetGeneration: number,
    connId?: string | null
  ) {
    if (this.hiddenStatePersistInFlight) {
      this.hiddenStatePersistQueued = {
        resetGeneration: expectedResetGeneration,
        connId: connId ?? null,
      };
      return;
    }
    this.hiddenStatePersistInFlight = this.flushHiddenStatePersist(
      expectedResetGeneration,
      connId
    ).finally(() => {
      this.hiddenStatePersistInFlight = null;
      const queued = this.hiddenStatePersistQueued;
      this.hiddenStatePersistQueued = null;
      if (queued && this.shouldPersistHiddenState(queued.resetGeneration)) {
        this.enqueueHiddenStatePersist(
          queued.resetGeneration,
          queued.connId ?? null
        );
      }
    });
  }

  private async flushHiddenStatePersist(
    expectedResetGeneration?: number,
    connId?: string | null
  ) {
    try {
      await this.persistHiddenState(expectedResetGeneration);
    } catch (err: any) {
      let hiddenSize: number | null = null;
      try {
        hiddenSize = JSON.stringify(this.hiddenState ?? {}).length;
      } catch (_err) {
        hiddenSize = null;
      }
      console.error("[party] hidden state persist failed", {
        room: this.name,
        connId: connId ?? undefined,
        error: err?.message ?? String(err),
        hiddenSize,
      });
    }
  }

  private perfMetricsEnabled(): boolean {
    const flag = (this.env as Env | undefined)?.PERF_METRICS;
    return flag === "1" || flag === "true" || this.perfMetricsEnabledFlag;
  }

  private perfMetricsParamsAllowed(): boolean {
    const flag = (this.env as Env | undefined)?.PERF_METRICS_ALLOW_PARAM;
    return flag === "1" || flag === "true";
  }

  private clampPerfMetricsInterval(value: number) {
    const min = PERF_METRICS_MIN_INTERVAL_MS;
    const max = PERF_METRICS_MAX_INTERVAL_MS;
    return Math.min(max, Math.max(min, Math.floor(value)));
  }

  private capturePerfMetricsFlag(url: URL) {
    const allowParams = this.perfMetricsParamsAllowed();
    if (allowParams) {
      const param = url.searchParams.get("perfMetrics");
      if (param === "1" || param === "true") {
        this.perfMetricsEnabledFlag = true;
      }
    }
    const intervalParam = allowParams
      ? url.searchParams.get("perfMetricsIntervalMs")
      : null;
    const envInterval = (this.env as Env | undefined)?.PERF_METRICS_INTERVAL_MS;
    const rawInterval = intervalParam ?? envInterval ?? null;
    if (rawInterval) {
      const parsed = Number(rawInterval);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.perfMetricsIntervalMs = this.clampPerfMetricsInterval(parsed);
      }
    }
    this.ensurePerfMetricsTimer();
  }

  private ensurePerfMetricsTimer() {
    if (!this.perfMetricsEnabled()) return;
    if (this.perfMetricsTimer !== null) return;
    this.perfMetricsTimer = setInterval(() => {
      this.logPerfMetrics("interval");
    }, this.perfMetricsIntervalMs) as unknown as number;
    this.logPerfMetrics("interval");
  }

  private logPerfMetrics(reason: string) {
    if (!this.perfMetricsEnabled()) return;
    const now = Date.now();
    this.lastPerfMetricsAt = now;

    const maps = getMaps(this.document);
    const hidden = this.hiddenState;
    const countRecord = (record: Record<string, unknown>) =>
      Object.keys(record).length;
    const countOrderTotal = (record: Record<string, string[]>) => {
      let total = 0;
      for (const key in record) {
        const list = record[key];
        if (Array.isArray(list)) total += list.length;
      }
      return total;
    };

    const metrics = {
      ts: now,
      timestamp: new Date(now).toISOString(),
      intervalMs: this.perfMetricsIntervalMs,
      room: this.name,
      reason,
      connections: this.connectionRoles.size,
      intentConnections: this.intentConnections.size,
      overlays: this.overlaySummaries.size,
      libraryViews: this.libraryViews.size,
      yjs: {
        players: maps.players.size,
        zones: maps.zones.size,
        cards: maps.cards.size,
        zoneCardOrders: maps.zoneCardOrders.size,
        handRevealsToAll: maps.handRevealsToAll.size,
        libraryRevealsToAll: maps.libraryRevealsToAll.size,
        faceDownRevealsToAll: maps.faceDownRevealsToAll.size,
        playerOrder: maps.playerOrder.length,
      },
      hidden: hidden
        ? {
            cards: countRecord(hidden.cards),
            handPlayers: countRecord(hidden.handOrder),
            handCards: countOrderTotal(hidden.handOrder),
            libraryPlayers: countRecord(hidden.libraryOrder),
            libraryCards: countOrderTotal(hidden.libraryOrder),
            sideboardPlayers: countRecord(hidden.sideboardOrder),
            sideboardCards: countOrderTotal(hidden.sideboardOrder),
            faceDownBattlefield: countRecord(hidden.faceDownBattlefield),
            handReveals: countRecord(hidden.handReveals),
            libraryReveals: countRecord(hidden.libraryReveals),
            faceDownReveals: countRecord(hidden.faceDownReveals),
          }
        : null,
    };

    console.log("[perf] room metrics", metrics);
  }

  private maybeLogPerfMetrics(reason: string) {
    if (!this.perfMetricsEnabled()) return;
    const now = Date.now();
    if (now - this.lastPerfMetricsAt < this.perfMetricsIntervalMs) return;
    this.logPerfMetrics(reason);
  }

  private beginPendingPlayerConnection() {
    this.pendingPlayerConnections += 1;
    this.clearEmptyRoomTimer();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.pendingPlayerConnections = Math.max(
        0,
        this.pendingPlayerConnections - 1
      );
      this.scheduleEmptyRoomTeardown();
    };
  }

  private scheduleEmptyRoomTeardown() {
    if (this.teardownInProgress) return;
    if (this.hasPlayerConnections()) {
      this.clearEmptyRoomTimer();
      return;
    }
    if (this.emptyRoomTimer !== null) return;
    const generation = this.teardownGeneration;
    this.emptyRoomTimer = setTimeout(() => {
      this.emptyRoomTimer = null;
      void this.teardownRoomIfEmpty(generation);
    }, EMPTY_ROOM_GRACE_MS) as unknown as number;
  }

  private registerConnection(conn: Connection, role: "player" | "spectator") {
    this.connectionRoles.set(conn, role);
    if (role === "player") {
      this.teardownGeneration += 1;
      this.clearEmptyRoomTimer();
    }
    this.scheduleEmptyRoomTeardown();
  }

  private unregisterConnection(conn: Connection) {
    this.connectionRoles.delete(conn);
    this.scheduleEmptyRoomTeardown();
    if (this.connectionRoles.size === 0) {
      this.clearPerfMetricsTimer();
    }
  }

  private async clearRoomStorage() {
    const storage = this.ctx.storage as unknown as {
      deleteAll?: () => Promise<void>;
      list?: () => Promise<
        Map<string, unknown> | Iterable<[string, unknown]> | string[]
      >;
      delete?: (key: string) => Promise<void>;
    };
    if (typeof storage.deleteAll === "function") {
      await storage.deleteAll();
      return;
    }
    if (
      typeof storage.list !== "function" ||
      typeof storage.delete !== "function"
    )
      return;
    const listed = await storage.list();
    const keys: string[] = [];
    if (Array.isArray(listed)) {
      listed.forEach((key) => {
        if (typeof key === "string") keys.push(key);
      });
    } else if (listed instanceof Map) {
      listed.forEach((_value, key) => {
        if (typeof key === "string") keys.push(key);
      });
    } else if (Symbol.iterator in Object(listed)) {
      for (const entry of listed as Iterable<[string, unknown]>) {
        if (entry && typeof entry[0] === "string") keys.push(entry[0]);
      }
    }
    await Promise.all(keys.map((key) => storage.delete!(key)));
  }

  private clearPublicState(doc: Y.Doc) {
    doc.transact(() => {
      const maps = getMaps(doc);
      clearYMap(maps.players);
      clearYMap(maps.zones);
      clearYMap(maps.cards);
      clearYMap(maps.zoneCardOrders);
      clearYMap(maps.globalCounters);
      clearYMap(maps.battlefieldViewScale);
      clearYMap(maps.meta);
      clearYMap(maps.handRevealsToAll);
      clearYMap(maps.libraryRevealsToAll);
      clearYMap(maps.faceDownRevealsToAll);
      syncPlayerOrder(maps.playerOrder, []);
    });
  }

  private async teardownRoomIfEmpty(expectedGeneration: number) {
    if (this.teardownInProgress) return;
    if (expectedGeneration !== this.teardownGeneration) return;
    if (this.hasPlayerConnections()) return;

    this.teardownInProgress = true;
    this.clearHiddenStatePersistTimer();
    this.clearPerfMetricsTimer();
    this.resetGeneration += 1;
    try {
      const connections = Array.from(this.connectionRoles.keys());
      this.connectionRoles.clear();
      for (const connection of connections) {
        try {
          connection.close(ROOM_TEARDOWN_CLOSE_CODE, "room reset");
        } catch (_err) {}
      }

      this.hiddenState = null;
      this.roomTokens = null;
      this.libraryViews.clear();
      this.overlaySummaries.clear();

      try {
        this.clearPublicState(this.document);
      } catch (_err) {}

      try {
        await this.clearRoomStorage();
      } catch (_err) {}
    } finally {
      this.teardownInProgress = false;
    }
  }

  onConnect(conn: Connection, ctx: ConnectionContext) {
    if (this.teardownInProgress) {
      try {
        conn.close(ROOM_TEARDOWN_CLOSE_CODE, "room reset");
      } catch (_err) {}
      return;
    }
    const url = new URL(ctx.request.url);
    const role = url.searchParams.get("role");
    if (role === INTENT_ROLE) {
      void this.bindIntentConnection(conn, url);
      return;
    }
    void this.bindSyncConnection(conn, url, ctx);
  }

  private async bindIntentConnection(conn: Connection, url: URL) {
    this.intentConnections.add(conn);
    const state = parseConnectionParams(url);
    let connectionClosed = false;
    let connectionRegistered = false;
    let resolvedRole: "player" | "spectator" | undefined;
    let resolvedPlayerId: string | undefined;
    conn.addEventListener("close", () => {
      connectionClosed = true;
      this.intentConnections.delete(conn);
      this.libraryViews.delete(conn.id);
      this.overlaySummaries.delete(conn.id);
      if (!connectionRegistered) return;
      this.unregisterConnection(conn);
      console.warn("[party] intent connection closed", {
        room: this.name,
        connId: conn.id,
        playerId: resolvedPlayerId,
        viewerRole: resolvedRole,
      });
    });
    const rejectConnection = (reason: string) => {
      this.intentConnections.delete(conn);
      this.libraryViews.delete(conn.id);
      this.overlaySummaries.delete(conn.id);
      try {
        conn.close(1008, reason);
      } catch (_err) {}
    };

    const storedTokens = await this.loadRoomTokens();
    let activeTokens = storedTokens;
    const providedToken = state.token;

    if (!providedToken) {
      if (storedTokens) {
        rejectConnection("missing token");
        return;
      }
      if (state.viewerRole === "spectator") {
        rejectConnection("missing token");
        return;
      }
      if (!state.playerId) {
        rejectConnection("missing player");
        return;
      }
      activeTokens = await this.ensureRoomTokens();
    } else {
      activeTokens = activeTokens ?? (await this.ensureRoomTokens());
      if (
        providedToken !== activeTokens.playerToken &&
        providedToken !== activeTokens.spectatorToken
      ) {
        rejectConnection("invalid token");
        return;
      }
    }

    const requestedRole = state.viewerRole;
    const tokenRole =
      providedToken && activeTokens?.spectatorToken === providedToken
        ? "spectator"
        : "player";
    resolvedRole =
      tokenRole === "spectator" || requestedRole === "spectator"
        ? "spectator"
        : "player";
    resolvedPlayerId =
      resolvedRole === "spectator" ? undefined : state.playerId;
    if (resolvedRole === "player" && !resolvedPlayerId) {
      rejectConnection("missing player");
      return;
    }

    if (connectionClosed) return;
    this.capturePerfMetricsFlag(url);
    conn.setState({
      playerId: resolvedPlayerId,
      viewerRole: resolvedRole,
      token: providedToken ?? activeTokens?.playerToken,
    });
    this.registerConnection(conn, resolvedRole);
    connectionRegistered = true;
    console.info("[party] intent connection established", {
      room: this.name,
      connId: conn.id,
      playerId: resolvedPlayerId,
      viewerRole: resolvedRole,
      hasToken: Boolean(providedToken ?? activeTokens?.playerToken),
    });

    if (activeTokens) {
      this.sendRoomTokens(conn, activeTokens, resolvedRole);
    }

    void this.sendOverlayForConnection(conn);

    conn.addEventListener("message", (event) => {
      const raw = event.data;
      if (typeof raw !== "string") return;

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch (_err) {
        return;
      }

      if (!parsed || parsed.type !== "intent") return;
      const intent = parsed.intent as Intent | undefined;
      if (!intent || typeof intent.id !== "string") return;

      void this.handleIntent(conn, intent);
    });
  }

  private async bindSyncConnection(
    conn: Connection,
    url: URL,
    ctx: ConnectionContext
  ) {
    let connectionClosed = false;
    let connectionRegistered = false;
    const state = parseConnectionParams(url);
    const providedToken = state.token;
    const resolvedRole = state.viewerRole ?? "player";
    const pendingRelease =
      resolvedRole === "player" ? this.beginPendingPlayerConnection() : null;
    let pendingReleased = false;
    const finalizePending = () => {
      if (pendingReleased) return;
      pendingReleased = true;
      pendingRelease?.();
    };
    conn.addEventListener("close", () => {
      connectionClosed = true;
      if (!connectionRegistered) {
        finalizePending();
        return;
      }
      this.unregisterConnection(conn);
    });

    const rejectConnection = (reason: string) => {
      finalizePending();
      try {
        conn.close(1008, reason);
      } catch (_err) {}
    };
    const rejectForReset = () => {
      finalizePending();
      try {
        conn.close(ROOM_TEARDOWN_CLOSE_CODE, "room reset");
      } catch (_err) {}
    };

    let storedTokens: RoomTokens | null = null;
    try {
      storedTokens = await this.loadRoomTokens();
    } catch (err) {
      finalizePending();
      throw err;
    }

    if (!providedToken) {
      if (storedTokens) {
        rejectConnection("missing token");
        return;
      }
      if (state.viewerRole === "spectator") {
        rejectConnection("missing token");
        return;
      }
      if (!state.playerId) {
        rejectConnection("missing player");
        return;
      }
      if (connectionClosed) {
        finalizePending();
        return;
      }
      if (this.teardownInProgress) {
        rejectForReset();
        return;
      }
      this.capturePerfMetricsFlag(url);
      this.registerConnection(conn, resolvedRole);
      connectionRegistered = true;
      finalizePending();
      return super.onConnect(conn, ctx);
    }

    let activeTokens: RoomTokens;
    try {
      activeTokens = storedTokens ?? (await this.ensureRoomTokens());
    } catch (err) {
      finalizePending();
      throw err;
    }
    if (
      providedToken !== activeTokens.playerToken &&
      providedToken !== activeTokens.spectatorToken
    ) {
      rejectConnection("invalid token");
      return;
    }

    if (connectionClosed) {
      finalizePending();
      return;
    }
    if (this.teardownInProgress) {
      rejectForReset();
      return;
    }
    this.capturePerfMetricsFlag(url);
    this.registerConnection(conn, resolvedRole);
    connectionRegistered = true;
    finalizePending();
    return super.onConnect(conn, ctx);
  }

  private async handleIntent(conn: Connection, intent: Intent) {
    let ok = false;
    let error: string | undefined;
    let logEvents: { eventId: string; payload: Record<string, unknown> }[] = [];
    let hiddenChanged = false;
    const resetGeneration = this.resetGeneration;
    const state = (conn.state ?? {}) as IntentConnectionState;
    const sendAck = (intentId: string, success: boolean, message?: string) => {
      const ack = {
        type: "ack",
        intentId,
        ok: success,
        ...(message ? { error: message } : null),
      };
      try {
        conn.send(JSON.stringify(ack));
      } catch (_err) {}
    };

    if (state.viewerRole === "spectator") {
      sendAck(intent.id, false, "spectators cannot send intents");
      return;
    }
    if (!state.playerId) {
      sendAck(intent.id, false, "missing player");
      return;
    }

    const payload = isRecord(intent.payload) ? { ...intent.payload } : {};
    if (
      typeof payload.actorId === "string" &&
      payload.actorId !== state.playerId
    ) {
      sendAck(intent.id, false, "actor mismatch");
      return;
    }
    payload.actorId = state.playerId;
    const normalizedIntent = { ...intent, payload };

    try {
      const doc = this.document;
      const hidden = await this.ensureHiddenState(doc);
      const result = applyIntentToDoc(doc, normalizedIntent, hidden);
      ok = result.ok;
      if (result.ok) {
        logEvents = result.logEvents;
        hiddenChanged = Boolean(result.hiddenChanged);
      } else {
        error = result.error;
      }
    } catch (err: any) {
      ok = false;
      error = err?.message ?? "intent handler failed";
    }

    sendAck(intent.id, ok, error);

    if (ok && hiddenChanged) {
      await this.broadcastOverlays();
      this.scheduleHiddenStatePersist(resetGeneration, conn.id);
    }

    if (ok && logEvents.length > 0) {
      try {
        this.broadcastLogEvents(logEvents);
      } catch (err: any) {
        console.error("[party] log events broadcast failed", {
          room: this.name,
          connId: conn.id,
          error: err?.message ?? String(err),
          eventIds: logEvents.map((event) => event.eventId),
        });
      }
    }

    if (ok && normalizedIntent.type === "library.view") {
      await this.handleLibraryViewIntent(conn, normalizedIntent);
    }
  }

  private broadcastLogEvents(
    logEvents: { eventId: string; payload: Record<string, unknown> }[]
  ) {
    if (logEvents.length === 0) return;
    const messages = logEvents.map((event) =>
      JSON.stringify({
        type: "logEvent",
        eventId: event.eventId,
        payload: event.payload,
      })
    );
    for (const connection of this.intentConnections) {
      for (const message of messages) {
        try {
          connection.send(message);
        } catch (_err) {}
      }
    }
  }

  private async sendOverlayForConnection(
    conn: Connection,
    maps?: ReturnType<typeof getMaps>,
    hidden?: HiddenState,
    snapshot?: Snapshot,
    zoneLookup?: ReturnType<typeof buildOverlayZoneLookup>
  ) {
    try {
      const activeHidden =
        hidden ?? (await this.ensureHiddenState(this.document));
      if (!activeHidden) return;
      const overlaySnapshot =
        snapshot ?? buildSnapshot(maps ?? getMaps(this.document));
      const overlayZoneLookup =
        zoneLookup ?? buildOverlayZoneLookup(overlaySnapshot);
      const state = (conn.state ?? {}) as IntentConnectionState;
      const viewerRole = state.viewerRole ?? "player";
      const viewerId = state.playerId;
      const libraryView = this.libraryViews.get(conn.id);
      const overlayResult = this.buildOverlayPayload({
        snapshot: overlaySnapshot,
        zoneLookup: overlayZoneLookup,
        hidden: activeHidden,
        viewerRole,
        viewerId,
        libraryView,
      });
      const previous = this.overlaySummaries.get(conn.id);
      const changed =
        !previous ||
        previous.cardCount !== overlayResult.cardCount ||
        previous.cardsWithArt !== overlayResult.cardsWithArt ||
        (overlayResult.viewerHandCount > 0 && overlayResult.cardCount === 0);
      if (changed) {
        this.overlaySummaries.set(conn.id, {
          cardCount: overlayResult.cardCount,
          cardsWithArt: overlayResult.cardsWithArt,
        });
      }
      conn.send(overlayResult.message);
    } catch (_err) {}
  }

  private async broadcastOverlays() {
    if (this.intentConnections.size === 0) return;

    const maps = getMaps(this.document);
    const hidden = await this.ensureHiddenState(this.document);
    const snapshot = buildSnapshot(maps);
    const zoneLookup = buildOverlayZoneLookup(snapshot);
    const overlayCache = new Map<
      string,
      {
        message: string;
        cardCount: number;
        cardsWithArt: number;
        viewerHandCount: number;
      }
    >();
    for (const connection of this.intentConnections) {
      const state = (connection.state ?? {}) as IntentConnectionState;
      const viewerRole = state.viewerRole ?? "player";
      const viewerId = state.playerId;
      const libraryView = this.libraryViews.get(connection.id);
      const cacheKey = `${viewerRole}|${viewerId ?? ""}|${libraryView?.playerId ?? ""}|${
        libraryView?.count ?? ""
      }`;
      let overlayResult = overlayCache.get(cacheKey);
      if (!overlayResult) {
        overlayResult = this.buildOverlayPayload({
          snapshot,
          zoneLookup,
          hidden,
          viewerRole,
          viewerId,
          libraryView,
        });
        overlayCache.set(cacheKey, overlayResult);
      }
      const previous = this.overlaySummaries.get(connection.id);
      const changed =
        !previous ||
        previous.cardCount !== overlayResult.cardCount ||
        previous.cardsWithArt !== overlayResult.cardsWithArt ||
        (overlayResult.viewerHandCount > 0 && overlayResult.cardCount === 0);
      if (changed) {
        this.overlaySummaries.set(connection.id, {
          cardCount: overlayResult.cardCount,
          cardsWithArt: overlayResult.cardsWithArt,
        });
      }
      try {
        connection.send(overlayResult.message);
      } catch (_err) {}
    }
    this.maybeLogPerfMetrics("overlay-broadcast");
  }

  private buildOverlayPayload(params: {
    snapshot: Snapshot;
    zoneLookup: ReturnType<typeof buildOverlayZoneLookup>;
    hidden: HiddenState;
    viewerRole: "player" | "spectator";
    viewerId?: string;
    libraryView?: { playerId: string; count?: number };
  }): {
    message: string;
    cardCount: number;
    cardsWithArt: number;
    viewerHandCount: number;
  } {
    const overlay = buildOverlayForViewer({
      snapshot: params.snapshot,
      zoneLookup: params.zoneLookup,
      hidden: params.hidden,
      viewerRole: params.viewerRole,
      viewerId: params.viewerId,
      libraryView: params.libraryView,
    });
    const cardCount = Array.isArray(overlay.cards) ? overlay.cards.length : 0;
    let cardsWithArt = 0;
    if (Array.isArray(overlay.cards)) {
      for (const card of overlay.cards) {
        if (typeof card.imageUrl === "string" && card.imageUrl.length > 0) {
          cardsWithArt += 1;
        }
      }
    }
    const viewerHandCount =
      params.viewerRole !== "spectator" && params.viewerId
        ? (params.hidden.handOrder[params.viewerId]?.length ?? 0)
        : 0;
    return {
      message: JSON.stringify({ type: "privateOverlay", payload: overlay }),
      cardCount,
      cardsWithArt,
      viewerHandCount,
    };
  }

  private async handleLibraryViewIntent(conn: Connection, intent: Intent) {
    const state = (conn.state ?? {}) as IntentConnectionState;
    if (state.viewerRole === "spectator") return;
    const viewerId = state.playerId;
    const payload = isRecord(intent.payload) ? intent.payload : {};
    const playerId =
      typeof payload.playerId === "string" ? payload.playerId : null;
    if (!playerId) return;
    if (viewerId && viewerId !== playerId) return;
    const count =
      typeof payload.count === "number" &&
      Number.isFinite(payload.count) &&
      payload.count > 0
        ? Math.floor(payload.count)
        : undefined;
    this.libraryViews.set(conn.id, { playerId, ...(count ? { count } : null) });
    await this.sendOverlayForConnection(conn);
  }
}

const parseViewerRole = (
  value: string | null | undefined
): IntentConnectionState["viewerRole"] =>
  value === "player" || value === "spectator" ? value : undefined;

const parseConnectionParams = (url: URL): IntentConnectionState => {
  const playerId = url.searchParams.get("playerId") ?? undefined;
  const spectatorToken = url.searchParams.get("st");
  const playerToken = url.searchParams.get("gt");
  const token = spectatorToken ?? playerToken ?? undefined;
  const viewerRoleParam = url.searchParams.get("viewerRole");
  let viewerRole = parseViewerRole(viewerRoleParam);
  if (spectatorToken) {
    viewerRole = "spectator";
  } else if (playerToken && viewerRole !== "spectator") {
    viewerRole = "player";
  }
  return { playerId, viewerRole, token };
};
