import type * as Party from "partykit/server";
import { onConnect, unstable_getYDoc } from "y-partykit";
import * as Y from "yjs";

import { isTokenCard, type Card, type CardIdentity, type FaceDownMode } from "../../web/src/types/cards";
import type { Counter } from "../../web/src/types/counters";
import type { Player } from "../../web/src/types/players";
import type { Zone, ZoneType } from "../../web/src/types/zones";
import { MAX_PLAYERS } from "../../web/src/lib/room";

const INTENT_ROLE = "intent";
const LEGACY_BATTLEFIELD_WIDTH = 1000;
const LEGACY_BATTLEFIELD_HEIGHT = 600;
const SNAP_GRID_SIZE = 30;
const GRID_STEP_X = SNAP_GRID_SIZE / LEGACY_BATTLEFIELD_WIDTH;
const GRID_STEP_Y = SNAP_GRID_SIZE / LEGACY_BATTLEFIELD_HEIGHT;
const MAX_REVEALED_TO = 8;

const YJS_OPTIONS = {
  persist: { mode: "snapshot" as const },
  readOnly: true,
};

const ZONE = {
  LIBRARY: "library",
  HAND: "hand",
  BATTLEFIELD: "battlefield",
  GRAVEYARD: "graveyard",
  EXILE: "exile",
  COMMANDER: "commander",
  SIDEBOARD: "sideboard",
} as const satisfies Record<string, ZoneType>;

const LEGACY_COMMAND_ZONE = "command" as const;
const HIDDEN_STATE_KEY = "hiddenState";
const HIDDEN_STATE_META_KEY = "hiddenState:v2:meta";
const HIDDEN_STATE_CARDS_PREFIX = "hiddenState:v2:cards:";
const ROOM_TOKENS_KEY = "roomTokens";
const MAX_HIDDEN_STATE_CHUNK_SIZE = 120_000;
const isHiddenZoneType = (zoneType: ZoneType | undefined) =>
  zoneType === ZONE.HAND || zoneType === ZONE.LIBRARY || zoneType === ZONE.SIDEBOARD;

const isPublicZoneType = (zoneType: ZoneType | undefined) =>
  Boolean(zoneType) && !isHiddenZoneType(zoneType);

type PermissionResult = { allowed: boolean; reason?: string };

const allow = (): PermissionResult => ({ allowed: true });
const deny = (reason: string): PermissionResult => ({ allowed: false, reason });

const requireBattlefieldController = (
  actorId: string,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined,
  action: string
): PermissionResult => {
  if (!zone || zone.type !== ZONE.BATTLEFIELD) {
    return deny(`Cards can only ${action} on the battlefield`);
  }
  if (actorId !== card.controllerId) {
    return deny(`Only controller may ${action}`);
  }
  return allow();
};

const canTapCard = (
  actorId: string,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult => requireBattlefieldController(actorId, card, zone, "tap/untap");

const canModifyCardState = (
  actorId: string,
  card: { controllerId: string },
  zone: { type: ZoneType } | null | undefined
): PermissionResult => requireBattlefieldController(actorId, card, zone, "modify this card");

const canUpdatePlayer = (
  actorId: string,
  player: Player,
  updates: Record<string, unknown>
): PermissionResult => {
  if (actorId === player.id) return allow();

  const isLifeChange =
    updates.life !== undefined || updates.commanderDamage !== undefined;
  if (isLifeChange) {
    return deny("Cannot change another player's life total");
  }

  if (updates.name !== undefined) {
    return deny("Cannot change another player's name");
  }

  return deny("Cannot update another player");
};

const canViewHiddenZone = (actorId: string, zone: Zone): PermissionResult => {
  if (isHiddenZoneType(zone.type) && zone.ownerId !== actorId) {
    return deny("Hidden zone");
  }
  return allow();
};

const canMoveCard = (
  actorId: string,
  card: Card,
  fromZone: Zone,
  toZone: Zone
): PermissionResult => {
  const actorIsOwner = actorId === card.ownerId;
  const actorIsController = actorId === card.controllerId;
  const actorIsFromHost = actorId === fromZone.ownerId;
  const actorIsToHost = actorId === toZone.ownerId;
  const isToken = isTokenCard(card);

  const fromHidden = isHiddenZoneType(fromZone.type);
  const toHidden = isHiddenZoneType(toZone.type);
  const fromBattlefield = fromZone.type === ZONE.BATTLEFIELD;
  const toBattlefield = toZone.type === ZONE.BATTLEFIELD;
  const bothBattlefields = fromBattlefield && toBattlefield;

  if (!toBattlefield && toZone.ownerId !== card.ownerId) {
    return deny("Cards may only enter their owner seat zones or any battlefield");
  }

  if (fromHidden && !actorIsFromHost) {
    return deny("Cannot move from a hidden zone you do not own");
  }

  if (toHidden) {
    if (!actorIsToHost) {
      return deny("Cannot place into a hidden zone you do not own");
    }
    return allow();
  }

  const toZoneType = toZone.type as ZoneType | typeof LEGACY_COMMAND_ZONE;
  if ((toZoneType === ZONE.COMMANDER || toZoneType === LEGACY_COMMAND_ZONE) && !actorIsOwner) {
    return deny("Cannot place cards into another player's command zone");
  }

  const tokenLeavingBattlefield = isToken && fromBattlefield && !toBattlefield;
  if (tokenLeavingBattlefield) {
    return actorIsOwner
      ? allow()
      : deny("Only owner may move this token off the battlefield");
  }

  if (bothBattlefields) {
    return actorIsOwner || actorIsController
      ? allow()
      : deny("Only owner or controller may move this card between battlefields");
  }

  if (toBattlefield) {
    return actorIsOwner || actorIsController
      ? allow()
      : deny("Only owner or controller may move this card here");
  }

  if (actorIsOwner) return allow();

  if (actorIsFromHost && !fromHidden && !toHidden) return allow();

  return deny("Not permitted to move this card");
};

const canAddCard = (actorId: string, card: Card, zone: Zone): PermissionResult => {
  if (isTokenCard(card) && zone.type !== ZONE.BATTLEFIELD) {
    return deny("Tokens can only enter the battlefield");
  }
  if (isHiddenZoneType(zone.type)) {
    if (zone.ownerId !== actorId) {
      return deny("Cannot place into a hidden zone you do not own");
    }
    if (card.ownerId !== zone.ownerId) {
      return deny("Cards may only enter their owner seat zones or any battlefield");
    }
    return allow();
  }

  if (zone.type === ZONE.BATTLEFIELD) {
    if (actorId === card.ownerId || actorId === card.controllerId) return allow();
    return deny("Only owner or controller may move this card here");
  }

  const zoneType = zone.type as ZoneType | typeof LEGACY_COMMAND_ZONE;
  if ((zoneType === ZONE.COMMANDER || zoneType === LEGACY_COMMAND_ZONE) && card.ownerId !== zone.ownerId) {
    return deny("Cannot place cards into another player's command zone");
  }

  if (card.ownerId !== zone.ownerId) {
    return deny("Cards may only enter their owner seat zones or any battlefield");
  }

  return actorId === card.ownerId ? allow() : deny("Not permitted to move this card");
};

const canRemoveToken = (actorId: string, card: Card, zone: Zone): PermissionResult => {
  if (!isTokenCard(card)) {
    return deny("Direct remove is allowed only for tokens");
  }
  const actorIsOwner = actorId === card.ownerId;
  const actorIsController = actorId === card.controllerId;
  const actorIsZoneHost = actorId === zone.ownerId;
  if (actorIsOwner || actorIsController || actorIsZoneHost) return allow();
  return deny("Only owner, controller, or zone host may remove this token");
};

const hasSameMembers = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const setLeft = new Set(left);
  const setRight = new Set(right);
  if (setLeft.size !== left.length || setRight.size !== right.length) return false;
  if (setLeft.size !== setRight.size) return false;
  for (const entry of setLeft) {
    if (!setRight.has(entry)) return false;
  }
  return true;
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
    let logEvents: LogEvent[] = [];
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

  private broadcastLogEvents(logEvents: LogEvent[]) {
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

  private async sendOverlayForConnection(conn: Party.Connection, maps?: Maps, hidden?: HiddenState) {
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

type Maps = {
  players: Y.Map<unknown>;
  playerOrder: Y.Array<string>;
  zones: Y.Map<unknown>;
  cards: Y.Map<unknown>;
  zoneCardOrders: Y.Map<Y.Array<string>>;
  globalCounters: Y.Map<unknown>;
  battlefieldViewScale: Y.Map<unknown>;
  meta: Y.Map<unknown>;
  handRevealsToAll: Y.Map<unknown>;
  libraryRevealsToAll: Y.Map<unknown>;
  faceDownRevealsToAll: Y.Map<unknown>;
};

type Snapshot = {
  players: Record<string, Player>;
  playerOrder: string[];
  zones: Record<string, Zone>;
  cards: Record<string, Card>;
  globalCounters: Record<string, string>;
  battlefieldViewScale: Record<string, number>;
  meta: Record<string, unknown>;
};

type HiddenReveal = {
  toAll?: boolean;
  toPlayers?: string[];
};

type HiddenState = {
  cards: Record<string, Card>;
  handOrder: Record<string, string[]>;
  libraryOrder: Record<string, string[]>;
  sideboardOrder: Record<string, string[]>;
  faceDownBattlefield: Record<string, CardIdentity>;
  handReveals: Record<string, HiddenReveal>;
  libraryReveals: Record<string, HiddenReveal>;
  faceDownReveals: Record<string, HiddenReveal>;
};
type HiddenStateMeta = Omit<HiddenState, "cards"> & { cardChunkKeys: string[] };

type RoomTokens = {
  playerToken: string;
  spectatorToken: string;
};

type Intent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

type IntentConnectionState = {
  playerId?: string;
  viewerRole?: "player" | "spectator";
  token?: string;
};

type PrivateOverlayPayload = {
  cards: Card[];
  zoneCardOrders?: Record<string, string[]>;
};

type LogEvent = { eventId: string; payload: Record<string, unknown> };

type ApplyResult =
  | { ok: true; logEvents: LogEvent[]; hiddenChanged?: boolean }
  | { ok: false; error: string };

type InnerApplyResult = { ok: true } | { ok: false; error: string };

type MoveOpts = {
  suppressLog?: boolean;
  faceDown?: boolean;
  faceDownMode?: FaceDownMode;
  skipCollision?: boolean;
  groupCollision?: {
    movingCardIds: string[];
    targetPositions: Record<string, { x: number; y: number } | undefined>;
  };
};

const getMaps = (doc: Y.Doc): Maps => ({
  players: doc.getMap("players"),
  playerOrder: doc.getArray("playerOrder"),
  zones: doc.getMap("zones"),
  cards: doc.getMap("cards"),
  zoneCardOrders: doc.getMap("zoneCardOrders"),
  globalCounters: doc.getMap("globalCounters"),
  battlefieldViewScale: doc.getMap("battlefieldViewScale"),
  meta: doc.getMap("meta"),
  handRevealsToAll: doc.getMap("handRevealsToAll"),
  libraryRevealsToAll: doc.getMap("libraryRevealsToAll"),
  faceDownRevealsToAll: doc.getMap("faceDownRevealsToAll"),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toPlain = (value: unknown): unknown => {
  if (value instanceof Y.Map || value instanceof Y.Array) return value.toJSON();
  return value;
};

const readRecord = (value: unknown): Record<string, unknown> | null => {
  const plain = toPlain(value);
  return isRecord(plain) ? plain : null;
};

const parseViewerRole = (
  value: string | null | undefined
): IntentConnectionState["viewerRole"] =>
  value === "player" || value === "spectator" ? value : undefined;

const coerceCard = (raw: Record<string, unknown>): Card => raw as unknown as Card;

const coercePlayer = (raw: Record<string, unknown>): Player =>
  raw as unknown as Player;

const coerceZone = (raw: Record<string, unknown>): Zone => raw as unknown as Zone;

const uniqueStrings = (values: unknown[]): string[] =>
  Array.from(new Set(values.filter((value): value is string => typeof value === "string")));

export const createEmptyHiddenState = (): HiddenState => ({
  cards: {},
  handOrder: {},
  libraryOrder: {},
  sideboardOrder: {},
  faceDownBattlefield: {},
  handReveals: {},
  libraryReveals: {},
  faceDownReveals: {},
});

const readOrderMap = (value: unknown): Record<string, string[]> => {
  if (!isRecord(value)) return {};
  const result: Record<string, string[]> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!Array.isArray(raw)) return;
    result[key] = uniqueStrings(raw);
  });
  return result;
};

const readRevealMap = (value: unknown): Record<string, HiddenReveal> => {
  if (!isRecord(value)) return {};
  const result: Record<string, HiddenReveal> = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (!isRecord(raw)) return;
    const toAll = raw.toAll === true;
    const toPlayers = Array.isArray(raw.toPlayers)
      ? uniqueStrings(raw.toPlayers)
      : [];
    result[key] = {
      ...(toAll ? { toAll: true } : null),
      ...(toPlayers.length ? { toPlayers } : null),
    };
  });
  return result;
};

const normalizeHiddenState = (value: unknown): HiddenState => {
  if (!isRecord(value)) return createEmptyHiddenState();
  const cards = isRecord(value.cards) ? (value.cards as Record<string, Card>) : {};
  const faceDownBattlefield = isRecord(value.faceDownBattlefield)
    ? (value.faceDownBattlefield as Record<string, CardIdentity>)
    : {};
  return {
    cards,
    handOrder: readOrderMap(value.handOrder),
    libraryOrder: readOrderMap(value.libraryOrder),
    sideboardOrder: readOrderMap(value.sideboardOrder),
    faceDownBattlefield,
    handReveals: readRevealMap(value.handReveals),
    libraryReveals: readRevealMap(value.libraryReveals),
    faceDownReveals: readRevealMap(value.faceDownReveals),
  };
};

const estimateJsonSize = (value: unknown): number => {
  try {
    return JSON.stringify(value).length;
  } catch (_err) {
    return Number.POSITIVE_INFINITY;
  }
};

const chunkHiddenCards = (cards: Record<string, Card>): Record<string, Card>[] => {
  const entries = Object.entries(cards);
  if (entries.length === 0) return [];
  const chunks: Record<string, Card>[] = [];
  let current: Record<string, Card> = {};

  entries.forEach(([cardId, card]) => {
    const next = { ...current, [cardId]: card };
    if (
      Object.keys(current).length > 0 &&
      estimateJsonSize(next) > MAX_HIDDEN_STATE_CHUNK_SIZE
    ) {
      chunks.push(current);
      current = { [cardId]: card };
      return;
    }
    current = next;
  });

  if (Object.keys(current).length) {
    chunks.push(current);
  }
  return chunks;
};

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

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const clamp01 = (value: number) => clampNumber(value, 0, 1);

const clampNormalizedPosition = (position: { x: number; y: number }) => ({
  x: clamp01(position.x),
  y: clamp01(position.y),
});

const migratePositionToNormalized = (position: { x: number; y: number }) =>
  clampNormalizedPosition({
    x: LEGACY_BATTLEFIELD_WIDTH ? position.x / LEGACY_BATTLEFIELD_WIDTH : 0,
    y: LEGACY_BATTLEFIELD_HEIGHT ? position.y / LEGACY_BATTLEFIELD_HEIGHT : 0,
  });

