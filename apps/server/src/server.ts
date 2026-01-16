import type * as Party from "partykit/server";
import { onConnect, unstable_getYDoc } from "y-partykit";
import * as Y from "yjs";

import type { Card } from "../../web/src/types/cards";

import {
  HIDDEN_STATE_CARDS_PREFIX,
  HIDDEN_STATE_KEY,
  HIDDEN_STATE_META_KEY,
  ROOM_TOKENS_KEY,
} from "./domain/constants";
import type { HiddenState, HiddenStateMeta, Intent, IntentConnectionState, RoomTokens } from "./domain/types";
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

const INTENT_ROLE = "intent";

const YJS_OPTIONS = {
  persist: { mode: "snapshot" as const },
  readOnly: true,
};

export default class MtgPartyServer implements Party.Server {
  private intentConnections = new Set<Party.Connection>();
  private hiddenState: HiddenState | null = null;
  private roomTokens: RoomTokens | null = null;
  private libraryViews = new Map<string, { playerId: string; count?: number }>();
  private overlaySummaries = new Map<string, { cardCount: number; cardsWithArt: number }>();

  constructor(public party: Party.Room) {}

  private async ensureHiddenState(doc: Y.Doc) {
    if (this.hiddenState) return this.hiddenState;
    const storedMeta = await this.party.storage.get<HiddenStateMeta>(HIDDEN_STATE_META_KEY);
    if (storedMeta) {
      const cards: Record<string, Card> = {};
      const chunkKeys = Array.isArray(storedMeta.cardChunkKeys)
        ? storedMeta.cardChunkKeys
        : [];
      for (const key of chunkKeys) {
        const chunk = await this.party.storage.get<Record<string, Card>>(key);
        if (chunk && isRecord(chunk)) {
          Object.assign(cards, chunk as Record<string, Card>);
        }
      }
      const { cardChunkKeys: _keys, ...rest } = storedMeta;
      this.hiddenState = normalizeHiddenState({ ...rest, cards });
      return this.hiddenState;
    }

    const stored = await this.party.storage.get<HiddenState>(HIDDEN_STATE_KEY);
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
    const chunkKeys = chunks.map((_chunk, index) => `${HIDDEN_STATE_CARDS_PREFIX}${index}`);

    for (let index = 0; index < chunks.length; index += 1) {
      const key = chunkKeys[index];
      await this.party.storage.put(key, chunks[index]);
    }

    const prevMeta = await this.party.storage.get<HiddenStateMeta>(HIDDEN_STATE_META_KEY);
    if (prevMeta?.cardChunkKeys?.length) {
      for (const key of prevMeta.cardChunkKeys) {
        if (!chunkKeys.includes(key)) {
          try {
            await this.party.storage.delete(key);
          } catch (_err) {}
        }
      }
    }

    const nextMeta: HiddenStateMeta = {
      ...rest,
      cardChunkKeys: chunkKeys,
    };
    await this.party.storage.put(HIDDEN_STATE_META_KEY, nextMeta);

    try {
      await this.party.storage.delete(HIDDEN_STATE_KEY);
    } catch (_err) {}
  }

  private async loadRoomTokens(): Promise<RoomTokens | null> {
    if (this.roomTokens) return this.roomTokens;
    const stored = await this.party.storage.get<RoomTokens>(ROOM_TOKENS_KEY);
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
    await this.party.storage.put(ROOM_TOKENS_KEY, generated);
    return generated;
  }

  private sendRoomTokens(
    conn: Party.Connection,
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

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(conn.uri ?? ctx.request.url);
    const role = url.searchParams.get("role");
    if (role === INTENT_ROLE) {
      void this.bindIntentConnection(conn);
      return;
    }
    void this.bindSyncConnection(conn, url);
  }

