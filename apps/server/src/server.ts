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
} from "./domain/types";
import { applyIntentToDoc } from "./domain/intents/applyIntentToDoc";
import { buildOverlayForViewer } from "./domain/overlay";
import {
  chunkHiddenCards,
  createEmptyHiddenState,
  migrateHiddenStateFromSnapshot,
  normalizeHiddenState,
} from "./domain/hiddenState";
import {
  clearYMap,
  getMaps,
  isRecord,
  syncPlayerOrder,
} from "./domain/yjsStore";

const INTENT_ROLE = "intent";
const EMPTY_ROOM_GRACE_MS = 30_000;
const ROOM_TEARDOWN_CLOSE_CODE = 1013;
const Y_DOC_STORAGE_KEY = "yjs:doc";

export type Env = {
  rooms: DurableObjectNamespace;
};

export { applyIntentToDoc } from "./domain/intents/applyIntentToDoc";
export { buildOverlayForViewer } from "./domain/overlay";
export { createEmptyHiddenState } from "./domain/hiddenState";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("Not Found", { status: 404 })
    );
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
    const chunkKeys = chunks.map(
      (_chunk, index) => `${HIDDEN_STATE_CARDS_PREFIX}${index}`
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
    const nextMeta: HiddenStateMeta = {
      ...rest,
      cardChunkKeys: chunkKeys,
    };
    await this.ctx.storage.put(HIDDEN_STATE_META_KEY, nextMeta);

    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    try {
      await this.ctx.storage.delete(HIDDEN_STATE_KEY);
    } catch (_err) {}
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

    resolvedRole =
      providedToken && activeTokens?.spectatorToken === providedToken
        ? "spectator"
        : "player";
    resolvedPlayerId =
      resolvedRole === "spectator" ? undefined : state.playerId;
    if (resolvedRole === "player" && !resolvedPlayerId) {
      rejectConnection("missing player");
      return;
    }

    if (connectionClosed) return;
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
      try {
        await this.persistHiddenState(resetGeneration);
      } catch (err: any) {
        let hiddenSize: number | null = null;
        try {
          hiddenSize = JSON.stringify(this.hiddenState ?? {}).length;
        } catch (_err) {
          hiddenSize = null;
        }
        console.error("[party] hidden state persist failed", {
          room: this.name,
          connId: conn.id,
          error: err?.message ?? String(err),
          hiddenSize,
        });
      }
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
    hidden?: HiddenState
  ) {
    try {
      const activeMaps = maps ?? getMaps(this.document);
      if (!activeMaps) return;
      const activeHidden =
        hidden ?? (await this.ensureHiddenState(this.document));
      if (!activeHidden) return;
      const state = (conn.state ?? {}) as IntentConnectionState;
      const viewerRole = state.viewerRole ?? "player";
      const viewerId = state.playerId;
      const libraryView = this.libraryViews.get(conn.id);
      const overlay = buildOverlayForViewer({
        maps: activeMaps,
        hidden: activeHidden,
        viewerRole,
        viewerId,
        libraryView,
      });
      const cardCount = Array.isArray(overlay.cards) ? overlay.cards.length : 0;
      const cardsWithArt = Array.isArray(overlay.cards)
        ? overlay.cards.filter(
            (card) =>
              typeof card.imageUrl === "string" && card.imageUrl.length > 0
          ).length
        : 0;
      const viewerHandCount =
        viewerRole !== "spectator" && viewerId
          ? (activeHidden.handOrder[viewerId]?.length ?? 0)
          : 0;
      const previous = this.overlaySummaries.get(conn.id);
      const changed =
        !previous ||
        previous.cardCount !== cardCount ||
        previous.cardsWithArt !== cardsWithArt ||
        (viewerHandCount > 0 && cardCount === 0);
      if (changed) {
        this.overlaySummaries.set(conn.id, { cardCount, cardsWithArt });
      }
      conn.send(JSON.stringify({ type: "privateOverlay", payload: overlay }));
    } catch (_err) {}
  }

  private async broadcastOverlays() {
    if (this.intentConnections.size === 0) return;

    const maps = getMaps(this.document);
    const hidden = await this.ensureHiddenState(this.document);
    for (const connection of this.intentConnections) {
      await this.sendOverlayForConnection(connection, maps, hidden);
    }
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
  if (spectatorToken) viewerRole = "spectator";
  if (playerToken) viewerRole = "player";
  return { playerId, viewerRole, token };
};