const normalizeMovePosition = (
  position: { x: number; y: number } | undefined,
  fallback: { x: number; y: number }
) => {
  const normalizedInput =
    position && (position.x > 1 || position.y > 1)
      ? migratePositionToNormalized(position)
      : position;
  return clampNormalizedPosition(normalizedInput ?? fallback);
};

const positionKey = (position: { x: number; y: number }) =>
  `${position.x.toFixed(4)}:${position.y.toFixed(4)}`;

const resolvePositionAgainstOccupied = ({
  targetPosition,
  occupied,
  maxAttempts,
}: {
  targetPosition: { x: number; y: number };
  occupied: Set<string>;
  maxAttempts: number;
}) => {
  const clampedTarget = clampNormalizedPosition(targetPosition);
  let candidate = clampedTarget;
  let attempts = 0;

  while (occupied.has(positionKey(candidate)) && attempts < maxAttempts) {
    candidate = clampNormalizedPosition({ x: candidate.x, y: candidate.y + GRID_STEP_Y });
    attempts += 1;
  }

  if (attempts >= maxAttempts) return clampedTarget;
  return candidate;
};

const resolveBattlefieldCollisionPosition = ({
  movingCardId,
  targetPosition,
  orderedCardIds,
  getPosition,
  maxAttempts = 200,
}: {
  movingCardId: string;
  targetPosition: { x: number; y: number };
  orderedCardIds: string[];
  getPosition: (cardId: string) => { x: number; y: number } | null | undefined;
  maxAttempts?: number;
}) => {
  const occupied = new Set<string>();
  orderedCardIds.forEach((id) => {
    if (id === movingCardId) return;
    const pos = getPosition(id);
    if (!pos) return;
    const clamped = clampNormalizedPosition(pos);
    occupied.add(positionKey(clamped));
  });

  return resolvePositionAgainstOccupied({
    targetPosition,
    occupied,
    maxAttempts,
  });
};

const resolveBattlefieldGroupCollisionPositions = ({
  movingCardIds,
  targetPositions,
  orderedCardIds,
  getPosition,
  maxAttempts = 200,
}: {
  movingCardIds: string[];
  targetPositions: Record<string, { x: number; y: number } | undefined>;
  orderedCardIds: string[];
  getPosition: (cardId: string) => { x: number; y: number } | null | undefined;
  maxAttempts?: number;
}) => {
  if (movingCardIds.length === 0) return {} as Record<string, { x: number; y: number }>;

  const movingSet = new Set(movingCardIds);
  const otherIds = orderedCardIds.filter((id) => !movingSet.has(id));
  const occupied = new Set<string>();

  for (const otherId of otherIds) {
    const pos = getPosition(otherId);
    if (!pos) continue;
    const clamped = clampNormalizedPosition(pos);
    occupied.add(positionKey(clamped));
  }

  const resolved: Record<string, { x: number; y: number }> = {};
  const orderedMovingIds = movingCardIds.filter((id) => Boolean(targetPositions[id]));

  orderedMovingIds.forEach((id) => {
    const target = targetPositions[id];
    if (!target) return;
    const next = resolvePositionAgainstOccupied({
      targetPosition: target,
      occupied,
      maxAttempts,
    });
    resolved[id] = next;
    occupied.add(positionKey(next));
  });

  return resolved;
};

const bumpPosition = (
  position: { x: number; y: number },
  dx: number = GRID_STEP_X,
  dy: number = GRID_STEP_Y
) => clampNormalizedPosition({ x: position.x + dx, y: position.y + dy });

const findAvailablePositionNormalized = (
  start: { x: number; y: number },
  zoneCardIds: string[],
  cards: Record<string, { position: { x: number; y: number } }>,
  stepX: number = GRID_STEP_X,
  stepY: number = GRID_STEP_Y,
  maxChecks: number = 50
) => {
  const occupied = new Set<string>();
  zoneCardIds.forEach((id) => {
    const card = cards[id];
    if (card) {
      occupied.add(positionKey(clampNormalizedPosition(card.position)));
    }
  });

  let candidate = clampNormalizedPosition(start);
  let attempts = 0;
  while (occupied.has(positionKey(candidate)) && attempts < maxChecks) {
    candidate = clampNormalizedPosition({ x: candidate.x + stepX, y: candidate.y + stepY });
    attempts += 1;
  }

  return candidate;
};

const shuffle = <T,>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const getCardFaces = (card: Card) => card.scryfall?.card_faces ?? [];

const getCurrentFaceIndex = (card: Card): number => {
  const faces = getCardFaces(card);
  if (!faces.length) return 0;
  const index = card.currentFaceIndex ?? 0;
  if (index < 0) return 0;
  if (index >= faces.length) return faces.length - 1;
  return index;
};

const syncCardStatsToFace = (
  card: Card,
  faceIndex?: number,
  options?: { preserveExisting?: boolean }
): Card => {
  const faces = getCardFaces(card);
  const targetIndex = faceIndex ?? getCurrentFaceIndex(card);
  const targetFace = faces[targetIndex];
  if (!targetFace) return { ...card, currentFaceIndex: targetIndex };

  const hasPower = targetFace.power !== undefined;
  const hasToughness = targetFace.toughness !== undefined;
  const preserve = options?.preserveExisting;

  return {
    ...card,
    currentFaceIndex: targetIndex,
    power: preserve && card.power !== undefined ? card.power : hasPower ? targetFace.power : undefined,
    toughness:
      preserve && card.toughness !== undefined
        ? card.toughness
        : hasToughness
          ? targetFace.toughness
          : undefined,
    basePower: hasPower ? targetFace.power : undefined,
    baseToughness: hasToughness ? targetFace.toughness : undefined,
  };
};

const resetCardToFrontFace = (card: Card): Card => {
  const reset = syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0);
  if (!getCardFaces(card).length) {
    return {
      ...reset,
      power: reset.basePower ?? reset.power,
      toughness: reset.baseToughness ?? reset.toughness,
    };
  }
  return reset;
};

const TRANSFORM_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "dfc",
  "flip",
  "double_faced_token",
  "reversible_card",
  "meld",
]);

const isTransformableCard = (card: Card): boolean => {
  const faces = getCardFaces(card);
  if (faces.length < 2) return false;
  const layout = card.scryfall?.layout;
  return layout ? TRANSFORM_LAYOUTS.has(layout) : true;
};

const enforceZoneCounterRules = (counters: Counter[], zone?: Zone): Counter[] =>
  zone?.type === ZONE.BATTLEFIELD ? counters : [];

const mergeCounters = (existing: Counter[], incoming: Counter): Counter[] => {
  const idx = existing.findIndex((c) => c.type === incoming.type);
  if (idx >= 0) {
    const next = [...existing];
    next[idx] = { ...next[idx], count: next[idx].count + incoming.count };
    return next;
  }
  return [...existing, incoming];
};

const decrementCounter = (existing: Counter[], type: string, delta: number): Counter[] => {
  const idx = existing.findIndex((c) => c.type === type);
  if (idx === -1) return existing;

  const next = [...existing];
  const target = next[idx];
  const nextCount = target.count + delta;
  if (nextCount > 0) {
    next[idx] = { ...target, count: nextCount };
    return next;
  }
  next.splice(idx, 1);
  return next;
};

const isCommanderZoneType = (zoneType: ZoneType | typeof LEGACY_COMMAND_ZONE) =>
  zoneType === ZONE.COMMANDER || zoneType === LEGACY_COMMAND_ZONE;

const resolveControllerAfterMove = (card: Card, fromZone: Zone, toZone: Zone): string => {
  if (toZone.type === ZONE.BATTLEFIELD) {
    if (toZone.ownerId === card.ownerId) return card.ownerId;
    if (fromZone.ownerId !== toZone.ownerId) return toZone.ownerId;
  } else {
    if (card.controllerId !== card.ownerId) return card.ownerId;
  }
  return card.controllerId;
};

type FaceDownMoveResolution = {
  effectiveFaceDown: boolean;
  patchFaceDown?: boolean;
  effectiveFaceDownMode?: FaceDownMode;
  patchFaceDownMode?: FaceDownMode | null;
};

const resolveFaceDownAfterMove = ({
  fromZoneType,
  toZoneType,
  currentFaceDown,
  currentFaceDownMode,
  requestedFaceDown,
  requestedFaceDownMode,
}: {
  fromZoneType: string;
  toZoneType: string;
  currentFaceDown: boolean;
  currentFaceDownMode?: FaceDownMode;
  requestedFaceDown: boolean | undefined;
  requestedFaceDownMode?: FaceDownMode;
}): FaceDownMoveResolution => {
  if (requestedFaceDown !== undefined) {
    const nextMode = requestedFaceDown ? requestedFaceDownMode : undefined;
    return {
      effectiveFaceDown: requestedFaceDown,
      patchFaceDown: requestedFaceDown,
      effectiveFaceDownMode: nextMode,
      patchFaceDownMode: requestedFaceDown
        ? requestedFaceDownMode ?? null
        : currentFaceDownMode
          ? null
          : undefined,
    };
  }

  const battlefieldToBattlefield =
    fromZoneType === ZONE.BATTLEFIELD && toZoneType === ZONE.BATTLEFIELD;
  if (battlefieldToBattlefield) {
    return {
      effectiveFaceDown: currentFaceDown,
      patchFaceDown: undefined,
      effectiveFaceDownMode: currentFaceDown ? currentFaceDownMode : undefined,
      patchFaceDownMode: currentFaceDown ? undefined : currentFaceDownMode ? null : undefined,
    };
  }

  return {
    effectiveFaceDown: false,
    patchFaceDown: false,
    effectiveFaceDownMode: undefined,
    patchFaceDownMode: currentFaceDownMode ? null : undefined,
  };
};

const computeRevealPatchAfterMove = ({
  fromZoneType,
  toZoneType,
  effectiveFaceDown,
}: {
  fromZoneType: string;
  toZoneType: string;
  effectiveFaceDown: boolean;
}): Pick<Card, "knownToAll" | "revealedToAll" | "revealedTo"> | null => {
  const toHidden =
    toZoneType === ZONE.HAND || toZoneType === ZONE.LIBRARY || toZoneType === ZONE.SIDEBOARD;
  const enteringLibrary = toZoneType === ZONE.LIBRARY && fromZoneType !== ZONE.LIBRARY;
  const faceDownBattlefield = toZoneType === ZONE.BATTLEFIELD && effectiveFaceDown === true;

  if (enteringLibrary || faceDownBattlefield) {
    return { knownToAll: false, revealedToAll: false, revealedTo: [] };
  }

  if (!toHidden && !faceDownBattlefield) {
    return { knownToAll: true, revealedToAll: false, revealedTo: [] };
  }

  return null;
};

const buildRevealPatch = (
  card: Card,
  reveal: { toAll?: boolean; to?: string[] } | null
): Pick<Card, "revealedToAll" | "revealedTo"> => {
  if (!reveal) {
    return { revealedToAll: false, revealedTo: [] };
  }

  if (reveal.toAll) {
    return { revealedToAll: true, revealedTo: [] };
  }

  const to = Array.isArray(reveal.to)
    ? reveal.to.filter((id) => typeof id === "string" && id !== card.ownerId)
    : [];
  const unique = Array.from(new Set(to));

  return { revealedToAll: false, revealedTo: unique.slice(0, MAX_REVEALED_TO) };
};

const computeDuplicateTokenPosition = (params: {
  sourceCard: Card;
  orderedCardIds: string[];
  cardsById: Record<string, Card>;
}): Card["position"] => {
  const basePosition = bumpPosition(clampNormalizedPosition(params.sourceCard.position));
  return findAvailablePositionNormalized(basePosition, params.orderedCardIds, params.cardsById);
};

const buildDuplicateTokenCard = (params: {
  sourceCard: Card;
  newCardId: string;
  position: Card["position"];
}): Card => ({
  ...params.sourceCard,
  id: params.newCardId,
  isToken: true,
  isCommander: false,
  commanderTax: 0,
  position: params.position,
  counters: params.sourceCard.counters.map((counter) => ({ ...counter })),
});

const computeTransformTargetIndex = (
  card: Card,
  faceIndex?: number
): { targetIndex: number; toFaceName?: string } => {
  const faces = getCardFaces(card);
  const targetIndex = faces.length
    ? typeof faceIndex === "number"
      ? Math.min(Math.max(faceIndex, 0), faces.length - 1)
      : (getCurrentFaceIndex(card) + 1) % faces.length
    : 0;

  return { targetIndex, toFaceName: faces[targetIndex]?.name };
};

const readZoneCardIds = (maps: Maps, zoneId: string, zone?: Zone): string[] => {
  const order = maps.zoneCardOrders.get(zoneId);
  if (order instanceof Y.Array) {
    return uniqueStrings(order.toArray());
  }
  return uniqueStrings(zone?.cardIds ?? []);
};

const syncZoneOrder = (maps: Maps, zoneId: string, ids: string[]) => {
  const unique = uniqueStrings(ids);
  const order = maps.zoneCardOrders.get(zoneId);
  if (order instanceof Y.Array) {
    order.delete(0, order.length);
    if (unique.length) order.insert(0, unique);
    return;
  }
  const next = new Y.Array<string>();
  if (unique.length) next.insert(0, unique);
  maps.zoneCardOrders.set(zoneId, next);
};

const readZone = (maps: Maps, zoneId: string): Zone | null => {
  const raw = readRecord(maps.zones.get(zoneId));
  if (!raw) return null;
  const zone = coerceZone(raw);
  const cardIds = readZoneCardIds(maps, zoneId, zone);
  return { ...zone, id: zoneId, cardIds };
};

const readCard = (maps: Maps, cardId: string): Card | null => {
  const raw = readRecord(maps.cards.get(cardId));
  if (!raw) return null;
  return { ...coerceCard(raw), id: cardId };
};

const readPlayer = (maps: Maps, playerId: string): Player | null => {
  const raw = readRecord(maps.players.get(playerId));
  if (!raw) return null;
  return { ...coercePlayer(raw), id: playerId };
};

const writeZone = (maps: Maps, zone: Zone) => {
  const cardIds = uniqueStrings(zone.cardIds ?? []);
  maps.zones.set(zone.id, { ...zone, cardIds });
  syncZoneOrder(maps, zone.id, cardIds);
};

const writeCard = (maps: Maps, card: Card) => {
  maps.cards.set(card.id, card);
};

const writePlayer = (maps: Maps, player: Player) => {
  maps.players.set(player.id, player);
  const order = maps.playerOrder;
  if (!order.toArray().includes(player.id)) {
    order.push([player.id]);
  }
};

const removeFromArray = (list: string[], id: string) =>
  list.filter((value) => value !== id);

const placeCardId = (
  list: string[],
  cardId: string,
  placement: "top" | "bottom"
) => {
  const without = removeFromArray(list, cardId);
  if (placement === "bottom") return [cardId, ...without];
  return [...without, cardId];
};