  private async bindIntentConnection(conn: Party.Connection) {
    this.intentConnections.add(conn);
    const state = parseIntentConnectionState(conn);
    const rejectConnection = (reason: string) => {
      this.intentConnections.delete(conn);
      this.libraryViews.delete(conn.id);
      this.overlaySummaries.delete(conn.id);
      try {
        conn.close(1008, reason);
      } catch (_err) {}
      console.warn("[party] intent connection rejected", {
        room: this.party.id,
        reason,
        connId: conn.id,
        playerId: state.playerId,
        viewerRole: state.viewerRole,
        hasToken: Boolean(state.token),
      });
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
    const resolvedPlayerId = resolvedRole === "spectator" ? undefined : state.playerId;
    if (resolvedRole === "player" && !resolvedPlayerId) {
      rejectConnection("missing player");
      return;
    }

    conn.setState({
      playerId: resolvedPlayerId,
      viewerRole: resolvedRole,
      token: providedToken ?? activeTokens?.playerToken,
    });
    console.info("[party] intent connection established", {
      room: this.party.id,
      connId: conn.id,
      playerId: resolvedPlayerId,
      viewerRole: resolvedRole,
      hasToken: Boolean(providedToken ?? activeTokens?.playerToken),
    });

    if (activeTokens) {
      this.sendRoomTokens(conn, activeTokens, resolvedRole);
    }

    void this.sendOverlayForConnection(conn);

    conn.addEventListener("close", () => {
      this.intentConnections.delete(conn);
      this.libraryViews.delete(conn.id);
      this.overlaySummaries.delete(conn.id);
      console.warn("[party] intent connection closed", {
        room: this.party.id,
        connId: conn.id,
        playerId: resolvedPlayerId,
        viewerRole: resolvedRole,
      });
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

  private async bindSyncConnection(conn: Party.Connection, url: URL) {
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
      return onConnect(conn, this.party, YJS_OPTIONS);
    }

    const activeTokens = storedTokens ?? (await this.ensureRoomTokens());
    if (
      providedToken !== activeTokens.playerToken &&
      providedToken !== activeTokens.spectatorToken
    ) {
      rejectConnection("invalid token");
      return;
    }

    return onConnect(conn, this.party, YJS_OPTIONS);
  }

  private async handleIntent(conn: Party.Connection, intent: Intent) {
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
    if (typeof payload.actorId === "string" && payload.actorId !== state.playerId) {
      sendAck(intent.id, false, "actor mismatch");
      return;
    }
    payload.actorId = state.playerId;
    const normalizedIntent = { ...intent, payload };
    if (
      normalizedIntent.type === "library.draw" ||
      normalizedIntent.type === "library.shuffle" ||
      normalizedIntent.type === "deck.load" ||
      normalizedIntent.type === "deck.reset" ||
      normalizedIntent.type === "deck.mulligan" ||
      normalizedIntent.type === "card.add" ||
      normalizedIntent.type === "card.add.batch"
    ) {
      console.info("[party] intent received", {
        room: this.party.id,
        connId: conn.id,
        intentId: normalizedIntent.id,
        type: normalizedIntent.type,
        actorId: state.playerId,
      });
    }

    try {
      const doc = await unstable_getYDoc(this.party, YJS_OPTIONS);
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
    if (
      normalizedIntent.type === "library.draw" ||
      normalizedIntent.type === "library.shuffle" ||
      normalizedIntent.type === "deck.load" ||
      normalizedIntent.type === "deck.reset" ||
      normalizedIntent.type === "deck.mulligan" ||
      normalizedIntent.type === "card.add" ||
      normalizedIntent.type === "card.add.batch"
    ) {
      console.info("[party] intent ack", {
        room: this.party.id,
        connId: conn.id,
        intentId: normalizedIntent.id,
        type: normalizedIntent.type,
        ok,
        error,
      });
    }
    if (
      normalizedIntent.type === "library.draw" ||
      normalizedIntent.type === "library.shuffle" ||
      normalizedIntent.type === "deck.load" ||
      normalizedIntent.type === "deck.reset" ||
      normalizedIntent.type === "deck.mulligan" ||
      normalizedIntent.type === "card.add" ||
      normalizedIntent.type === "card.add.batch"
    ) {
      console.info("[party] intent result", {
        room: this.party.id,
        connId: conn.id,
        intentId: normalizedIntent.id,
        type: normalizedIntent.type,
        ok,
        hiddenChanged,
        logEvents: logEvents.map((event) => event.eventId),
      });
    }

    if (!ok) {
      console.warn("[party] intent rejected", {
        type: normalizedIntent.type,
        actorId: state.playerId,
        viewerRole: state.viewerRole,
        error,
      });
    }

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
          room: this.party.id,
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
          room: this.party.id,
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

  private broadcastLogEvents(logEvents: { eventId: string; payload: Record<string, unknown> }[]) {
    if (logEvents.length === 0) return;
    console.info("[party] log events broadcast", {
      room: this.party.id,
      eventIds: logEvents.map((event) => event.eventId),
      connectionCount: this.intentConnections.size,
    });
    const messages = logEvents.map((event) =>
      JSON.stringify({ type: "logEvent", eventId: event.eventId, payload: event.payload })
    );
    for (const connection of this.intentConnections) {
      for (const message of messages) {
        try {
          connection.send(message);
        } catch (_err) {}
      }
    }
  }

  private async sendOverlayForConnection(conn: Party.Connection, maps?: ReturnType<typeof getMaps>, hidden?: HiddenState) {
    try {
      const doc = maps ? null : await unstable_getYDoc(this.party, YJS_OPTIONS);
      const activeMaps = maps ?? (doc ? getMaps(doc) : null);
      if (!activeMaps) return;
      const activeHidden = hidden ?? (doc ? await this.ensureHiddenState(doc) : null);
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
        ? overlay.cards.filter((card) => typeof card.imageUrl === "string" && card.imageUrl.length > 0)
            .length
        : 0;
      const viewerHandCount =
        viewerRole !== "spectator" && viewerId
          ? activeHidden.handOrder[viewerId]?.length ?? 0
          : 0;
      const previous = this.overlaySummaries.get(conn.id);
      const changed =
        !previous ||
        previous.cardCount !== cardCount ||
        previous.cardsWithArt !== cardsWithArt ||
        (viewerHandCount > 0 && cardCount === 0);
      if (changed) {
        console.info("[party] overlay summary", {
          room: this.party.id,
          connId: conn.id,
          viewerRole,
          viewerId,
          cardCount,
          cardsWithArt,
          viewerHandCount,
          libraryViewCount: libraryView?.count,
        });
        this.overlaySummaries.set(conn.id, { cardCount, cardsWithArt });
      }
      conn.send(JSON.stringify({ type: "privateOverlay", payload: overlay }));
    } catch (_err) {}
  }

  private async broadcastOverlays() {
    if (this.intentConnections.size === 0) return;
    console.info("[party] overlay broadcast", {
      room: this.party.id,
      connectionCount: this.intentConnections.size,
    });
    const doc = await unstable_getYDoc(this.party, YJS_OPTIONS);
    const maps = getMaps(doc);
    const hidden = await this.ensureHiddenState(doc);
    for (const connection of this.intentConnections) {
      await this.sendOverlayForConnection(connection, maps, hidden);
    }
  }

  private async handleLibraryViewIntent(conn: Party.Connection, intent: Intent) {
    const state = (conn.state ?? {}) as IntentConnectionState;
    if (state.viewerRole === "spectator") return;
    const viewerId = state.playerId;
    const payload = isRecord(intent.payload) ? intent.payload : {};
    const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
    if (!playerId) return;
    if (viewerId && viewerId !== playerId) return;
    const count =
      typeof payload.count === "number" && Number.isFinite(payload.count) && payload.count > 0
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

const parseIntentConnectionState = (conn: Party.Connection): IntentConnectionState => {
  try {
    const url = new URL(conn.uri);
    return parseConnectionParams(url);
  } catch (_err) {
    return {};
  }
};
