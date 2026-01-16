import { DurableObjectNamespace } from "cloudflare:workers";
import {
  routePartykitRequest,
  type Connection,
  type ConnectionContext,
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
import { getMaps, isRecord } from "./domain/yjsStore";

export { applyIntentToDoc } from "./domain/intents/applyIntentToDoc";
export { buildOverlayForViewer } from "./domain/overlay";
export { createEmptyHiddenState } from "./domain/hiddenState";

export type Env = {
  rooms: DurableObjectNamespace;
};

const INTENT_ROLE = "intent";
const Y_DOC_STORAGE_KEY = "yjs:doc";

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

  private async persistHiddenState() {
    if (!this.hiddenState) return;
    const { cards, ...rest } = this.hiddenState;
    const chunks = chunkHiddenCards(cards);
    const chunkKeys = chunks.map(
      (_chunk, index) => `${HIDDEN_STATE_CARDS_PREFIX}${index}`
    );

    for (let index = 0; index < chunks.length; index += 1) {
      const key = chunkKeys[index];
      await this.ctx.storage.put(key, chunks[index]);
    }

    const prevMeta = await this.ctx.storage.get<HiddenStateMeta>(
      HIDDEN_STATE_META_KEY
    );
    if (prevMeta?.cardChunkKeys?.length) {
      for (const key of prevMeta.cardChunkKeys) {
        if (!chunkKeys.includes(key)) {
          try {
            await this.ctx.storage.delete(key);
          } catch (_err) {}
        }
      }
    }

    const nextMeta: HiddenStateMeta = {
      ...rest,
      cardChunkKeys: chunkKeys,
    };
    await this.ctx.storage.put(HIDDEN_STATE_META_KEY, nextMeta);

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

  onConnect(conn: Connection, ctx: ConnectionContext) {
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

    const resolvedRole =
      providedToken && activeTokens?.spectatorToken === providedToken
        ? "spectator"
        : "player";
    const resolvedPlayerId =
      resolvedRole === "spectator" ? undefined : state.playerId;
    if (resolvedRole === "player" && !resolvedPlayerId) {
      rejectConnection("missing player");
      return;
    }

    conn.setState({
      playerId: resolvedPlayerId,
      viewerRole: resolvedRole,
      token: providedToken ?? activeTokens?.playerToken,
    });

    if (activeTokens) {
      this.sendRoomTokens(conn, activeTokens, resolvedRole);
    }

    void this.sendOverlayForConnection(conn);

    conn.addEventListener("close", () => {
      this.intentConnections.delete(conn);
      this.libraryViews.delete(conn.id);
      this.overlaySummaries.delete(conn.id);
    });

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
    const state = parseConnectionParams(url);
    const storedTokens = await this.loadRoomTokens();
    const providedToken = state.token;

    const rejectConnection = (reason: string) => {
      try {
        conn.close(1008, reason);
      } catch (_err) {}
    };

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
      return super.onConnect(conn, ctx);
    }

    const activeTokens = storedTokens ?? (await this.ensureRoomTokens());
    if (
      providedToken !== activeTokens.playerToken &&
      providedToken !== activeTokens.spectatorToken
    ) {
      rejectConnection("invalid token");
      return;
    }

    return super.onConnect(conn, ctx);
  }

  private async handleIntent(conn: Connection, intent: Intent) {
    let ok = false;
    let error: string | undefined;
    let logEvents: { eventId: string; payload: Record<string, unknown> }[] = [];
    let hiddenChanged = false;
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
        await this.persistHiddenState();
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