const buildSnapshot = (maps: Maps): Snapshot => {
  const players: Record<string, Player> = {};
  const zones: Record<string, Zone> = {};
  const cards: Record<string, Card> = {};
  const globalCounters: Record<string, string> = {};
  const battlefieldViewScale: Record<string, number> = {};
  const meta: Record<string, unknown> = {};

  maps.players.forEach((value, key) => {
    const raw = readRecord(value);
    if (!raw) return;
    players[String(key)] = { ...coercePlayer(raw), id: String(key) };
  });

  maps.zones.forEach((value, key) => {
    const raw = readRecord(value);
    if (!raw) return;
    const zoneId = String(key);
    const zone = coerceZone(raw);
    zones[zoneId] = { ...zone, id: zoneId, cardIds: readZoneCardIds(maps, zoneId, zone) };
  });

  maps.cards.forEach((value, key) => {
    const raw = readRecord(value);
    if (!raw) return;
    cards[String(key)] = { ...coerceCard(raw), id: String(key) };
  });

  maps.globalCounters.forEach((value, key) => {
    if (typeof value === "string") globalCounters[String(key)] = value;
  });

  maps.battlefieldViewScale.forEach((value, key) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      battlefieldViewScale[String(key)] = value;
    }
  });

  maps.meta.forEach((value, key) => {
    if (typeof key === "string") meta[key] = value;
  });

  const playerOrder = maps.playerOrder
    .toArray()
    .filter((id): id is string => typeof id === "string");

  return { players, zones, cards, globalCounters, battlefieldViewScale, meta, playerOrder };
};

const applyRecordToMap = (map: Y.Map<unknown>, next: Record<string, unknown>) => {
  const seen = new Set(Object.keys(next));
  map.forEach((_value, key) => {
    const keyStr = String(key);
    if (!seen.has(keyStr)) map.delete(keyStr);
  });
  Object.entries(next).forEach(([key, value]) => {
    map.set(key, value);
  });
};

const clearYMap = (map: Y.Map<unknown>) => {
  map.forEach((_value, key) => {
    map.delete(key);
  });
};

const syncPlayerOrder = (order: Y.Array<string>, ids: string[]) => {
  order.delete(0, order.length);
  if (ids.length) order.insert(0, ids);
};

const resolveNextHostId = (players: Record<string, Player>, order: string[]): string | null => {
  for (const id of order) {
    if (players[id]) return id;
  }
  const fallback = Object.keys(players).sort()[0];
  return fallback ?? null;
};

const applyRevealToCard = (card: Card, reveal?: HiddenReveal): Card => {
  const revealedToAll = reveal?.toAll === true;
  const revealedTo = Array.isArray(reveal?.toPlayers) ? reveal?.toPlayers ?? [] : [];
  return {
    ...card,
    revealedToAll,
    revealedTo: revealedTo.length ? revealedTo : [],
  };
};

const buildCardIdentity = (card: Card): CardIdentity => ({
  name: card.name ?? "Card",
  imageUrl: card.imageUrl,
  oracleText: card.oracleText,
  typeLine: card.typeLine,
  scryfallId: card.scryfallId,
  scryfall: card.scryfall,
  isToken: card.isToken,
});

const mergeCardIdentity = (card: Card, identity?: CardIdentity | null): Card =>
  identity ? { ...card, ...identity } : card;

const stripCardIdentity = (card: Card): Card => ({
  ...card,
  name: "Card",
  imageUrl: undefined,
  oracleText: undefined,
  typeLine: undefined,
  scryfallId: undefined,
  scryfall: undefined,
});

const buildLibraryOrderKey = (index: number) => String(index).padStart(6, "0");

const extractReveal = (card: Card): HiddenReveal => {
  const reveal: HiddenReveal = {};
  if (card.revealedToAll) {
    reveal.toAll = true;
  }
  const toPlayers = Array.isArray(card.revealedTo)
    ? uniqueStrings(card.revealedTo)
    : [];
  if (toPlayers.length) {
    reveal.toPlayers = toPlayers;
  }
  return reveal;
};

const updatePlayerCounts = (maps: Maps, hidden: HiddenState, playerId: string) => {
  const player = readPlayer(maps, playerId);
  if (!player) return;
  const handCount = hidden.handOrder[playerId]?.length ?? 0;
  const libraryCount = hidden.libraryOrder[playerId]?.length ?? 0;
  const sideboardCount = hidden.sideboardOrder[playerId]?.length ?? 0;
  writePlayer(maps, { ...player, handCount, libraryCount, sideboardCount });
};

const clearFaceDownStateForCard = (maps: Maps, hidden: HiddenState, cardId: string) => {
  Reflect.deleteProperty(hidden.faceDownBattlefield, cardId);
  Reflect.deleteProperty(hidden.faceDownReveals, cardId);
  maps.faceDownRevealsToAll.delete(cardId);
};

const syncLibraryRevealsToAllForPlayer = (
  maps: Maps,
  hidden: HiddenState,
  playerId: string,
  libraryZoneId?: string
) => {
  const player = readPlayer(maps, playerId);
  if (!player) return;
  const order = hidden.libraryOrder[playerId] ?? [];
  const libraryCardIds = new Set(order);
  const toAllIds = new Set<string>();
  const topCardId = order.length ? order[order.length - 1] : null;

  order.forEach((cardId) => {
    if (hidden.libraryReveals[cardId]?.toAll) {
      toAllIds.add(cardId);
    }
  });

  if (player.libraryTopReveal === "all" && topCardId) {
    toAllIds.add(topCardId);
  }

  let resolvedLibraryZoneId = libraryZoneId;
  if (!resolvedLibraryZoneId) {
    maps.zones.forEach((value, key) => {
      const raw = readRecord(value);
      if (!raw) return;
      const zone = coerceZone(raw);
      if (zone.ownerId === playerId && zone.type === ZONE.LIBRARY) {
        resolvedLibraryZoneId = String(key);
      }
    });
  }

  maps.libraryRevealsToAll.forEach((value, key) => {
    const cardId = String(key);
    if (libraryCardIds.has(cardId)) {
      if (!toAllIds.has(cardId)) {
        maps.libraryRevealsToAll.delete(cardId);
      }
      return;
    }
    const entry = readRecord(value);
    const entryOwnerId = entry && typeof entry.ownerId === "string" ? entry.ownerId : undefined;
    if (entryOwnerId && entryOwnerId === playerId) {
      maps.libraryRevealsToAll.delete(cardId);
      return;
    }
    if (resolvedLibraryZoneId && hidden.cards[cardId]?.zoneId === resolvedLibraryZoneId) {
      maps.libraryRevealsToAll.delete(cardId);
    }
  });

  toAllIds.forEach((cardId) => {
    const card = hidden.cards[cardId];
    if (!card) return;
    const index = order.indexOf(cardId);
    const orderKey = buildLibraryOrderKey(index >= 0 ? index : order.length);
    maps.libraryRevealsToAll.set(cardId, {
      card: buildCardIdentity(card),
      orderKey,
      ownerId: card.ownerId,
    });
  });
};

export const buildOverlayForViewer = (params: {
  maps: Maps;
  hidden: HiddenState;
  viewerId?: string;
  viewerRole?: "player" | "spectator";
  libraryView?: { playerId: string; count?: number };
}): PrivateOverlayPayload => {
  const snapshot = buildSnapshot(params.maps);
  const overlayCardsById = new Map<string, Card>();
  const addOverlayCard = (card: Card) => {
    if (!overlayCardsById.has(card.id)) {
      overlayCardsById.set(card.id, card);
    }
  };
  const zoneCardOrders: Record<string, string[]> = {};
  const viewerRole = params.viewerRole ?? "player";
  const viewerId = params.viewerId;

  const handZoneIds: Record<string, string> = {};
  const libraryZoneIds: Record<string, string> = {};
  Object.values(snapshot.zones).forEach((zone) => {
    if (zone.type === ZONE.HAND) handZoneIds[zone.ownerId] = zone.id;
    if (zone.type === ZONE.LIBRARY) libraryZoneIds[zone.ownerId] = zone.id;
  });

  const canSeeHand = (ownerId: string) =>
    viewerRole === "spectator" || (viewerId && viewerId === ownerId);

  Object.entries(params.hidden.handOrder).forEach(([ownerId, cardIds]) => {
    const handZoneId = handZoneIds[ownerId];
    cardIds.forEach((cardId) => {
      const card = params.hidden.cards[cardId];
      if (!card) return;
      const reveal = params.hidden.handReveals[cardId];
      const allowed =
        canSeeHand(ownerId) ||
        reveal?.toAll === true ||
        (viewerId && Array.isArray(reveal?.toPlayers) && reveal?.toPlayers.includes(viewerId));
      if (!allowed) return;
      const nextCard = applyRevealToCard(card, reveal);
      addOverlayCard({
        ...nextCard,
        zoneId: handZoneId ?? nextCard.zoneId,
      });
    });
  });

  if (params.libraryView) {
    const { playerId, count } = params.libraryView;
    if (viewerRole !== "spectator" && (!viewerId || viewerId === playerId)) {
      const libraryZoneId = libraryZoneIds[playerId];
      const order = params.hidden.libraryOrder[playerId] ?? [];
      const selected =
        typeof count === "number" && count > 0 ? order.slice(-count) : order.slice();
      if (libraryZoneId) {
        zoneCardOrders[libraryZoneId] = selected;
      }
      selected.forEach((cardId) => {
        const card = params.hidden.cards[cardId];
        if (!card) return;
        const reveal = params.hidden.libraryReveals[cardId];
        const nextCard = applyRevealToCard(card, reveal);
        addOverlayCard({
          ...nextCard,
          zoneId: libraryZoneId ?? nextCard.zoneId,
        });
      });
    }
  }

  Object.entries(params.hidden.libraryOrder).forEach(([ownerId, order]) => {
    const mode = snapshot.players[ownerId]?.libraryTopReveal;
    if (!mode) return;
    const canSeeTop =
      mode === "all" || (viewerRole !== "spectator" && viewerId && viewerId === ownerId);
    if (!canSeeTop) return;
    const topCardId = order.length ? order[order.length - 1] : null;
    if (!topCardId) return;
    const card = params.hidden.cards[topCardId];
    if (!card) return;
    const baseReveal = params.hidden.libraryReveals[topCardId];
    const topReveal: HiddenReveal | undefined =
      mode === "all"
        ? { toAll: true }
        : viewerId
          ? { toPlayers: [viewerId] }
          : undefined;
    const mergedReveal = baseReveal || topReveal
      ? {
          ...(baseReveal?.toAll || topReveal?.toAll ? { toAll: true } : null),
          ...(baseReveal?.toPlayers?.length || topReveal?.toPlayers?.length
            ? {
                toPlayers: uniqueStrings([
                  ...(baseReveal?.toPlayers ?? []),
                  ...(topReveal?.toPlayers ?? []),
                ]),
              }
            : null),
        }
      : undefined;
    const nextCard = applyRevealToCard(card, mergedReveal);
    addOverlayCard({
      ...nextCard,
      zoneId: libraryZoneIds[ownerId] ?? nextCard.zoneId,
    });
  });

  Object.values(snapshot.cards).forEach((card) => {
    if (!card.faceDown || card.zoneId === undefined) return;
    const reveal = params.hidden.faceDownReveals[card.id];
    const canSee =
      viewerRole === "spectator" ||
      (viewerId && card.controllerId === viewerId) ||
      reveal?.toAll === true ||
      (viewerId && Array.isArray(reveal?.toPlayers) && reveal?.toPlayers.includes(viewerId));
    if (!canSee) return;
    const identity = params.hidden.faceDownBattlefield[card.id];
    if (!identity) return;
    const overlayCard = applyRevealToCard({ ...card, ...identity }, reveal);
    addOverlayCard(overlayCard);
  });

  return {
    cards: Array.from(overlayCardsById.values()),
    ...(Object.keys(zoneCardOrders).length ? { zoneCardOrders } : null),
  };
};

const migrateHiddenStateFromSnapshot = (maps: Maps): HiddenState => {
  const snapshot = buildSnapshot(maps);
  const hidden = createEmptyHiddenState();

  Object.values(snapshot.zones).forEach((zone) => {
    if (zone.type === ZONE.HAND) {
      hidden.handOrder[zone.ownerId] = uniqueStrings(zone.cardIds);
    } else if (zone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[zone.ownerId] = uniqueStrings(zone.cardIds);
    } else if (zone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[zone.ownerId] = uniqueStrings(zone.cardIds);
    }
  });

  const handRevealsToAll: Record<string, CardIdentity> = {};
  const libraryRevealsToAll: Record<
    string,
    { card: CardIdentity; orderKey: string; ownerId?: string }
  > = {};
  const faceDownRevealsToAll: Record<string, CardIdentity> = {};

  Object.values(snapshot.cards).forEach((card) => {
    const zone = snapshot.zones[card.zoneId];
    if (zone && isHiddenZoneType(zone.type)) {
      hidden.cards[card.id] = { ...card };
      const reveal = extractReveal(card);
      if (reveal.toAll || (reveal.toPlayers && reveal.toPlayers.length)) {
        if (zone.type === ZONE.HAND) {
          hidden.handReveals[card.id] = reveal;
          if (reveal.toAll) handRevealsToAll[card.id] = buildCardIdentity(card);
        } else if (zone.type === ZONE.LIBRARY) {
          hidden.libraryReveals[card.id] = reveal;
          if (reveal.toAll) {
            const order = hidden.libraryOrder[zone.ownerId] ?? [];
            const index = order.indexOf(card.id);
            const orderKey = buildLibraryOrderKey(index >= 0 ? index : order.length);
            libraryRevealsToAll[card.id] = {
              card: buildCardIdentity(card),
              orderKey,
              ownerId: card.ownerId,
            };
          }
        }
      }
      maps.cards.delete(card.id);
      return;
    }

    let nextCard: Card | null = null;

    if (card.faceDown) {
      hidden.faceDownBattlefield[card.id] = buildCardIdentity(card);
      const reveal = extractReveal(card);
      if (reveal.toAll || (reveal.toPlayers && reveal.toPlayers.length)) {
        hidden.faceDownReveals[card.id] = reveal;
        if (reveal.toAll) {
          faceDownRevealsToAll[card.id] = buildCardIdentity(card);
        }
      }
      nextCard = stripCardIdentity({
        ...card,
        knownToAll: false,
        revealedToAll: false,
        revealedTo: [],
      });
    }

    if (card.revealedToAll || (card.revealedTo && card.revealedTo.length)) {
      nextCard = {
        ...(nextCard ?? card),
        revealedToAll: false,
        revealedTo: [],
      };
    }

    if (nextCard) {
      writeCard(maps, nextCard);
    }
  });

  Object.values(snapshot.zones).forEach((zone) => {
    if (zone.type === ZONE.HAND) {
      writeZone(maps, { ...zone, cardIds: hidden.handOrder[zone.ownerId] ?? [] });
      return;
    }
    if (zone.type === ZONE.LIBRARY || zone.type === ZONE.SIDEBOARD) {
      writeZone(maps, { ...zone, cardIds: [] });
    }
  });

  Object.keys(snapshot.players).forEach((playerId) => {
    updatePlayerCounts(maps, hidden, playerId);
  });

  clearYMap(maps.handRevealsToAll);
  clearYMap(maps.libraryRevealsToAll);
  clearYMap(maps.faceDownRevealsToAll);
  Object.entries(handRevealsToAll).forEach(([cardId, identity]) => {
    maps.handRevealsToAll.set(cardId, identity);
  });
  Object.entries(libraryRevealsToAll).forEach(([cardId, entry]) => {
    maps.libraryRevealsToAll.set(cardId, entry);
  });
  Object.entries(faceDownRevealsToAll).forEach(([cardId, identity]) => {
    maps.faceDownRevealsToAll.set(cardId, identity);
  });

  return hidden;
};

export const applyIntentToDoc = (doc: Y.Doc, intent: Intent, hidden: HiddenState): ApplyResult => {
  if (!intent || typeof intent.type !== "string") {
    return { ok: false, error: "invalid intent" };
  }
  const payload = isRecord(intent.payload) ? intent.payload : {};
  const maps = getMaps(doc);
  const logEvents: LogEvent[] = [];
  let hiddenChanged = false;
  const pushLogEvent = (eventId: string, logPayload: Record<string, unknown>) => {
    logEvents.push({ eventId, payload: logPayload });
  };
  const markHiddenChanged = () => {
    hiddenChanged = true;
  };
  const readActorId = (value: unknown) => (typeof value === "string" ? value : undefined);
  const actorId = readActorId(payload.actorId);
  const prepareCardAdd = (
    raw: unknown
  ): { card: Card; zoneId: string } | { error: string } => {
    if (!actorId) return { error: "missing actor" };
    const card = isRecord(raw) ? coerceCard(raw) : null;
    if (!card || typeof card.id !== "string") return { error: "invalid card" };
    const normalized = normalizeCardForAdd(card);
    const zone = readZone(maps, normalized.zoneId);
    if (!zone) return { error: "zone not found" };
    const permission = canAddCard(actorId, normalized, zone);
    if (!permission.allowed) {
      return { error: permission.reason ?? "not permitted" };
    }
    return { card: normalized, zoneId: zone.id };
  };
  const applyPreparedCardAdd = (
    prepared: { card: Card; zoneId: string }
  ): InnerApplyResult => {
    if (!actorId) return { ok: false, error: "missing actor" };
    const zone = readZone(maps, prepared.zoneId);
    if (!zone) return { ok: false, error: "zone not found" };
    const nextCounters = enforceZoneCounterRules(prepared.card.counters, zone ?? undefined);
    const nextCard = { ...prepared.card, counters: nextCounters };
    if (zone && isHiddenZoneType(zone.type)) {
      hidden.cards[nextCard.id] = nextCard;
      if (zone.type === ZONE.HAND) {
        const nextOrder = placeCardId(hidden.handOrder[zone.ownerId] ?? [], nextCard.id, "top");
        hidden.handOrder[zone.ownerId] = nextOrder;
        writeZone(maps, { ...zone, cardIds: nextOrder });
      } else if (zone.type === ZONE.LIBRARY) {
        hidden.libraryOrder[zone.ownerId] = placeCardId(
          hidden.libraryOrder[zone.ownerId] ?? [],
          nextCard.id,
          "top"
        );
      } else if (zone.type === ZONE.SIDEBOARD) {
        hidden.sideboardOrder[zone.ownerId] = placeCardId(
          hidden.sideboardOrder[zone.ownerId] ?? [],
          nextCard.id,
          "top"
        );
      }
      updatePlayerCounts(maps, hidden, zone.ownerId);
      markHiddenChanged();
      return { ok: true };
    }
    const enteringFaceDownBattlefield = zone?.type === ZONE.BATTLEFIELD && nextCard.faceDown;
    const publicCard = enteringFaceDownBattlefield
      ? stripCardIdentity({
          ...nextCard,
          knownToAll: false,
          revealedToAll: false,
          revealedTo: [],
        })
      : nextCard;
    writeCard(maps, publicCard);
    if (zone) {
      const nextIds = placeCardId(zone.cardIds, nextCard.id, "top");
      writeZone(maps, { ...zone, cardIds: nextIds });
    }
    if (enteringFaceDownBattlefield) {
      hidden.faceDownBattlefield[nextCard.id] = buildCardIdentity(nextCard);
      hidden.faceDownReveals[nextCard.id] = {};
      maps.faceDownRevealsToAll.delete(nextCard.id);
      markHiddenChanged();
    }
    if (nextCard.isToken) {
      pushLogEvent("card.tokenCreate", {
        actorId,
        playerId: nextCard.ownerId,
        tokenName: nextCard.name ?? "Token",
        count: 1,
      });
    }
    return { ok: true };
  };

  const apply = (): InnerApplyResult => {
    if (!actorId) return { ok: false, error: "missing actor" };
    switch (intent.type) {
      case "player.join": {
        const player = isRecord(payload.player) ? coercePlayer(payload.player) : null;
        if (!player || typeof player.id !== "string") {
          return { ok: false, error: "invalid player" };
        }
        if (player.id !== actorId) {
          return { ok: false, error: "actor mismatch" };
        }

        const existing = readPlayer(maps, player.id);
        if (!existing) {
          const locked = Boolean(maps.meta.get("locked"));
          if (locked) return { ok: false, error: "room locked" };
          if (maps.players.size >= MAX_PLAYERS) {
            return { ok: false, error: "room full" };
          }
          writePlayer(maps, player);
        }

        let initializedHidden = false;
        if (!hidden.handOrder[player.id]) {
          hidden.handOrder[player.id] = [];
          initializedHidden = true;
        }
        if (!hidden.libraryOrder[player.id]) {
          hidden.libraryOrder[player.id] = [];
          initializedHidden = true;
        }
        if (!hidden.sideboardOrder[player.id]) {
          hidden.sideboardOrder[player.id] = [];
          initializedHidden = true;
        }
        if (initializedHidden) {
          updatePlayerCounts(maps, hidden, player.id);
          markHiddenChanged();
        }
        const currentHost = maps.meta.get("hostId");
        if (typeof currentHost !== "string" || !maps.players.get(currentHost)) {
          maps.meta.set("hostId", player.id);
        }
        return { ok: true };
      }
      case "player.update": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const updates = isRecord(payload.updates) ? payload.updates : null;
        if (!playerId || !updates) return { ok: false, error: "invalid player update" };
        const current = readPlayer(maps, playerId);
        if (!current) return { ok: false, error: "player not found" };
        const permission = canUpdatePlayer(actorId, current, updates);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        if (typeof updates.life === "number" && updates.life !== current.life) {
          const from = typeof current.life === "number" ? current.life : 0;
          const to = updates.life;
          pushLogEvent("player.life", {
            actorId,
            playerId,
            from,
            to,
            delta: to - from,
          });
        }
        if (
          Object.prototype.hasOwnProperty.call(updates, "libraryTopReveal") &&
          updates.libraryTopReveal !== current.libraryTopReveal
        ) {
          const enabled = Boolean(updates.libraryTopReveal);
          const mode = enabled ? updates.libraryTopReveal : current.libraryTopReveal;
          if (typeof mode === "string") {
            pushLogEvent("library.topReveal", {
              actorId,
              playerId,
              enabled,
              mode,
            });
          }
          writePlayer(maps, { ...current, ...updates, id: playerId });
          syncLibraryRevealsToAllForPlayer(maps, hidden, playerId);
          markHiddenChanged();
          return { ok: true };
        }
        writePlayer(maps, { ...current, ...updates, id: playerId });
        return { ok: true };
      }
      case "player.leave": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        if (playerId !== actorId) {
          return { ok: false, error: "actor mismatch" };
        }

        const snapshot = buildSnapshot(maps);
        const nextPlayers = { ...snapshot.players };
        delete nextPlayers[playerId];

        const nextOrder = snapshot.playerOrder.filter((id) => id !== playerId);

        const nextZones: Record<string, Zone> = {};
        Object.values(snapshot.zones).forEach((zone) => {
          if (zone.ownerId === playerId) return;
          nextZones[zone.id] = { ...zone };
        });

        const nextCards: Record<string, Card> = {};
        Object.values(snapshot.cards).forEach((card) => {
          if (card.ownerId === playerId) return;
          const zone = nextZones[card.zoneId];
          if (!zone) return;
          nextCards[card.id] = { ...card };
        });

        Object.values(nextZones).forEach((zone) => {
          zone.cardIds = zone.cardIds.filter((id) => nextCards[id]);
        });

        const nextMeta = { ...snapshot.meta };
        const hostId = typeof nextMeta.hostId === "string" ? (nextMeta.hostId as string) : null;
        if (!hostId || hostId === playerId || !nextPlayers[hostId]) {
          nextMeta.hostId = resolveNextHostId(nextPlayers, nextOrder);
        }

        applyRecordToMap(maps.players, nextPlayers as Record<string, unknown>);
        applyRecordToMap(maps.cards, nextCards as Record<string, unknown>);
        applyRecordToMap(maps.zones, nextZones as Record<string, unknown>);
        applyRecordToMap(maps.meta, nextMeta);
        syncPlayerOrder(maps.playerOrder, nextOrder);
        maps.battlefieldViewScale.delete(playerId);

        Object.values(nextZones).forEach((zone) => {
          syncZoneOrder(maps, zone.id, zone.cardIds);
        });

        maps.zoneCardOrders.forEach((_value, key) => {
          const zoneId = String(key);
          if (!nextZones[zoneId]) maps.zoneCardOrders.delete(zoneId);
        });

        const hiddenRemoveIds = Object.values(hidden.cards)
          .filter((card) => card.ownerId === playerId)
          .map((card) => card.id);
        hiddenRemoveIds.forEach((id) => {
          Reflect.deleteProperty(hidden.cards, id);
          Reflect.deleteProperty(hidden.handReveals, id);
          Reflect.deleteProperty(hidden.libraryReveals, id);
          maps.handRevealsToAll.delete(id);
          maps.libraryRevealsToAll.delete(id);
        });
        Reflect.deleteProperty(hidden.handOrder, playerId);
        Reflect.deleteProperty(hidden.libraryOrder, playerId);
        Reflect.deleteProperty(hidden.sideboardOrder, playerId);
        Object.keys(hidden.faceDownBattlefield).forEach((id) => {
          if (!maps.cards.get(id)) {
            Reflect.deleteProperty(hidden.faceDownBattlefield, id);
            Reflect.deleteProperty(hidden.faceDownReveals, id);
            maps.faceDownRevealsToAll.delete(id);
          }
        });
        markHiddenChanged();
        return { ok: true };
      }
      case "zone.add": {
        const zone = isRecord(payload.zone) ? coerceZone(payload.zone) : null;
        if (!zone || typeof zone.id !== "string") return { ok: false, error: "invalid zone" };
        const existing = readZone(maps, zone.id);
        if (existing) {
          if (existing.ownerId !== zone.ownerId || existing.type !== zone.type) {
            return { ok: false, error: "zone mismatch" };
          }
          if (existing.ownerId !== actorId) {
            return { ok: false, error: "Only zone owner may add zones" };
          }
          return { ok: true };
        }
        if (zone.ownerId !== actorId) {
          return { ok: false, error: "Only zone owner may add zones" };
        }
        const nextCardIds = uniqueStrings(zone.cardIds ?? []);
        const normalized = {
          ...zone,
          cardIds:
            zone.type === ZONE.HAND ? nextCardIds : isHiddenZoneType(zone.type) ? [] : nextCardIds,
        } as Zone;
        writeZone(maps, normalized);
        if (isHiddenZoneType(zone.type)) {
          if (zone.type === ZONE.HAND && !hidden.handOrder[zone.ownerId]) {
            hidden.handOrder[zone.ownerId] = normalized.cardIds;
          }
          if (zone.type === ZONE.LIBRARY && !hidden.libraryOrder[zone.ownerId]) {
            hidden.libraryOrder[zone.ownerId] = [];
          }
          if (zone.type === ZONE.SIDEBOARD && !hidden.sideboardOrder[zone.ownerId]) {
            hidden.sideboardOrder[zone.ownerId] = [];
          }
          updatePlayerCounts(maps, hidden, zone.ownerId);
          markHiddenChanged();
        }
        return { ok: true };
      }
      case "zone.reorder": {
        const zoneId = typeof payload.zoneId === "string" ? payload.zoneId : null;
        const orderedCardIds = Array.isArray(payload.orderedCardIds)
          ? uniqueStrings(payload.orderedCardIds as unknown[])
          : null;
        if (!zoneId || !orderedCardIds) return { ok: false, error: "invalid reorder" };
        const zone = readZone(maps, zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        if (zone.ownerId !== actorId) {
          return { ok: false, error: "Only zone owner may reorder cards" };
        }
        const currentOrder = isHiddenZoneType(zone.type)
          ? zone.type === ZONE.HAND
            ? hidden.handOrder[zone.ownerId] ?? []
            : zone.type === ZONE.LIBRARY
              ? hidden.libraryOrder[zone.ownerId] ?? []
              : hidden.sideboardOrder[zone.ownerId] ?? []
          : zone.cardIds;
        if (!hasSameMembers(currentOrder, orderedCardIds)) {
          return { ok: false, error: "invalid reorder" };
        }
        if (zone.type === ZONE.HAND) {
          hidden.handOrder[zone.ownerId] = orderedCardIds;
          writeZone(maps, { ...zone, cardIds: orderedCardIds });
          updatePlayerCounts(maps, hidden, zone.ownerId);
          markHiddenChanged();
          return { ok: true };
        }
        if (zone.type === ZONE.LIBRARY) {
          hidden.libraryOrder[zone.ownerId] = orderedCardIds;
          updatePlayerCounts(maps, hidden, zone.ownerId);
          syncLibraryRevealsToAllForPlayer(maps, hidden, zone.ownerId, zone.id);
          markHiddenChanged();
          return { ok: true };
        }
        if (zone.type === ZONE.SIDEBOARD) {
          hidden.sideboardOrder[zone.ownerId] = orderedCardIds;
          updatePlayerCounts(maps, hidden, zone.ownerId);
          markHiddenChanged();
          return { ok: true };
        }
        writeZone(maps, { ...zone, cardIds: orderedCardIds });
        return { ok: true };
      }
      case "room.lock": {
        const locked = Boolean(payload.locked);
        const hostId = maps.meta.get("hostId");
        if (typeof hostId === "string" && hostId !== actorId) {
          return { ok: false, error: "Only host may lock the room" };
        }
        maps.meta.set("locked", locked);
        return { ok: true };
      }
      case "ui.battlefieldScale.set": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const scaleRaw = typeof payload.scale === "number" ? payload.scale : null;
        if (!playerId || scaleRaw === null) return { ok: false, error: "invalid scale" };
        if (playerId !== actorId) {
          return { ok: false, error: "actor mismatch" };
        }
        maps.battlefieldViewScale.set(playerId, clampNumber(scaleRaw, 0.5, 1));
        return { ok: true };
      }
      case "counter.global.add": {
        const counterType = typeof payload.counterType === "string" ? payload.counterType : null;
        const color = typeof payload.color === "string" ? payload.color : null;
        if (!counterType || !color) return { ok: false, error: "invalid counter" };
        if (!maps.globalCounters.get(counterType)) {
          maps.globalCounters.set(counterType, color);
          pushLogEvent("counter.global.add", {
            counterType,
            color,
            actorId,
          });
        }
        return { ok: true };
      }
      case "card.counter.adjust": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        if (!cardId) return { ok: false, error: "invalid card" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        const permission = canModifyCardState(actorId, card, zone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }

        if (isRecord(payload.counter) && typeof payload.counter.type === "string") {
          const counter: Counter = {
            type: payload.counter.type,
            count:
              typeof payload.counter.count === "number" && Number.isFinite(payload.counter.count)
                ? Math.floor(payload.counter.count)
                : 0,
            ...(typeof payload.counter.color === "string"
              ? { color: payload.counter.color }
              : null),
          };
          const nextCounters = mergeCounters(card.counters, counter);
          const prevCount =
            card.counters.find((entry) => entry.type === counter.type)?.count ?? 0;
          const nextCount =
            nextCounters.find((entry) => entry.type === counter.type)?.count ?? prevCount;
          const delta = nextCount - prevCount;
          if (delta > 0) {
            pushLogEvent("counter.add", {
              actorId,
              cardId,
              zoneId: card.zoneId,
              counterType: counter.type,
              delta,
              newTotal: nextCount,
              cardName: card.name,
            });
          }
          writeCard(maps, { ...card, counters: nextCounters });
          return { ok: true };
        }

        const counterType = typeof payload.counterType === "string" ? payload.counterType : null;
        const delta = typeof payload.delta === "number" ? payload.delta : -1;
        if (!counterType) return { ok: false, error: "invalid counter update" };
        const nextCounters = decrementCounter(card.counters, counterType, delta);
        const prevCount =
          card.counters.find((entry) => entry.type === counterType)?.count ?? 0;
        const nextCount =
          nextCounters.find((entry) => entry.type === counterType)?.count ?? 0;
        const appliedDelta = nextCount - prevCount;
        if (appliedDelta !== 0) {
          pushLogEvent(appliedDelta > 0 ? "counter.add" : "counter.remove", {
            actorId,
            cardId,
            zoneId: card.zoneId,
            counterType,
            delta: appliedDelta,
            newTotal: nextCount,
            cardName: card.name,
          });
        }
        writeCard(maps, { ...card, counters: nextCounters });
        return { ok: true };
      }
      case "card.tap": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const tapped = typeof payload.tapped === "boolean" ? payload.tapped : null;
        if (!cardId || tapped === null) return { ok: false, error: "invalid tap" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        const permission = canTapCard(actorId, card, zone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        pushLogEvent("card.tap", {
          actorId,
          cardId,
          zoneId: card.zoneId,
          tapped,
          cardName: card.name,
        });
        writeCard(maps, { ...card, tapped });
        return { ok: true };
      }
      case "card.untapAll": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        if (playerId !== actorId) {
          return { ok: false, error: "actor mismatch" };
        }
        pushLogEvent("card.untapAll", {
          actorId,
          playerId,
        });
        maps.cards.forEach((value, key) => {
          const raw = readRecord(value);
          if (!raw) return;
          const card = coerceCard(raw);
          if (card.controllerId === playerId && card.tapped) {
            maps.cards.set(String(key), { ...card, tapped: false });
          }
        });
        return { ok: true };
      }
      case "card.add": {
        const prepared = prepareCardAdd(payload.card);
        if ("error" in prepared) return { ok: false, error: prepared.error };
        return applyPreparedCardAdd(prepared);
      }
      case "card.add.batch": {
        const cards = Array.isArray(payload.cards) ? payload.cards : null;
        if (!cards || cards.length === 0) return { ok: false, error: "invalid cards" };
        const prepared: { card: Card; zoneId: string }[] = [];
        for (const raw of cards) {
          const next = prepareCardAdd(raw);
          if ("error" in next) return { ok: false, error: next.error };
          prepared.push(next);
        }
        for (const entry of prepared) {
          const result = applyPreparedCardAdd(entry);
          if (!result.ok) return result;
        }
        return { ok: true };
      }
      case "card.remove": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        if (!cardId) return { ok: false, error: "invalid card" };
        const card = readCard(maps, cardId);
        if (card) {
          const zone = readZone(maps, card.zoneId);
          if (!zone) return { ok: false, error: "zone not found" };
          const permission = canRemoveToken(actorId, card, zone);
          if (!permission.allowed) {
            return { ok: false, error: permission.reason ?? "not permitted" };
          }
          if (zone) {
            const nextIds = removeFromArray(zone.cardIds, cardId);
            writeZone(maps, { ...zone, cardIds: nextIds });
          }
          pushLogEvent("card.remove", {
            actorId,
            cardId,
            zoneId: card.zoneId,
            cardName: card.name,
          });
          maps.cards.delete(cardId);
          const hadFaceDown =
            Boolean(hidden.faceDownBattlefield[cardId]) || Boolean(hidden.faceDownReveals[cardId]);
          clearFaceDownStateForCard(maps, hidden, cardId);
          if (hadFaceDown) markHiddenChanged();
          return { ok: true };
        }
        const hiddenCard = hidden.cards[cardId];
        if (!hiddenCard) return { ok: false, error: "card not found" };
        const hiddenZone = readZone(maps, hiddenCard.zoneId);
        if (!hiddenZone) return { ok: false, error: "zone not found" };
        const hiddenPermission = canRemoveToken(actorId, hiddenCard, hiddenZone);
        if (!hiddenPermission.allowed) {
          return { ok: false, error: hiddenPermission.reason ?? "not permitted" };
        }
        if (hiddenZone.type === ZONE.HAND) {
          const nextOrder = removeFromArray(hidden.handOrder[hiddenZone.ownerId] ?? [], cardId);
          hidden.handOrder[hiddenZone.ownerId] = nextOrder;
          writeZone(maps, { ...hiddenZone, cardIds: nextOrder });
        } else if (hiddenZone.type === ZONE.LIBRARY) {
          hidden.libraryOrder[hiddenZone.ownerId] = removeFromArray(
            hidden.libraryOrder[hiddenZone.ownerId] ?? [],
            cardId
          );
          syncLibraryRevealsToAllForPlayer(maps, hidden, hiddenZone.ownerId, hiddenZone.id);
        } else if (hiddenZone.type === ZONE.SIDEBOARD) {
          hidden.sideboardOrder[hiddenZone.ownerId] = removeFromArray(
            hidden.sideboardOrder[hiddenZone.ownerId] ?? [],
            cardId
          );
        }
        Reflect.deleteProperty(hidden.cards, cardId);
        Reflect.deleteProperty(hidden.handReveals, cardId);
        Reflect.deleteProperty(hidden.libraryReveals, cardId);
        maps.handRevealsToAll.delete(cardId);
        maps.libraryRevealsToAll.delete(cardId);
        updatePlayerCounts(maps, hidden, hiddenCard.ownerId);
        pushLogEvent("card.remove", {
          actorId,
          cardId,
          zoneId: hiddenCard.zoneId,
          cardName: "a card",
        });
        markHiddenChanged();
        return { ok: true };
      }
      case "card.update": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const updates = isRecord(payload.updates) ? payload.updates : null;
        if (!cardId || !updates) return { ok: false, error: "invalid update" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };

        const forbiddenKeys = [
          "name",
          "imageUrl",
          "oracleText",
          "typeLine",
          "scryfallId",
          "scryfall",
          "deckSection",
          "zoneId",
          "position",
          "counters",
          "ownerId",
          "controllerId",
          "id",
          "tapped",
          "knownToAll",
          "revealedToAll",
          "revealedTo",
          "isToken",
        ];
        for (const key of forbiddenKeys) {
          if (Object.prototype.hasOwnProperty.call(updates, key)) {
            return { ok: false, error: "unsupported update" };
          }
        }

        if (Object.prototype.hasOwnProperty.call(updates, "isCommander")) {
          if (card.ownerId !== actorId) {
            return { ok: false, error: "Only owner may update commander status" };
          }
        }
        if (Object.prototype.hasOwnProperty.call(updates, "commanderTax")) {
          if (card.ownerId !== actorId) {
            return { ok: false, error: "Only owner may update commander tax" };
          }
        }

        const controlledFields = [
          "power",
          "toughness",
          "basePower",
          "baseToughness",
          "customText",
          "faceDown",
          "faceDownMode",
          "currentFaceIndex",
          "rotation",
        ];
        const requiresControl = controlledFields.some((key) =>
          Object.prototype.hasOwnProperty.call(updates, key)
        );
        if (requiresControl) {
          const permission = canModifyCardState(actorId, card, zone);
          if (!permission.allowed) {
            return { ok: false, error: permission.reason ?? "not permitted" };
          }
        }
        const nextCard = applyCardUpdates(card, updates, zone?.type);
        let publicCard = nextCard;
        if (zone?.type === ZONE.BATTLEFIELD) {
          if (!card.faceDown && nextCard.faceDown) {
            hidden.faceDownBattlefield[card.id] = buildCardIdentity(nextCard);
            hidden.faceDownReveals[card.id] = {};
            maps.faceDownRevealsToAll.delete(card.id);
            markHiddenChanged();
            publicCard = stripCardIdentity({
              ...nextCard,
              knownToAll: false,
              revealedToAll: false,
              revealedTo: [],
            });
          } else if (card.faceDown && !nextCard.faceDown) {
            const identity = hidden.faceDownBattlefield[card.id];
            Reflect.deleteProperty(hidden.faceDownBattlefield, card.id);
            Reflect.deleteProperty(hidden.faceDownReveals, card.id);
            maps.faceDownRevealsToAll.delete(card.id);
            markHiddenChanged();
            publicCard = mergeCardIdentity(nextCard, identity);
          } else if (nextCard.faceDown) {
            publicCard = stripCardIdentity(nextCard);
          }
        }
        const newPower = updates.power ?? card.power;
        const newToughness = updates.toughness ?? card.toughness;
        const powerChanged = newPower !== card.power;
        const toughnessChanged = newToughness !== card.toughness;
        if (
          (powerChanged || toughnessChanged) &&
          (newPower !== undefined || newToughness !== undefined)
        ) {
          pushLogEvent("card.pt", {
            actorId,
            cardId,
            zoneId: card.zoneId,
            fromPower: card.power,
            fromToughness: card.toughness,
            toPower: newPower ?? card.power,
            toToughness: newToughness ?? card.toughness,
            cardName: card.name,
          });
        }
        const commanderTaxBefore = card.commanderTax ?? 0;
        const commanderTaxAfter = nextCard.commanderTax ?? 0;
        if (commanderTaxBefore !== commanderTaxAfter) {
          pushLogEvent("player.commanderTax", {
            actorId,
            playerId: card.ownerId,
            cardId: card.id,
            zoneId: card.zoneId,
            cardName: card.name,
            from: commanderTaxBefore,
            to: commanderTaxAfter,
            delta: commanderTaxAfter - commanderTaxBefore,
          });
        }
        writeCard(maps, publicCard);
        return { ok: true };
      }
      case "card.transform": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const faceIndex = typeof payload.targetIndex === "number" ? payload.targetIndex : undefined;
        if (!cardId) return { ok: false, error: "invalid card" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        const permission = canModifyCardState(actorId, card, zone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        if (!isTransformableCard(card)) return { ok: true };
        const { targetIndex, toFaceName } = computeTransformTargetIndex(card, faceIndex);
        pushLogEvent("card.transform", {
          actorId,
          cardId,
          zoneId: card.zoneId,
          toFaceName,
          cardName: card.name,
        });
        const cardForTransform = card.faceDown
          ? mergeCardIdentity(card, hidden.faceDownBattlefield[card.id])
          : card;
        const nextCard = syncCardStatsToFace(cardForTransform, targetIndex);
        if (card.faceDown) {
          hidden.faceDownBattlefield[card.id] = buildCardIdentity(nextCard);
          markHiddenChanged();
          writeCard(maps, stripCardIdentity(nextCard));
        } else {
          writeCard(maps, nextCard);
        }
        return { ok: true };
      }
      case "card.reveal.set": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        if (!cardId) return { ok: false, error: "invalid card" };
        const hiddenCard = hidden.cards[cardId];
        if (!hiddenCard) return { ok: false, error: "card not found" };
        if (hiddenCard.ownerId !== actorId) {
          return { ok: false, error: "Only owner may reveal this card" };
        }
        const zone = readZone(maps, hiddenCard.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        if (zone.type !== ZONE.HAND && zone.type !== ZONE.LIBRARY) {
          return { ok: true };
        }
        const reveal =
          isRecord(payload.reveal) || payload.reveal === null
            ? (payload.reveal as any)
            : null;
        const patch = buildRevealPatch(hiddenCard, reveal);
        if (!reveal) {
          if (zone.type === ZONE.HAND) {
            Reflect.deleteProperty(hidden.handReveals, cardId);
            maps.handRevealsToAll.delete(cardId);
          } else if (zone.type === ZONE.LIBRARY) {
            Reflect.deleteProperty(hidden.libraryReveals, cardId);
            maps.libraryRevealsToAll.delete(cardId);
            syncLibraryRevealsToAllForPlayer(maps, hidden, zone.ownerId, zone.id);
          }
          markHiddenChanged();
          return { ok: true };
        }
        const toPlayers = patch.revealedTo ?? [];
        const revealState: HiddenReveal = {
          ...(patch.revealedToAll ? { toAll: true } : null),
          ...(toPlayers.length ? { toPlayers } : null),
        };
        if (zone.type === ZONE.HAND) {
          hidden.handReveals[cardId] = revealState;
          if (patch.revealedToAll) {
            maps.handRevealsToAll.set(cardId, buildCardIdentity(hiddenCard));
          } else {
            maps.handRevealsToAll.delete(cardId);
          }
        } else if (zone.type === ZONE.LIBRARY) {
          hidden.libraryReveals[cardId] = revealState;
          if (patch.revealedToAll) {
            const order = hidden.libraryOrder[zone.ownerId] ?? [];
            const index = order.indexOf(cardId);
            maps.libraryRevealsToAll.set(cardId, {
              card: buildCardIdentity(hiddenCard),
              orderKey: buildLibraryOrderKey(index >= 0 ? index : order.length),
              ownerId: hiddenCard.ownerId,
            });
          } else {
            maps.libraryRevealsToAll.delete(cardId);
          }
          syncLibraryRevealsToAllForPlayer(maps, hidden, zone.ownerId, zone.id);
        }
        markHiddenChanged();
        return { ok: true };
      }
      case "card.duplicate": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const newCardId = typeof payload.newCardId === "string" ? payload.newCardId : null;
        if (!cardId || !newCardId) return { ok: false, error: "invalid duplicate" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        const permission = canModifyCardState(actorId, card, zone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const snapshot = buildSnapshot(maps);
        const position = computeDuplicateTokenPosition({
          sourceCard: card,
          orderedCardIds: zone.cardIds,
          cardsById: snapshot.cards,
        });
        const clone = buildDuplicateTokenCard({ sourceCard: card, newCardId, position });
        writeCard(maps, clone);
        const nextIds = placeCardId(zone.cardIds, clone.id, "top");
        writeZone(maps, { ...zone, cardIds: nextIds });
        pushLogEvent("card.duplicate", {
          actorId,
          sourceCardId: cardId,
          newCardId,
          zoneId: zone.id,
          cardName: card.name,
        });
        return { ok: true };
      }
      case "card.move": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const toZoneId = typeof payload.toZoneId === "string" ? payload.toZoneId : null;
        if (!cardId || !toZoneId) return { ok: false, error: "invalid move" };
        const toZone = readZone(maps, toZoneId);
        if (!toZone) return { ok: false, error: "zone not found" };
        const publicCard = readCard(maps, cardId);
        const hiddenCard = !publicCard ? hidden.cards[cardId] : null;
        const card = publicCard ?? hiddenCard;
        if (!card) return { ok: false, error: "card not found" };
        const fromZone = readZone(maps, card.zoneId);
        if (!fromZone) return { ok: false, error: "zone not found" };
        const permission = canMoveCard(actorId, card, fromZone, toZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        return applyCardMove(maps, hidden, payload, "top", pushLogEvent, markHiddenChanged);
      }
      case "card.move.bottom": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const toZoneId = typeof payload.toZoneId === "string" ? payload.toZoneId : null;
        if (!cardId || !toZoneId) return { ok: false, error: "invalid move" };
        const toZone = readZone(maps, toZoneId);
        if (!toZone) return { ok: false, error: "zone not found" };
        const publicCard = readCard(maps, cardId);
        const hiddenCard = !publicCard ? hidden.cards[cardId] : null;
        const card = publicCard ?? hiddenCard;
        if (!card) return { ok: false, error: "card not found" };
        const fromZone = readZone(maps, card.zoneId);
        if (!fromZone) return { ok: false, error: "zone not found" };
        const permission = canMoveCard(actorId, card, fromZone, toZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        return applyCardMove(maps, hidden, payload, "bottom", pushLogEvent, markHiddenChanged);
      }
      case "library.draw": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const count = typeof payload.count === "number" ? payload.count : 1;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        const handZone = findZoneByType(snapshot.zones, playerId, ZONE.HAND);
        if (!libraryZone || !handZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const drawCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
        for (let i = 0; i < drawCount; i += 1) {
          const order = hidden.libraryOrder[playerId] ?? [];
          const cardId = order.length ? order[order.length - 1] : null;
          if (!cardId) break;
          const result = applyCardMove(
            maps,
            hidden,
            { cardId, toZoneId: handZone.id, actorId: payload.actorId, opts: { suppressLog: true } },
            "top",
            pushLogEvent,
            markHiddenChanged
          );
          if (!result.ok) return result;
        }
        syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);
        return { ok: true };
      }
      case "library.discard": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const count = typeof payload.count === "number" ? payload.count : 1;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        const graveyardZone = findZoneByType(snapshot.zones, playerId, ZONE.GRAVEYARD);
        if (!libraryZone || !graveyardZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const discardCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
        for (let i = 0; i < discardCount; i += 1) {
          const order = hidden.libraryOrder[playerId] ?? [];
          const cardId = order.length ? order[order.length - 1] : null;
          if (!cardId) break;
          const result = applyCardMove(
            maps,
            hidden,
            { cardId, toZoneId: graveyardZone.id, actorId: payload.actorId, opts: { suppressLog: true } },
            "top",
            pushLogEvent,
            markHiddenChanged
          );
          if (!result.ok) return result;
        }
        syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);
        return { ok: true };
      }
      case "library.shuffle": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const current = hidden.libraryOrder[playerId] ?? [];
        const shuffled = shuffle(current);
        hidden.libraryOrder[playerId] = shuffled;
        shuffled.forEach((id) => {
          const card = hidden.cards[id];
          if (card) {
            hidden.cards[id] = { ...card, knownToAll: false };
          }
          Reflect.deleteProperty(hidden.libraryReveals, id);
          maps.libraryRevealsToAll.delete(id);
        });
        updatePlayerCounts(maps, hidden, playerId);
        syncLibraryRevealsToAllForPlayer(maps, hidden, playerId);
        markHiddenChanged();
        pushLogEvent("library.shuffle", {
          actorId,
          playerId,
        });
        return { ok: true };
      }
      case "deck.reset": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        applyResetDeck(maps, hidden, playerId);
        markHiddenChanged();
        pushLogEvent("deck.reset", {
          actorId,
          playerId,
        });
        return { ok: true };
      }
      case "deck.unload": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        applyUnloadDeck(maps, hidden, playerId);
        markHiddenChanged();
        pushLogEvent("deck.unload", {
          actorId,
          playerId,
        });
        return { ok: true };
      }
      case "deck.mulligan": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const count = typeof payload.count === "number" ? payload.count : 0;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const mulliganDrawCount = applyMulligan(maps, hidden, playerId, count);
        markHiddenChanged();
        pushLogEvent("deck.reset", {
          actorId,
          playerId,
        });
        if (mulliganDrawCount > 0) {
          pushLogEvent("card.draw", {
            actorId,
            playerId,
            count: mulliganDrawCount,
          });
        }
        return { ok: true };
      }
      case "deck.load": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        if (playerId !== actorId) {
          return { ok: false, error: "actor mismatch" };
        }
        const player = readPlayer(maps, playerId);
        if (!player) return { ok: true };
        writePlayer(maps, { ...player, deckLoaded: true });
        return { ok: true };
      }
      case "library.view": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        const count = typeof payload.count === "number" ? payload.count : undefined;
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        pushLogEvent("library.view", {
          actorId,
          playerId,
          ...(count !== undefined ? { count } : {}),
        });
        return { ok: true };
      }
      case "dice.roll": {
        const sides = typeof payload.sides === "number" ? payload.sides : null;
        const count = typeof payload.count === "number" ? payload.count : null;
        const results = Array.isArray(payload.results)
          ? payload.results.filter((value) => typeof value === "number")
          : null;
        if (!sides || !count || !results) return { ok: false, error: "invalid dice roll" };
        pushLogEvent("dice.roll", {
          actorId,
          sides,
          count,
          results,
        });
        return { ok: true };
      }
      default:
        break;
    }
    return { ok: false, error: `unhandled intent: ${intent.type}` };
  };

  try {
    let result: InnerApplyResult = { ok: false, error: "unknown" };
    doc.transact(() => {
      result = apply();
    });
    if (result.ok) {
      return { ok: true, logEvents, ...(hiddenChanged ? { hiddenChanged: true } : null) };
    }
    return result;
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "intent failed" };
  }
};

const applyCardUpdates = (
  card: Card,
  updates: Record<string, unknown>,
  zoneType?: ZoneType
): Card => {
  const hasFaceDownModeUpdate = Object.prototype.hasOwnProperty.call(updates, "faceDownMode");
  const merged = { ...card, ...updates } as Card;

  if (updates.faceDown === false) {
    merged.faceDownMode = undefined;
  }
  if (updates.faceDown === true && !hasFaceDownModeUpdate) {
    merged.faceDownMode = undefined;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "commanderTax")) {
    const raw = merged.commanderTax ?? 0;
    const normalized = Number.isFinite(raw) ? Math.max(0, Math.min(99, Math.floor(raw))) : 0;
    merged.commanderTax = normalized;
  }

  const faces = getCardFaces(merged);
  const normalizedFaceIndex = faces.length
    ? Math.min(Math.max(merged.currentFaceIndex ?? 0, 0), faces.length - 1)
    : merged.currentFaceIndex;
  const targetFaceIndex = normalizedFaceIndex ?? merged.currentFaceIndex;
  const faceChanged = targetFaceIndex !== card.currentFaceIndex;

  const next = syncCardStatsToFace(
    { ...merged, currentFaceIndex: targetFaceIndex },
    targetFaceIndex,
    faceChanged ? undefined : { preserveExisting: true }
  );

  if (zoneType === ZONE.BATTLEFIELD) {
    const shouldMarkKnownAfterFaceUp = updates.faceDown === false && card.faceDown === true;
    const shouldHideAfterFaceDown = updates.faceDown === true && card.faceDown === false;
    if (shouldMarkKnownAfterFaceUp) {
      next.knownToAll = true;
    }
    if (shouldHideAfterFaceDown) {
      next.knownToAll = false;
      next.revealedToAll = false;
      next.revealedTo = [];
    }
  }

  return next;
};

const normalizeCardForAdd = (card: Card): Card => {
  const faces = getCardFaces(card);
  const initialFaceIndex = card.currentFaceIndex ?? 0;
  const normalizedFaceIndex = faces.length
    ? Math.min(Math.max(initialFaceIndex, 0), faces.length - 1)
    : initialFaceIndex;

  const withFaceStats = syncCardStatsToFace({ ...card, currentFaceIndex: initialFaceIndex }, normalizedFaceIndex);

  const rawPosition = (withFaceStats as Partial<Card>).position;
  const normalizedPosition =
    rawPosition && (rawPosition.x > 1 || rawPosition.y > 1)
      ? migratePositionToNormalized(rawPosition)
      : clampNormalizedPosition(rawPosition || { x: 0.5, y: 0.5 });

  return { ...withFaceStats, position: normalizedPosition };
};

const applyCardMove = (
  maps: Maps,
  hidden: HiddenState,
  payload: Record<string, unknown>,
  placement: "top" | "bottom",
  pushLogEvent: (eventId: string, payload: Record<string, unknown>) => void,
  markHiddenChanged: () => void
): InnerApplyResult => {
  const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
  const toZoneId = typeof payload.toZoneId === "string" ? payload.toZoneId : null;
  if (!cardId || !toZoneId) return { ok: false, error: "invalid move" };

  const toZone = readZone(maps, toZoneId);
  if (!toZone) return { ok: false, error: "zone not found" };

  const publicCard = readCard(maps, cardId);
  const hiddenCard = !publicCard ? hidden.cards[cardId] : null;
  const card = publicCard ?? hiddenCard;
  if (!card) return { ok: false, error: "card not found" };

  const fromZone = readZone(maps, card.zoneId);
  if (!fromZone) return { ok: false, error: "zone not found" };

  const position = isRecord(payload.position)
    ? {
        x: typeof payload.position.x === "number" ? payload.position.x : card.position.x,
        y: typeof payload.position.y === "number" ? payload.position.y : card.position.y,
      }
    : undefined;

  const opts = isRecord(payload.opts) ? (payload.opts as MoveOpts) : undefined;
  const actorId = typeof payload.actorId === "string" ? payload.actorId : undefined;

  const nextControllerId = resolveControllerAfterMove(card, fromZone, toZone);
  const controlWillChange = nextControllerId !== card.controllerId;

  const shouldMarkCommander =
    isCommanderZoneType(toZone.type) &&
    card.ownerId === toZone.ownerId &&
    !card.isCommander &&
    !card.isToken;

  const faceDownResolution = resolveFaceDownAfterMove({
    fromZoneType: fromZone.type,
    toZoneType: toZone.type,
    currentFaceDown: card.faceDown,
    currentFaceDownMode: card.faceDownMode,
    requestedFaceDown: opts?.faceDown,
    requestedFaceDownMode: opts?.faceDownMode,
  });

  const sameBattlefield =
    fromZone.type === ZONE.BATTLEFIELD &&
    toZone.type === ZONE.BATTLEFIELD &&
    fromZone.id === toZone.id;

  const fromHidden = isHiddenZoneType(fromZone.type);
  const toHidden = isHiddenZoneType(toZone.type);

  if (opts?.suppressLog) {
    if (fromZone.type === ZONE.LIBRARY && toZone.type === ZONE.HAND) {
      pushLogEvent("card.draw", {
        actorId,
        playerId: fromZone.ownerId,
        count: 1,
      });
    } else if (fromZone.type === ZONE.LIBRARY && toZone.type === ZONE.GRAVEYARD) {
      pushLogEvent("card.discard", {
        actorId,
        playerId: fromZone.ownerId,
        count: 1,
      });
    }
  } else if (!sameBattlefield) {
    const faceDownIdentityForLog =
      card.faceDown && fromZone.type === ZONE.BATTLEFIELD
        ? hidden.faceDownBattlefield[cardId]
        : undefined;
    const leavingFaceDownBattlefield =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD && card.faceDown;
    const enteringFaceDownBattlefield =
      toZone.type === ZONE.BATTLEFIELD && faceDownResolution.effectiveFaceDown;
    const toPublicZone = isPublicZoneType(toZone.type);
    const shouldHideMoveName =
      !toPublicZone || enteringFaceDownBattlefield || (leavingFaceDownBattlefield && !toPublicZone);
    const movePayload: Record<string, unknown> = {
      actorId,
      cardId,
      fromZoneId: fromZone.id,
      toZoneId,
      cardName: shouldHideMoveName ? "a card" : faceDownIdentityForLog?.name ?? card.name,
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      faceDown: faceDownResolution.effectiveFaceDown,
      forceHidden: shouldHideMoveName,
    };
    if (controlWillChange && toZone.type === ZONE.BATTLEFIELD) {
      movePayload.gainsControlBy = nextControllerId;
    }
    pushLogEvent("card.move", movePayload);
  }

  const revealPatch = computeRevealPatchAfterMove({
    fromZoneType: fromZone.type,
    toZoneType: toZone.type,
    effectiveFaceDown: faceDownResolution.effectiveFaceDown,
  });

  if (!fromHidden && !toHidden) {
    const leavingBattlefield =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
    const tokenLeavingBattlefield = card.isToken && toZone.type !== ZONE.BATTLEFIELD;
    if (tokenLeavingBattlefield) {
      const nextFromIds = removeFromArray(fromZone.cardIds, cardId);
      writeZone(maps, { ...fromZone, cardIds: nextFromIds });
      maps.cards.delete(cardId);
      return { ok: true };
    }

    const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;
    const nextCounters = enforceZoneCounterRules(card.counters, toZone);

    const wasFaceDownBattlefield = fromZone.type === ZONE.BATTLEFIELD && card.faceDown;
    const faceDownIdentity = wasFaceDownBattlefield
      ? hidden.faceDownBattlefield[cardId]
      : undefined;
    const cardWithIdentity = mergeCardIdentity(card, faceDownIdentity);

    const fallbackPosition =
      !position && toZone.type === ZONE.BATTLEFIELD && fromZone.type !== ZONE.BATTLEFIELD
        ? { x: 0.5, y: 0.5 }
        : position;
    let resolvedPosition = normalizeMovePosition(fallbackPosition, card.position);
    if (
      toZone.type === ZONE.BATTLEFIELD &&
      fallbackPosition &&
      (!opts?.skipCollision || opts?.groupCollision)
    ) {
      const ordered = toZone.cardIds;
      const cardsById: Record<string, Card> = {};
      ordered.forEach((id) => {
        const entry = readCard(maps, id);
        if (entry) cardsById[id] = entry;
      });

      if (opts?.groupCollision) {
        const movingIds = Array.isArray(opts.groupCollision.movingCardIds)
          ? opts.groupCollision.movingCardIds
          : [];
        const targetPositions = isRecord(opts.groupCollision.targetPositions)
          ? (opts.groupCollision.targetPositions as Record<string, { x: number; y: number } | undefined>)
          : {};
        const resolved = resolveBattlefieldGroupCollisionPositions({
          movingCardIds: movingIds,
          targetPositions,
          orderedCardIds: ordered,
          getPosition: (id) => cardsById[id]?.position,
        });
        resolvedPosition = resolved[cardId] ?? resolvedPosition;
      } else {
        resolvedPosition = resolveBattlefieldCollisionPosition({
          movingCardId: cardId,
          targetPosition: resolvedPosition,
          orderedCardIds: ordered,
          getPosition: (id) => cardsById[id]?.position,
        });
      }
    }

    const baseCard = leavingBattlefield ? resetCardToFrontFace(cardWithIdentity) : cardWithIdentity;
    const nextCard: Card = {
      ...baseCard,
      zoneId: toZoneId,
      position: resolvedPosition,
      tapped: nextTapped,
      counters: nextCounters,
      faceDown: faceDownResolution.effectiveFaceDown,
      faceDownMode: faceDownResolution.effectiveFaceDownMode,
      controllerId: controlWillChange ? nextControllerId : baseCard.controllerId,
      isCommander: shouldMarkCommander ? true : baseCard.isCommander,
    };

    if (revealPatch) {
      nextCard.knownToAll = revealPatch.knownToAll ?? nextCard.knownToAll;
      if (revealPatch.revealedToAll !== undefined) {
        nextCard.revealedToAll = revealPatch.revealedToAll;
      }
      if (revealPatch.revealedTo !== undefined) {
        nextCard.revealedTo = revealPatch.revealedTo;
      }
    }

    const willBeFaceDownBattlefield =
      toZone.type === ZONE.BATTLEFIELD && nextCard.faceDown;
    const publicCard = willBeFaceDownBattlefield ? stripCardIdentity(nextCard) : nextCard;

    if (fromZone.id === toZone.id) {
      const nextIds = placeCardId(fromZone.cardIds, cardId, placement);
      writeZone(maps, { ...fromZone, cardIds: nextIds });
      writeCard(maps, publicCard);
    } else {
      const nextFromIds = removeFromArray(fromZone.cardIds, cardId);
      const nextToIds = placeCardId(toZone.cardIds, cardId, placement);
      writeZone(maps, { ...fromZone, cardIds: nextFromIds });
      writeZone(maps, { ...toZone, cardIds: nextToIds });
      writeCard(maps, publicCard);
    }

    if (willBeFaceDownBattlefield && (!wasFaceDownBattlefield || !faceDownIdentity)) {
      hidden.faceDownBattlefield[cardId] = buildCardIdentity(nextCard);
      if (!hidden.faceDownReveals[cardId]) {
        hidden.faceDownReveals[cardId] = {};
      }
      maps.faceDownRevealsToAll.delete(cardId);
      markHiddenChanged();
    }
    if (wasFaceDownBattlefield && !willBeFaceDownBattlefield) {
      Reflect.deleteProperty(hidden.faceDownBattlefield, cardId);
      Reflect.deleteProperty(hidden.faceDownReveals, cardId);
      maps.faceDownRevealsToAll.delete(cardId);
      markHiddenChanged();
    }
    return { ok: true };
  }

  if (fromHidden && toHidden) {
    const nextCounters = enforceZoneCounterRules(card.counters, toZone);
    const nextCard: Card = {
      ...card,
      zoneId: toZoneId,
      tapped: false,
      counters: nextCounters,
      faceDown: false,
      faceDownMode: undefined,
      controllerId: controlWillChange ? nextControllerId : card.controllerId,
      isCommander: shouldMarkCommander ? true : card.isCommander,
    };

    if (revealPatch) {
      nextCard.knownToAll = revealPatch.knownToAll ?? nextCard.knownToAll;
      if (revealPatch.revealedToAll !== undefined) {
        nextCard.revealedToAll = revealPatch.revealedToAll;
      }
      if (revealPatch.revealedTo !== undefined) {
        nextCard.revealedTo = revealPatch.revealedTo;
      }
    }

    if (fromZone.type === ZONE.HAND) {
      const nextOrder =
        fromZone.id === toZone.id
          ? placeCardId(hidden.handOrder[fromZone.ownerId] ?? [], cardId, placement)
          : removeFromArray(hidden.handOrder[fromZone.ownerId] ?? [], cardId);
      hidden.handOrder[fromZone.ownerId] = nextOrder;
      writeZone(maps, { ...fromZone, cardIds: nextOrder });
    }
    if (fromZone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[fromZone.ownerId] = removeFromArray(
        hidden.libraryOrder[fromZone.ownerId] ?? [],
        cardId
      );
    }
    if (fromZone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[fromZone.ownerId] = removeFromArray(
        hidden.sideboardOrder[fromZone.ownerId] ?? [],
        cardId
      );
    }

    if (toZone.type === ZONE.HAND) {
      const nextOrder =
        fromZone.id === toZone.id
          ? hidden.handOrder[toZone.ownerId] ?? []
          : placeCardId(hidden.handOrder[toZone.ownerId] ?? [], cardId, placement);
      hidden.handOrder[toZone.ownerId] = nextOrder;
      writeZone(maps, { ...toZone, cardIds: nextOrder });
    }
    if (toZone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[toZone.ownerId] = placeCardId(
        hidden.libraryOrder[toZone.ownerId] ?? [],
        cardId,
        placement
      );
    }
    if (toZone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[toZone.ownerId] = placeCardId(
        hidden.sideboardOrder[toZone.ownerId] ?? [],
        cardId,
        placement
      );
    }

    hidden.cards[cardId] = nextCard;

    if (fromZone.type === ZONE.HAND && toZone.type !== ZONE.HAND) {
      Reflect.deleteProperty(hidden.handReveals, cardId);
      maps.handRevealsToAll.delete(cardId);
    }
    if (fromZone.type === ZONE.LIBRARY && toZone.type !== ZONE.LIBRARY) {
      Reflect.deleteProperty(hidden.libraryReveals, cardId);
      maps.libraryRevealsToAll.delete(cardId);
    }
    if (toZone.type === ZONE.LIBRARY) {
      nextCard.knownToAll = false;
      Reflect.deleteProperty(hidden.libraryReveals, cardId);
      maps.libraryRevealsToAll.delete(cardId);
    }
    if (toZone.type === ZONE.HAND) {
      if (nextCard.knownToAll) {
        hidden.handReveals[cardId] = { toAll: true };
        maps.handRevealsToAll.set(cardId, buildCardIdentity(nextCard));
      } else {
        Reflect.deleteProperty(hidden.handReveals, cardId);
        maps.handRevealsToAll.delete(cardId);
      }
    }

    updatePlayerCounts(maps, hidden, fromZone.ownerId);
    updatePlayerCounts(maps, hidden, toZone.ownerId);
    if (fromZone.type === ZONE.LIBRARY) {
      syncLibraryRevealsToAllForPlayer(maps, hidden, fromZone.ownerId, fromZone.id);
    }
    if (toZone.type === ZONE.LIBRARY && toZone.ownerId !== fromZone.ownerId) {
      syncLibraryRevealsToAllForPlayer(maps, hidden, toZone.ownerId, toZone.id);
    }
    markHiddenChanged();
    return { ok: true };
  }

  if (!fromHidden && toHidden) {
    const leavingBattlefield =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
    const tokenLeavingBattlefield =
      card.isToken && fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
    if (tokenLeavingBattlefield) {
      const nextFromIds = removeFromArray(fromZone.cardIds, cardId);
      writeZone(maps, { ...fromZone, cardIds: nextFromIds });
      maps.cards.delete(cardId);
      return { ok: true };
    }

    const nextCounters = enforceZoneCounterRules(card.counters, toZone);
    const wasFaceDownBattlefield = fromZone.type === ZONE.BATTLEFIELD && card.faceDown;
    const faceDownIdentity = wasFaceDownBattlefield
      ? hidden.faceDownBattlefield[cardId]
      : undefined;
    const cardWithIdentity = mergeCardIdentity(card, faceDownIdentity);
    const baseCard = leavingBattlefield ? resetCardToFrontFace(cardWithIdentity) : cardWithIdentity;
    const nextCard: Card = {
      ...baseCard,
      zoneId: toZoneId,
      tapped: false,
      counters: nextCounters,
      faceDown: false,
      faceDownMode: undefined,
      controllerId: controlWillChange ? nextControllerId : baseCard.controllerId,
      isCommander: shouldMarkCommander ? true : baseCard.isCommander,
    };

    if (revealPatch) {
      nextCard.knownToAll = revealPatch.knownToAll ?? nextCard.knownToAll;
      if (revealPatch.revealedToAll !== undefined) {
        nextCard.revealedToAll = revealPatch.revealedToAll;
      }
      if (revealPatch.revealedTo !== undefined) {
        nextCard.revealedTo = revealPatch.revealedTo;
      }
    }

    const nextFromIds = removeFromArray(fromZone.cardIds, cardId);
    writeZone(maps, { ...fromZone, cardIds: nextFromIds });
    maps.cards.delete(cardId);

    if (wasFaceDownBattlefield) {
      Reflect.deleteProperty(hidden.faceDownBattlefield, cardId);
      Reflect.deleteProperty(hidden.faceDownReveals, cardId);
      maps.faceDownRevealsToAll.delete(cardId);
    }

    hidden.cards[cardId] = nextCard;
    if (toZone.type === ZONE.HAND) {
      const nextOrder = placeCardId(hidden.handOrder[toZone.ownerId] ?? [], cardId, placement);
      hidden.handOrder[toZone.ownerId] = nextOrder;
      writeZone(maps, { ...toZone, cardIds: nextOrder });
      if (nextCard.knownToAll) {
        hidden.handReveals[cardId] = { toAll: true };
        maps.handRevealsToAll.set(cardId, buildCardIdentity(nextCard));
      } else {
        Reflect.deleteProperty(hidden.handReveals, cardId);
        maps.handRevealsToAll.delete(cardId);
      }
    } else if (toZone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[toZone.ownerId] = placeCardId(
        hidden.libraryOrder[toZone.ownerId] ?? [],
        cardId,
        placement
      );
      Reflect.deleteProperty(hidden.libraryReveals, cardId);
      maps.libraryRevealsToAll.delete(cardId);
      nextCard.knownToAll = false;
    } else if (toZone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[toZone.ownerId] = placeCardId(
        hidden.sideboardOrder[toZone.ownerId] ?? [],
        cardId,
        placement
      );
    }

    updatePlayerCounts(maps, hidden, toZone.ownerId);
    if (toZone.type === ZONE.LIBRARY) {
      syncLibraryRevealsToAllForPlayer(maps, hidden, toZone.ownerId, toZone.id);
    }
    markHiddenChanged();
    return { ok: true };
  }

  if (fromHidden && !toHidden) {
    if (fromZone.type === ZONE.HAND) {
      const nextOrder = removeFromArray(hidden.handOrder[fromZone.ownerId] ?? [], cardId);
      hidden.handOrder[fromZone.ownerId] = nextOrder;
      writeZone(maps, { ...fromZone, cardIds: nextOrder });
      Reflect.deleteProperty(hidden.handReveals, cardId);
      maps.handRevealsToAll.delete(cardId);
    }
    if (fromZone.type === ZONE.LIBRARY) {
      hidden.libraryOrder[fromZone.ownerId] = removeFromArray(
        hidden.libraryOrder[fromZone.ownerId] ?? [],
        cardId
      );
      Reflect.deleteProperty(hidden.libraryReveals, cardId);
      maps.libraryRevealsToAll.delete(cardId);
    }
    if (fromZone.type === ZONE.SIDEBOARD) {
      hidden.sideboardOrder[fromZone.ownerId] = removeFromArray(
        hidden.sideboardOrder[fromZone.ownerId] ?? [],
        cardId
      );
    }

    const nextCounters = enforceZoneCounterRules(card.counters, toZone);
    const fallbackPosition =
      !position && toZone.type === ZONE.BATTLEFIELD && fromZone.type !== ZONE.BATTLEFIELD
        ? { x: 0.5, y: 0.5 }
        : position;
    let resolvedPosition = normalizeMovePosition(fallbackPosition, card.position);
    if (
      toZone.type === ZONE.BATTLEFIELD &&
      fallbackPosition &&
      (!opts?.skipCollision || opts?.groupCollision)
    ) {
      const ordered = toZone.cardIds;
      const cardsById: Record<string, Card> = {};
      ordered.forEach((id) => {
        const entry = readCard(maps, id);
        if (entry) cardsById[id] = entry;
      });

      if (opts?.groupCollision) {
        const movingIds = Array.isArray(opts.groupCollision.movingCardIds)
          ? opts.groupCollision.movingCardIds
          : [];
        const targetPositions = isRecord(opts.groupCollision.targetPositions)
          ? (opts.groupCollision.targetPositions as Record<string, { x: number; y: number } | undefined>)
          : {};
        const resolved = resolveBattlefieldGroupCollisionPositions({
          movingCardIds: movingIds,
          targetPositions,
          orderedCardIds: ordered,
          getPosition: (id) => cardsById[id]?.position,
        });
        resolvedPosition = resolved[cardId] ?? resolvedPosition;
      } else {
        resolvedPosition = resolveBattlefieldCollisionPosition({
          movingCardId: cardId,
          targetPosition: resolvedPosition,
          orderedCardIds: ordered,
          getPosition: (id) => cardsById[id]?.position,
        });
      }
    }

    const nextCard: Card = {
      ...card,
      zoneId: toZoneId,
      position: resolvedPosition,
      tapped: toZone.type === ZONE.BATTLEFIELD ? card.tapped : false,
      counters: nextCounters,
      faceDown: toZone.type === ZONE.BATTLEFIELD ? faceDownResolution.effectiveFaceDown : false,
      faceDownMode:
        toZone.type === ZONE.BATTLEFIELD ? faceDownResolution.effectiveFaceDownMode : undefined,
      controllerId: controlWillChange ? nextControllerId : card.controllerId,
      isCommander: shouldMarkCommander ? true : card.isCommander,
    };

    if (revealPatch) {
      nextCard.knownToAll = revealPatch.knownToAll ?? nextCard.knownToAll;
      if (revealPatch.revealedToAll !== undefined) {
        nextCard.revealedToAll = revealPatch.revealedToAll;
      }
      if (revealPatch.revealedTo !== undefined) {
        nextCard.revealedTo = revealPatch.revealedTo;
      }
    }

    const nextToIds = placeCardId(toZone.cardIds, cardId, placement);
    writeZone(maps, { ...toZone, cardIds: nextToIds });
    const willBeFaceDownBattlefield =
      toZone.type === ZONE.BATTLEFIELD && nextCard.faceDown;
    const publicCard = willBeFaceDownBattlefield ? stripCardIdentity(nextCard) : nextCard;
    writeCard(maps, publicCard);
    Reflect.deleteProperty(hidden.cards, cardId);

    if (willBeFaceDownBattlefield) {
      hidden.faceDownBattlefield[cardId] = buildCardIdentity(nextCard);
      hidden.faceDownReveals[cardId] = {};
      maps.faceDownRevealsToAll.delete(cardId);
    }

    updatePlayerCounts(maps, hidden, fromZone.ownerId);
    if (fromZone.type === ZONE.LIBRARY) {
      syncLibraryRevealsToAllForPlayer(maps, hidden, fromZone.ownerId, fromZone.id);
    }
    markHiddenChanged();
    return { ok: true };
  }

  return { ok: true };
};

const findZoneByType = (
  zones: Record<string, Zone>,
  playerId: string,
  zoneType: ZoneType
): Zone | null => {
  const match = Object.values(zones).find(
    (zone) =>
      zone.ownerId === playerId &&
      (zoneType === ZONE.COMMANDER
        ? isCommanderZoneType(zone.type)
        : zone.type === zoneType)
  );
  return match ? { ...match } : null;
};

const applyResetDeck = (maps: Maps, hidden: HiddenState, playerId: string) => {
  const snapshot = buildSnapshot(maps);
  const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
  const handZone = findZoneByType(snapshot.zones, playerId, ZONE.HAND);
  const sideboardZone = findZoneByType(snapshot.zones, playerId, ZONE.SIDEBOARD);
  const commanderZone = findZoneByType(snapshot.zones, playerId, ZONE.COMMANDER);
  if (!libraryZone) return;

  const commanderKeeps =
    commanderZone?.cardIds.filter((id) => snapshot.cards[id]?.ownerId !== playerId) ?? [];
  const commanderOwned =
    commanderZone?.cardIds.filter((id) => snapshot.cards[id]?.ownerId === playerId) ?? [];
  const toCommander: string[] = [];
  const commanderIdentityOverrides: Record<string, CardIdentity> = {};

  const previousHandOrder = hidden.handOrder[playerId] ?? [];
  const previousLibraryOrder = hidden.libraryOrder[playerId] ?? [];

  previousHandOrder.forEach((id) => {
    Reflect.deleteProperty(hidden.handReveals, id);
    maps.handRevealsToAll.delete(id);
  });

  previousLibraryOrder.forEach((id) => {
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.libraryRevealsToAll.delete(id);
  });

  const libraryKeeps = previousLibraryOrder.filter((id) => {
    const card = hidden.cards[id];
    return card && card.ownerId !== playerId;
  });

  const toLibrary: string[] = [];

  const removeFromPublicZone = (zoneId: string, cardId: string) => {
    const zone = readZone(maps, zoneId) ?? snapshot.zones[zoneId];
    if (!zone) return;
    const nextIds = removeFromArray(zone.cardIds, cardId);
    writeZone(maps, { ...zone, cardIds: nextIds });
  };

  Object.values(snapshot.cards).forEach((card) => {
    if (card.ownerId !== playerId) return;
    const fromZone = snapshot.zones[card.zoneId];
    if (!fromZone) return;
    const inCommanderZone = isCommanderZoneType(fromZone.type);
    const inSideboard = fromZone.type === ZONE.SIDEBOARD;
    const resolvedCard = card.faceDown
      ? mergeCardIdentity(card, hidden.faceDownBattlefield[card.id])
      : card;

    if (resolvedCard.isToken) {
      removeFromPublicZone(card.zoneId, card.id);
      maps.cards.delete(card.id);
      clearFaceDownStateForCard(maps, hidden, card.id);
      return;
    }

    if (resolvedCard.isCommander && commanderZone) {
      if (resolvedCard.faceDown && hidden.faceDownBattlefield[card.id]) {
        commanderIdentityOverrides[card.id] = hidden.faceDownBattlefield[card.id];
      }
      if (!inCommanderZone) {
        removeFromPublicZone(card.zoneId, card.id);
      }
      clearFaceDownStateForCard(maps, hidden, card.id);
      toCommander.push(card.id);
      return;
    }

    if (inCommanderZone) {
      return;
    }

    if (inSideboard && !resolvedCard.isCommander) {
      removeFromPublicZone(card.zoneId, card.id);
      maps.cards.delete(card.id);
      hidden.cards[card.id] = { ...resolvedCard, zoneId: fromZone.id };
      hidden.sideboardOrder[playerId] = placeCardId(
        hidden.sideboardOrder[playerId] ?? [],
        card.id,
        "top"
      );
      clearFaceDownStateForCard(maps, hidden, card.id);
      return;
    }

    removeFromPublicZone(card.zoneId, card.id);
    maps.cards.delete(card.id);
    clearFaceDownStateForCard(maps, hidden, card.id);
    toLibrary.push(card.id);
    hidden.cards[card.id] = { ...resolvedCard, zoneId: libraryZone.id };
  });

  Object.entries(hidden.cards).forEach(([cardId, card]) => {
    if (card.ownerId !== playerId) return;
    const zone = snapshot.zones[card.zoneId];
    if (card.isToken) {
      Reflect.deleteProperty(hidden.cards, cardId);
      return;
    }
    if (card.isCommander && commanderZone) {
      toCommander.push(cardId);
      return;
    }
    if (zone?.type === ZONE.SIDEBOARD && !card.isCommander) {
      return;
    }
    toLibrary.push(cardId);
  });

  const commanderCardIds = uniqueStrings([...commanderOwned, ...toCommander]);
  commanderCardIds.forEach((cardId) => {
    Reflect.deleteProperty(hidden.cards, cardId);
    hidden.handOrder[playerId] = removeFromArray(hidden.handOrder[playerId] ?? [], cardId);
    hidden.libraryOrder[playerId] = removeFromArray(hidden.libraryOrder[playerId] ?? [], cardId);
    hidden.sideboardOrder[playerId] = removeFromArray(
      hidden.sideboardOrder[playerId] ?? [],
      cardId
    );
  });

  hidden.handOrder[playerId] = [];
  const nextLibrary = shuffle(uniqueStrings([...libraryKeeps, ...toLibrary]));
  hidden.libraryOrder[playerId] = nextLibrary;
  nextLibrary.forEach((id) => {
    const card = hidden.cards[id];
    if (!card) return;
    const resetCard = resetCardToFrontFace(card);
    hidden.cards[id] = {
      ...resetCard,
      zoneId: libraryZone.id,
      tapped: false,
      faceDown: false,
      controllerId: card.ownerId,
      knownToAll: false,
      position: { x: 0, y: 0 },
      rotation: 0,
      customText: undefined,
      counters: enforceZoneCounterRules(resetCard.counters, libraryZone),
    };
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.libraryRevealsToAll.delete(id);
  });

  hidden.sideboardOrder[playerId] = (hidden.sideboardOrder[playerId] ?? []).filter((id) => {
    const card = hidden.cards[id];
    if (!card) return false;
    if (card.isToken) return false;
    if (commanderCardIds.includes(id)) return false;
    return true;
  });

  if (handZone) writeZone(maps, { ...handZone, cardIds: [] });
  writeZone(maps, { ...libraryZone, cardIds: [] });
  if (sideboardZone) writeZone(maps, { ...sideboardZone, cardIds: [] });

  if (commanderZone) {
    const commanderIds = uniqueStrings([...commanderKeeps, ...commanderOwned, ...toCommander]);
    commanderIds.forEach((id) => {
      const source = hidden.cards[id] ?? snapshot.cards[id];
      if (!source) return;
      const identityOverride = commanderIdentityOverrides[id];
      const resolvedSource = mergeCardIdentity(source, identityOverride);
      const resetCard = resetCardToFrontFace(resolvedSource);
      const nextCard = {
        ...resetCard,
        zoneId: commanderZone.id,
        tapped: false,
        faceDown: false,
        controllerId: source.ownerId,
        knownToAll: true,
        customText: undefined,
        counters: enforceZoneCounterRules(resetCard.counters, commanderZone),
        isCommander: true,
      };
      writeCard(maps, nextCard);
    });
    writeZone(maps, { ...commanderZone, cardIds: commanderIds });
  }

  const player = readPlayer(maps, playerId);
  if (player) {
    writePlayer(maps, { ...player, libraryTopReveal: undefined });
  }
  updatePlayerCounts(maps, hidden, playerId);
  syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);
};

const applyUnloadDeck = (maps: Maps, hidden: HiddenState, playerId: string) => {
  const snapshot = buildSnapshot(maps);

  Object.values(snapshot.cards).forEach((card) => {
    if (card.ownerId !== playerId) return;
    const zone = snapshot.zones[card.zoneId];
    if (zone) {
      const nextIds = removeFromArray(zone.cardIds, card.id);
      writeZone(maps, { ...zone, cardIds: nextIds });
    }
    maps.cards.delete(card.id);
    clearFaceDownStateForCard(maps, hidden, card.id);
  });

  Object.entries(hidden.cards).forEach(([id, card]) => {
    if (card.ownerId !== playerId) return;
    Reflect.deleteProperty(hidden.cards, id);
    Reflect.deleteProperty(hidden.handReveals, id);
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.handRevealsToAll.delete(id);
    maps.libraryRevealsToAll.delete(id);
  });

  hidden.handOrder[playerId] = [];
  hidden.libraryOrder[playerId] = [];
  hidden.sideboardOrder[playerId] = [];

  const handZone = findZoneByType(snapshot.zones, playerId, ZONE.HAND);
  if (handZone) writeZone(maps, { ...handZone, cardIds: [] });
  const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
  if (libraryZone) {
    writeZone(maps, { ...libraryZone, cardIds: [] });
    syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);
  }
  const sideboardZone = findZoneByType(snapshot.zones, playerId, ZONE.SIDEBOARD);
  if (sideboardZone) writeZone(maps, { ...sideboardZone, cardIds: [] });

  const player = readPlayer(maps, playerId);
  if (player) {
    writePlayer(maps, { ...player, deckLoaded: false, libraryTopReveal: undefined });
  }
  updatePlayerCounts(maps, hidden, playerId);
};

const applyMulligan = (
  maps: Maps,
  hidden: HiddenState,
  playerId: string,
  count: number
): number => {
  const snapshot = buildSnapshot(maps);
  const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
  const handZone = findZoneByType(snapshot.zones, playerId, ZONE.HAND);
  const sideboardZone = findZoneByType(snapshot.zones, playerId, ZONE.SIDEBOARD);
  const commanderZone = findZoneByType(snapshot.zones, playerId, ZONE.COMMANDER);
  if (!libraryZone || !handZone) return 0;

  const drawTarget = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

  const commanderKeeps =
    commanderZone?.cardIds.filter((id) => snapshot.cards[id]?.ownerId !== playerId) ?? [];
  const commanderOwned =
    commanderZone?.cardIds.filter((id) => snapshot.cards[id]?.ownerId === playerId) ?? [];
  const toCommander: string[] = [];
  const commanderIdentityOverrides: Record<string, CardIdentity> = {};

  const previousHandOrder = hidden.handOrder[playerId] ?? [];
  const previousLibraryOrder = hidden.libraryOrder[playerId] ?? [];

  previousHandOrder.forEach((id) => {
    Reflect.deleteProperty(hidden.handReveals, id);
    maps.handRevealsToAll.delete(id);
  });

  previousLibraryOrder.forEach((id) => {
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.libraryRevealsToAll.delete(id);
  });

  const libraryKeeps = previousLibraryOrder.filter((id) => {
    const card = hidden.cards[id];
    return card && card.ownerId !== playerId;
  });

  const toLibrary: string[] = [];

  const removeFromPublicZone = (zoneId: string, cardId: string) => {
    const zone = readZone(maps, zoneId) ?? snapshot.zones[zoneId];
    if (!zone) return;
    const nextIds = removeFromArray(zone.cardIds, cardId);
    writeZone(maps, { ...zone, cardIds: nextIds });
  };

  Object.values(snapshot.cards).forEach((card) => {
    if (card.ownerId !== playerId) return;
    const fromZone = snapshot.zones[card.zoneId];
    if (!fromZone) return;
    const inCommanderZone = isCommanderZoneType(fromZone.type);
    const inSideboard = fromZone.type === ZONE.SIDEBOARD;
    const resolvedCard = card.faceDown
      ? mergeCardIdentity(card, hidden.faceDownBattlefield[card.id])
      : card;

    if (resolvedCard.isToken) {
      removeFromPublicZone(card.zoneId, card.id);
      maps.cards.delete(card.id);
      clearFaceDownStateForCard(maps, hidden, card.id);
      return;
    }

    if (resolvedCard.isCommander && commanderZone) {
      if (resolvedCard.faceDown && hidden.faceDownBattlefield[card.id]) {
        commanderIdentityOverrides[card.id] = hidden.faceDownBattlefield[card.id];
      }
      if (!inCommanderZone) {
        removeFromPublicZone(card.zoneId, card.id);
      }
      clearFaceDownStateForCard(maps, hidden, card.id);
      toCommander.push(card.id);
      return;
    }

    if (inCommanderZone) {
      return;
    }

    if (inSideboard && !resolvedCard.isCommander) {
      removeFromPublicZone(card.zoneId, card.id);
      maps.cards.delete(card.id);
      hidden.cards[card.id] = { ...resolvedCard, zoneId: fromZone.id };
      hidden.sideboardOrder[playerId] = placeCardId(
        hidden.sideboardOrder[playerId] ?? [],
        card.id,
        "top"
      );
      clearFaceDownStateForCard(maps, hidden, card.id);
      return;
    }

    removeFromPublicZone(card.zoneId, card.id);
    maps.cards.delete(card.id);
    clearFaceDownStateForCard(maps, hidden, card.id);
    toLibrary.push(card.id);
    hidden.cards[card.id] = { ...resolvedCard, zoneId: libraryZone.id };
  });

  Object.entries(hidden.cards).forEach(([cardId, card]) => {
    if (card.ownerId !== playerId) return;
    const zone = snapshot.zones[card.zoneId];
    if (card.isToken) {
      Reflect.deleteProperty(hidden.cards, cardId);
      return;
    }
    if (card.isCommander && commanderZone) {
      toCommander.push(cardId);
      return;
    }
    if (zone?.type === ZONE.SIDEBOARD && !card.isCommander) {
      return;
    }
    toLibrary.push(cardId);
  });

  const commanderCardIds = uniqueStrings([...commanderOwned, ...toCommander]);
  commanderCardIds.forEach((cardId) => {
    Reflect.deleteProperty(hidden.cards, cardId);
    hidden.handOrder[playerId] = removeFromArray(hidden.handOrder[playerId] ?? [], cardId);
    hidden.libraryOrder[playerId] = removeFromArray(hidden.libraryOrder[playerId] ?? [], cardId);
    hidden.sideboardOrder[playerId] = removeFromArray(
      hidden.sideboardOrder[playerId] ?? [],
      cardId
    );
  });

  const shuffled = shuffle(uniqueStrings([...libraryKeeps, ...toLibrary]));
  const actualDrawCount = drawTarget > 0 ? Math.min(drawTarget, shuffled.length) : 0;
  const drawIds = actualDrawCount > 0 ? shuffled.slice(-actualDrawCount) : [];
  const remainingLibrary = shuffled.slice(0, shuffled.length - drawIds.length);

  hidden.libraryOrder[playerId] = remainingLibrary;
  hidden.handOrder[playerId] = drawIds;

  shuffled.forEach((id) => {
    const card = hidden.cards[id];
    if (!card) return;
    const resetCard = resetCardToFrontFace(card);
    hidden.cards[id] = {
      ...resetCard,
      zoneId: libraryZone.id,
      tapped: false,
      faceDown: false,
      controllerId: card.ownerId,
      knownToAll: false,
      position: { x: 0, y: 0 },
      rotation: 0,
      customText: undefined,
      counters: enforceZoneCounterRules(resetCard.counters, libraryZone),
    };
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.libraryRevealsToAll.delete(id);
  });

  drawIds.forEach((id) => {
    const card = hidden.cards[id];
    if (!card) return;
    hidden.cards[id] = {
      ...card,
      zoneId: handZone.id,
      counters: enforceZoneCounterRules(card.counters, handZone),
    };
  });

  hidden.sideboardOrder[playerId] = (hidden.sideboardOrder[playerId] ?? []).filter((id) => {
    const card = hidden.cards[id];
    if (!card) return false;
    if (card.isToken) return false;
    if (commanderCardIds.includes(id)) return false;
    return true;
  });

  writeZone(maps, { ...handZone, cardIds: drawIds });
  writeZone(maps, { ...libraryZone, cardIds: [] });
  if (sideboardZone) writeZone(maps, { ...sideboardZone, cardIds: [] });

  if (commanderZone) {
    const commanderIds = uniqueStrings([...commanderKeeps, ...commanderOwned, ...toCommander]);
    commanderIds.forEach((id) => {
      const source = hidden.cards[id] ?? snapshot.cards[id];
      if (!source) return;
      const identityOverride = commanderIdentityOverrides[id];
      const resolvedSource = mergeCardIdentity(source, identityOverride);
      const resetCard = resetCardToFrontFace(resolvedSource);
      const nextCard = {
        ...resetCard,
        zoneId: commanderZone.id,
        tapped: false,
        faceDown: false,
        controllerId: source.ownerId,
        knownToAll: true,
        customText: undefined,
        counters: enforceZoneCounterRules(resetCard.counters, commanderZone),
        isCommander: true,
      };
      writeCard(maps, nextCard);
    });
    writeZone(maps, { ...commanderZone, cardIds: commanderIds });
  }

  updatePlayerCounts(maps, hidden, playerId);
  syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);

  return actualDrawCount;
};
