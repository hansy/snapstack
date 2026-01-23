import {
  routePartykitRequest,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";

import type { Card, CardLite } from "@mtg/shared/types/cards";

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
  IntentImpact,
  OverlayMeta,
  OverlaySnapshotData,
  PrivateOverlayDiffPayload,
  PrivateOverlayPayload,
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
const SNAPSHOT_META_KEY = "snapshot:meta";
const SNAPSHOT_HIDDEN_PREFIX = "snapshot:hidden:";
const INTENT_LOG_META_KEY = "intent-log:meta";
const INTENT_LOG_PREFIX = "intent-log:";
const HIDDEN_STATE_PERSIST_DEBOUNCE_MS = 1500;
const HIDDEN_STATE_PERSIST_IDLE_MS = 5_000;
const HIDDEN_STATE_CLEANUP_INTERVAL_MS = 10 * 60_000;
const SNAPSHOT_INTENT_THRESHOLD = 200;
const SNAPSHOT_TIME_THRESHOLD_MS = 30_000;
const INTENT_LOG_MAX_ENTRIES = 2000;
const PERF_METRICS_INTERVAL_MS = 30_000;
const PERF_METRICS_MIN_INTERVAL_MS = 5_000;
const PERF_METRICS_MAX_INTERVAL_MS = 300_000;
const PERF_METRICS_SAMPLE_LIMIT = 5000;
const LIBRARY_VIEW_PING_TIMEOUT_MS = 45_000;
const LIBRARY_VIEW_CLEANUP_INTERVAL_MS = 15_000;
const OVERLAY_SCHEMA_VERSION = 1;
const OVERLAY_DIFF_CAPABILITY = "overlay-diff-v1";
const OVERLAY_DIFF_MAX_RATIO = 0.7;
const OVERLAY_DIFF_MAX_BYTES = 64_000;

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const sampleMetric = (target: number[], value: number) => {
  if (!Number.isFinite(value)) return;
  if (target.length >= PERF_METRICS_SAMPLE_LIMIT) {
    target.shift();
  }
  target.push(value);
};

const computeMetricStats = (samples: number[]) => {
  if (!samples.length) {
    return { avg: 0, p95: 0, count: 0 };
  }
  const count = samples.length;
  let sum = 0;
  for (const value of samples) {
    sum += value;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * 0.95))
  );
  const p95 = sorted[index] ?? sorted[sorted.length - 1] ?? 0;
  return { avg: sum / count, p95, count };
};

const getByteLength = (value: string) => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
};

const hashZoneOrder = (cardIds: string[]) => cardIds.join("|");

const hashCardLite = (card: CardLite) => {
  const revealedTo =
    Array.isArray(card.revealedTo) && card.revealedTo.length
      ? [...card.revealedTo].sort().join(",")
      : "";
  const counters = Array.isArray(card.counters)
    ? card.counters
        .map(
          (counter) =>
            `${counter.type}:${counter.count}:${counter.color ?? ""}`
        )
        .join("|")
    : "";
  const position = card.position
    ? `${card.position.x},${card.position.y}`
    : "";
  return [
    card.id,
    card.ownerId,
    card.controllerId,
    card.zoneId,
    card.deckSection ?? "",
    card.tapped ? "1" : "0",
    card.faceDown ? "1" : "0",
    card.faceDownMode ?? "",
    card.knownToAll ? "1" : "0",
    card.revealedToAll ? "1" : "0",
    revealedTo,
    typeof card.currentFaceIndex === "number" ? String(card.currentFaceIndex) : "",
    card.isCommander ? "1" : "0",
    typeof card.commanderTax === "number" ? String(card.commanderTax) : "",
    position,
    typeof card.rotation === "number" ? String(card.rotation) : "",
    counters,
    card.power ?? "",
    card.toughness ?? "",
    card.basePower ?? "",
    card.baseToughness ?? "",
    card.customText ?? "",
    card.name ?? "",
    card.scryfallId ?? "",
    card.typeLine ?? "",
    card.isToken ? "1" : "0",
  ].join("|");
};

type OverlayCacheState = {
  overlayVersion: number;
  cardHashes: Map<string, string>;
  zoneOrderHashes: Map<string, { hash: string; version: number }>;
  meta: OverlayMeta;
};

type IntentLogMeta = {
  nextIndex: number;
  logStartIndex: number;
  snapshotIndex: number;
  lastSnapshotAt: number;
};

type IntentLogEntry = {
  index: number;
  ts: number;
  intent: Intent;
};

type SnapshotMeta = {
  id: string;
  createdAt: number;
  lastIntentIndex: number;
  hiddenStateMeta: HiddenStateMeta;
};

type OverlayBuildResult = {
  overlay: OverlaySnapshotData;
  cardHashes: Map<string, string>;
  zoneOrderHashes: Map<string, string>;
  meta: OverlayMeta;
};

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
    { playerId: string; count?: number; lastPingAt: number }
  >();
  private libraryViewCleanupTimer: number | null = null;
  private overlayStates = new Map<string, OverlayCacheState>();
  private connectionCapabilities = new Map<string, Set<string>>();
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
  private hiddenStateIdleTimer: number | null = null;
  private hiddenStateLastChangeAt = 0;
  private lastHiddenStatePersistAt = 0;
  private intentLogMeta: IntentLogMeta | null = null;
  private snapshotMeta: SnapshotMeta | null = null;
  private intentLogWritePromise: Promise<void> = Promise.resolve();
  private intentLogWritePending = false;
  private snapshotBarrier: Promise<void> | null = null;
  private snapshotBarrierResolve: (() => void) | null = null;
  private inflightIntentCount = 0;
  private inflightIntentIdle: Promise<void> | null = null;
  private inflightIntentIdleResolve: (() => void) | null = null;
  private lastHiddenStateCleanupAt = 0;
  private lastPerfMetricsAt = 0;
  private perfMetricsEnabledFlag = false;
  private perfMetricsIntervalMs = PERF_METRICS_INTERVAL_MS;
  private perfMetricsTimer: number | null = null;
  private yjsMetricsListenerAttached = false;
  private intentApplySamples: number[] = [];
  private overlayBuildSamples: { player: number[]; spectator: number[] } = {
    player: [],
    spectator: [],
  };
  private overlayBytesSent = { snapshot: 0, diff: 0 };
  private overlayMessagesSent = { snapshot: 0, diff: 0 };
  private overlayResyncCount = 0;
  private intentCountSinceMetrics = 0;
  private lastIntentMetricsAt = 0;
  private yjsUpdateBytes = 0;
  private yjsUpdateCount = 0;

  async onLoad() {
    this.ensureYjsMetricsListener();
    await this.restoreFromSnapshotAndLog();
  }

  private ensureYjsMetricsListener() {
    if (this.yjsMetricsListenerAttached) return;
    this.yjsMetricsListenerAttached = true;
    this.document.on("update", (update: Uint8Array) => {
      const size = update?.byteLength ?? update?.length ?? 0;
      if (Number.isFinite(size)) {
        this.yjsUpdateBytes += size;
      }
      this.yjsUpdateCount += 1;
    });
  }

  private createSnapshotBarrier() {
    let resolve!: () => void;
    this.snapshotBarrier = new Promise<void>((res) => {
      resolve = res;
    });
    this.snapshotBarrierResolve = resolve;
    return () => {
      if (this.snapshotBarrierResolve) {
        this.snapshotBarrierResolve();
      }
      this.snapshotBarrier = null;
      this.snapshotBarrierResolve = null;
    };
  }

  private beginIntentHandling() {
    this.inflightIntentCount += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.inflightIntentCount = Math.max(0, this.inflightIntentCount - 1);
      if (this.inflightIntentCount === 0 && this.inflightIntentIdleResolve) {
        this.inflightIntentIdleResolve();
        this.inflightIntentIdle = null;
        this.inflightIntentIdleResolve = null;
      }
    };
  }

  private async waitForIntentIdle() {
    if (this.inflightIntentCount === 0) return;
    if (!this.inflightIntentIdle) {
      this.inflightIntentIdle = new Promise<void>((resolve) => {
        this.inflightIntentIdleResolve = resolve;
      });
    }
    await this.inflightIntentIdle;
  }

  private async restoreFromSnapshotAndLog() {
    const snapshotMeta = await this.ctx.storage.get<SnapshotMeta>(SNAPSHOT_META_KEY);
    this.snapshotMeta = snapshotMeta ?? null;

    if (snapshotMeta) {
      const stored = await this.ctx.storage.get<ArrayBuffer>(Y_DOC_STORAGE_KEY);
      if (stored) {
        try {
          Y.applyUpdate(this.document, new Uint8Array(stored));
        } catch (err: any) {
          console.error("[party] failed to load yjs snapshot", {
            room: this.name,
            error: err?.message ?? String(err),
          });
        }
      }
      const hidden = await this.loadHiddenStateFromMeta(snapshotMeta.hiddenStateMeta);
      if (hidden) {
        this.hiddenState = hidden;
      }
    } else {
      const stored = await this.ctx.storage.get<ArrayBuffer>(Y_DOC_STORAGE_KEY);
      if (stored) {
        try {
          Y.applyUpdate(this.document, new Uint8Array(stored));
        } catch (err: any) {
          console.error("[party] failed to load yjs state", {
            room: this.name,
            error: err?.message ?? String(err),
          });
        }
      }
    }

    const logMeta = await this.ensureIntentLogMeta(snapshotMeta ?? undefined);
    const replayStart = Math.max(
      logMeta.logStartIndex,
      (snapshotMeta?.lastIntentIndex ?? -1) + 1
    );
    const replayEnd = logMeta.nextIndex - 1;
    if (replayEnd >= replayStart) {
      if (!this.hiddenState) {
        this.hiddenState = createEmptyHiddenState();
      }
      getMaps(this.document);
      for (let index = replayStart; index <= replayEnd; index += 1) {
        const entry = await this.ctx.storage.get<IntentLogEntry>(
          `${INTENT_LOG_PREFIX}${index}`
        );
        if (!entry || !entry.intent) continue;
        const result = applyIntentToDoc(this.document, entry.intent, this.hiddenState);
        if (!result.ok) {
          console.warn("[party] intent replay failed", {
            room: this.name,
            intentIndex: index,
            error: result.error,
          });
        }
      }
    }

    if (this.hiddenState) {
      const now = Date.now();
      this.lastHiddenStatePersistAt = now;
      this.hiddenStateLastChangeAt = now;
    }
  }

  private async loadHiddenStateFromMeta(meta?: HiddenStateMeta | null) {
    if (!meta) return null;
    const cards: Record<string, Card> = {};
    const chunkKeys = Array.isArray(meta.cardChunkKeys) ? meta.cardChunkKeys : [];
    for (const key of chunkKeys) {
      const chunk = await this.ctx.storage.get<Record<string, Card>>(key);
      if (chunk && isRecord(chunk)) {
        Object.assign(cards, chunk as Record<string, Card>);
      }
    }
    const { cardChunkKeys: _keys, ...rest } = meta;
    return normalizeHiddenState({ ...rest, cards });
  }

  private async ensureIntentLogMeta(
    snapshotMeta?: SnapshotMeta
  ): Promise<IntentLogMeta> {
    if (this.intentLogMeta) return this.intentLogMeta;
    const stored = await this.ctx.storage.get<IntentLogMeta>(INTENT_LOG_META_KEY);
    const snapshotIndex = snapshotMeta?.lastIntentIndex ?? stored?.snapshotIndex ?? -1;
    const now = Date.now();
    const createdAt = snapshotMeta?.createdAt ?? stored?.lastSnapshotAt ?? now;
    const base: IntentLogMeta = stored ?? {
      nextIndex: snapshotIndex + 1,
      logStartIndex: snapshotIndex + 1,
      snapshotIndex,
      lastSnapshotAt: createdAt || now,
    };

    if (base.nextIndex < base.logStartIndex) {
      base.nextIndex = base.logStartIndex;
    }
    if (base.logStartIndex < 0) base.logStartIndex = 0;
    if (base.snapshotIndex < -1) base.snapshotIndex = -1;
    if (base.lastSnapshotAt < 0) base.lastSnapshotAt = 0;
    if (snapshotIndex > base.snapshotIndex) {
      base.snapshotIndex = snapshotIndex;
      base.logStartIndex = Math.max(base.logStartIndex, snapshotIndex + 1);
      base.lastSnapshotAt = createdAt || base.lastSnapshotAt;
      if (base.nextIndex < base.logStartIndex) {
        base.nextIndex = base.logStartIndex;
      }
    }

    this.intentLogMeta = base;
    try {
      await this.ctx.storage.put(INTENT_LOG_META_KEY, base);
    } catch (_err) {}
    return base;
  }

  async onSave() {
    if (this.isHiddenStateDirty()) {
      this.enqueueHiddenStatePersist(this.resetGeneration);
      if (this.hiddenStatePersistInFlight) {
        await this.hiddenStatePersistInFlight;
      }
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
    if (this.snapshotMeta?.hiddenStateMeta) {
      const restored = await this.loadHiddenStateFromMeta(this.snapshotMeta.hiddenStateMeta);
      if (restored) {
        this.hiddenState = restored;
        return this.hiddenState;
      }
    }
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
    if (this.snapshotBarrier) {
      await this.snapshotBarrier;
    }
    const releaseSnapshotBarrier = this.createSnapshotBarrier();
    try {
      if (this.inflightIntentCount > 0) {
        await this.waitForIntentIdle();
      }
      if (this.intentLogWritePending) {
        await this.intentLogWritePromise;
      }
      if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;

      const previousSnapshot = this.snapshotMeta;
      const intentLogMeta = await this.ensureIntentLogMeta(
        this.snapshotMeta ?? undefined
      );
      const lastIntentIndex = Math.max(
        intentLogMeta.snapshotIndex,
        intentLogMeta.nextIndex - 1
      );
      const snapshotId = crypto.randomUUID();
      const createdAt = Date.now();

      try {
        const update = Y.encodeStateAsUpdate(this.document);
        await this.ctx.storage.put(Y_DOC_STORAGE_KEY, update.buffer);
      } catch (err: any) {
        console.error("[party] failed to save yjs snapshot", {
          room: this.name,
          error: err?.message ?? String(err),
        });
      }

      if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
      const { cards, ...rest } = this.hiddenState;
      const chunks = chunkHiddenCards(cards);
      const chunkKeys = chunks.map(
        (_chunk, index) => `${SNAPSHOT_HIDDEN_PREFIX}${snapshotId}:${index}`
      );

      for (let index = 0; index < chunks.length; index += 1) {
        if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
        const key = chunkKeys[index];
        await this.ctx.storage.put(key, chunks[index]);
      }

      if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
      const hiddenMeta: HiddenStateMeta = {
        ...rest,
        cardChunkKeys: chunkKeys,
      };
      const nextSnapshotMeta: SnapshotMeta = {
        id: snapshotId,
        createdAt,
        lastIntentIndex,
        hiddenStateMeta: hiddenMeta,
      };
      if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
      await this.ctx.storage.put(SNAPSHOT_META_KEY, nextSnapshotMeta);
      if (!this.shouldPersistHiddenState(expectedResetGeneration)) {
        await this.cleanupSnapshotWrite(nextSnapshotMeta);
        return;
      }
      this.snapshotMeta = nextSnapshotMeta;

      if (!this.shouldPersistHiddenState(expectedResetGeneration)) {
        await this.cleanupSnapshotWrite(nextSnapshotMeta);
        return;
      }
      const previousLogStart = intentLogMeta.logStartIndex;
      intentLogMeta.snapshotIndex = lastIntentIndex;
      intentLogMeta.lastSnapshotAt = createdAt;
      intentLogMeta.logStartIndex = Math.max(
        intentLogMeta.logStartIndex,
        lastIntentIndex + 1
      );
      if (intentLogMeta.nextIndex < intentLogMeta.logStartIndex) {
        intentLogMeta.nextIndex = intentLogMeta.logStartIndex;
      }
      this.intentLogMeta = intentLogMeta;
      await this.ctx.storage.put(INTENT_LOG_META_KEY, intentLogMeta);

      if (intentLogMeta.logStartIndex > previousLogStart) {
        await this.pruneIntentLogEntries(
          previousLogStart,
          intentLogMeta.logStartIndex - 1,
          expectedResetGeneration
        );
      }

      await this.cleanupPreviousSnapshot(previousSnapshot, expectedResetGeneration);
      await this.cleanupLegacyHiddenStateStorage(expectedResetGeneration);
    } finally {
      releaseSnapshotBarrier();
    }
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

  private async pruneIntentLogEntries(
    startIndex: number,
    endIndex: number,
    expectedResetGeneration?: number
  ) {
    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    if (endIndex < startIndex) return;
    for (let index = startIndex; index <= endIndex; index += 1) {
      if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
      try {
        await this.ctx.storage.delete(`${INTENT_LOG_PREFIX}${index}`);
      } catch (_err) {}
    }
  }

  private async cleanupPreviousSnapshot(
    previous: SnapshotMeta | null | undefined,
    expectedResetGeneration?: number
  ) {
    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    if (!previous?.hiddenStateMeta?.cardChunkKeys?.length) return;
    for (const key of previous.hiddenStateMeta.cardChunkKeys) {
      if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
      try {
        await this.ctx.storage.delete(key);
      } catch (_err) {}
    }
  }

  private async cleanupSnapshotWrite(meta: SnapshotMeta) {
    try {
      await this.ctx.storage.delete(SNAPSHOT_META_KEY);
    } catch (_err) {}
    const chunkKeys = meta?.hiddenStateMeta?.cardChunkKeys ?? [];
    for (const key of chunkKeys) {
      try {
        await this.ctx.storage.delete(key);
      } catch (_err) {}
    }
  }

  private async cleanupLegacyHiddenStateStorage(
    expectedResetGeneration?: number
  ) {
    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    let legacyMeta: HiddenStateMeta | null = null;
    try {
      legacyMeta =
        (await this.ctx.storage.get<HiddenStateMeta>(HIDDEN_STATE_META_KEY)) ??
        null;
    } catch (_err) {
      legacyMeta = null;
    }
    if (legacyMeta?.cardChunkKeys?.length) {
      for (const key of legacyMeta.cardChunkKeys) {
        if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
        try {
          await this.ctx.storage.delete(key);
        } catch (_err) {}
      }
      await this.maybeCleanupHiddenStateChunks(
        legacyMeta,
        expectedResetGeneration
      );
    }
    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    try {
      await this.ctx.storage.delete(HIDDEN_STATE_META_KEY);
    } catch (_err) {}
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

  private clearHiddenStatePersistTimer() {
    if (this.hiddenStatePersistTimer !== null) {
      clearTimeout(this.hiddenStatePersistTimer);
      this.hiddenStatePersistTimer = null;
    }
    this.hiddenStatePersistQueued = null;
    this.clearHiddenStateIdleTimer();
  }

  private clearHiddenStateIdleTimer() {
    if (this.hiddenStateIdleTimer !== null) {
      clearTimeout(this.hiddenStateIdleTimer);
      this.hiddenStateIdleTimer = null;
    }
  }

  private clearPerfMetricsTimer() {
    if (this.perfMetricsTimer !== null) {
      clearInterval(this.perfMetricsTimer);
      this.perfMetricsTimer = null;
    }
  }

  private clearLibraryViewCleanupTimer() {
    if (this.libraryViewCleanupTimer !== null) {
      clearInterval(this.libraryViewCleanupTimer);
      this.libraryViewCleanupTimer = null;
    }
  }

  private ensureLibraryViewCleanupTimer() {
    if (this.libraryViewCleanupTimer !== null) return;
    this.libraryViewCleanupTimer = setInterval(() => {
      this.cleanupExpiredLibraryViews();
    }, LIBRARY_VIEW_CLEANUP_INTERVAL_MS) as unknown as number;
  }

  private cleanupExpiredLibraryViews() {
    if (this.libraryViews.size === 0) {
      this.clearLibraryViewCleanupTimer();
      return;
    }
    const now = Date.now();
    const expired: string[] = [];
    for (const [connId, entry] of this.libraryViews.entries()) {
      if (now - entry.lastPingAt > LIBRARY_VIEW_PING_TIMEOUT_MS) {
        expired.push(connId);
      }
    }
    if (!expired.length) return;
    for (const connId of expired) {
      this.libraryViews.delete(connId);
      const connection = this.findIntentConnectionById(connId);
      if (connection) {
        void this.sendOverlayForConnection(connection);
      }
    }
    if (this.libraryViews.size === 0) {
      this.clearLibraryViewCleanupTimer();
    }
  }

  private findIntentConnectionById(connId: string): Connection | undefined {
    for (const connection of this.intentConnections) {
      if (connection.id === connId) return connection;
    }
    return undefined;
  }

  private scheduleHiddenStatePersist(
    expectedResetGeneration: number,
    connId?: string
  ) {
    if (!this.hiddenState) return;
    if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
    const now = Date.now();
    const changeAt = Math.max(
      now,
      this.hiddenStateLastChangeAt + 1,
      this.lastHiddenStatePersistAt + 1
    );
    this.hiddenStateLastChangeAt = changeAt;
    this.scheduleHiddenStateIdleFlush(expectedResetGeneration, connId, changeAt);
    const meta = this.intentLogMeta;
    if (!meta) {
      this.maybeLogPerfMetrics("hidden-state-change");
      return;
    }
    const intentsSinceSnapshot = this.getIntentCountSinceSnapshot(meta);
    if (intentsSinceSnapshot <= 0) {
      this.maybeLogPerfMetrics("hidden-state-change");
      return;
    }
    const forceSnapshot = intentsSinceSnapshot >= INTENT_LOG_MAX_ENTRIES;
    const shouldSchedule =
      forceSnapshot ||
      intentsSinceSnapshot >= SNAPSHOT_INTENT_THRESHOLD ||
      now - meta.lastSnapshotAt >= SNAPSHOT_TIME_THRESHOLD_MS;
    if (forceSnapshot) {
      this.enqueueHiddenStatePersist(expectedResetGeneration, connId);
      this.maybeLogPerfMetrics("hidden-state-change");
      return;
    }
    if (!shouldSchedule) {
      this.maybeLogPerfMetrics("hidden-state-change");
      return;
    }
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

  private scheduleHiddenStateIdleFlush(
    expectedResetGeneration: number,
    connId: string | undefined,
    changeAt: number
  ) {
    if (this.hiddenStateIdleTimer !== null) {
      clearTimeout(this.hiddenStateIdleTimer);
    }
    const scheduledGeneration = expectedResetGeneration;
    const scheduledConnId = connId ?? null;
    const scheduledChangeAt = changeAt;
    this.hiddenStateIdleTimer = setTimeout(() => {
      this.hiddenStateIdleTimer = null;
      if (!this.shouldPersistHiddenState(scheduledGeneration)) return;
      if (this.hiddenStateLastChangeAt !== scheduledChangeAt) return;
      if (!this.isHiddenStateDirty()) return;
      this.enqueueHiddenStatePersist(scheduledGeneration, scheduledConnId);
    }, HIDDEN_STATE_PERSIST_IDLE_MS) as unknown as number;
  }

  private async appendIntentLog(
    intent: Intent,
    expectedResetGeneration?: number,
    connId?: string
  ) {
    let wrote = false;
    this.intentLogWritePending = true;
    const writePromise = this.intentLogWritePromise
      .then(async () => {
        if (!this.shouldPersistHiddenState(expectedResetGeneration)) return;
        const meta = await this.ensureIntentLogMeta(this.snapshotMeta ?? undefined);
        const index = meta.nextIndex;
        const entry: IntentLogEntry = {
          index,
          ts: Date.now(),
          intent,
        };
        await this.ctx.storage.put(`${INTENT_LOG_PREFIX}${index}`, entry);
        meta.nextIndex = index + 1;
        if (meta.logStartIndex > meta.nextIndex) {
          meta.logStartIndex = meta.nextIndex;
        }
        this.intentLogMeta = meta;
        await this.ctx.storage.put(INTENT_LOG_META_KEY, meta);
        wrote = true;
      })
      .catch((err: any) => {
        console.error("[party] intent log append failed", {
          room: this.name,
          connId: connId ?? undefined,
          error: err?.message ?? String(err),
        });
      })
      .finally(() => {
        if (this.intentLogWritePromise === writePromise) {
          this.intentLogWritePending = false;
        }
      });
    this.intentLogWritePromise = writePromise;
    await this.intentLogWritePromise;
    return wrote;
  }

  private isHiddenStateDirty() {
    return (
      Boolean(this.hiddenState) &&
      this.hiddenStateLastChangeAt > this.lastHiddenStatePersistAt
    );
  }

  private getIntentCountSinceSnapshot(meta: IntentLogMeta) {
    return Math.max(0, meta.nextIndex - 1 - meta.snapshotIndex);
  }

  private shouldLogIntent(hiddenChanged: boolean, impact?: IntentImpact) {
    return hiddenChanged || Boolean(impact?.changedPublicDoc);
  }

  private enqueueHiddenStatePersist(
    expectedResetGeneration: number,
    connId?: string | null
  ) {
    if (!this.isHiddenStateDirty()) return;
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
    const persistStartedAt = Date.now();
    try {
      await this.persistHiddenState(expectedResetGeneration);
      this.lastHiddenStatePersistAt = persistStartedAt;
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
    const previousMetricsAt = this.lastPerfMetricsAt || now;
    const metricsWindowSec = Math.max(1, (now - previousMetricsAt) / 1000);
    this.lastPerfMetricsAt = now;
    if (this.lastIntentMetricsAt === 0) {
      this.lastIntentMetricsAt = previousMetricsAt;
    }

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

    const intentStats = computeMetricStats(this.intentApplySamples);
    const overlayPlayerStats = computeMetricStats(this.overlayBuildSamples.player);
    const overlaySpectatorStats = computeMetricStats(this.overlayBuildSamples.spectator);
    const totalOverlayBytes =
      this.overlayBytesSent.snapshot + this.overlayBytesSent.diff;
    const totalOverlayMessages =
      this.overlayMessagesSent.snapshot + this.overlayMessagesSent.diff;
    const intentRate =
      this.intentCountSinceMetrics > 0
        ? this.intentCountSinceMetrics / metricsWindowSec
        : 0;
    const yjsUpdatesPerSec =
      this.yjsUpdateCount > 0 ? this.yjsUpdateCount / metricsWindowSec : 0;

    const metrics = {
      ts: now,
      timestamp: new Date(now).toISOString(),
      intervalMs: this.perfMetricsIntervalMs,
      room: this.name,
      reason,
      connections: this.connectionRoles.size,
      intentConnections: this.intentConnections.size,
      overlays: this.overlayStates.size,
      libraryViews: this.libraryViews.size,
      roomHotness: {
        intentsPerSec: intentRate,
        intentCount: this.intentCountSinceMetrics,
      },
      intentApplyMs: intentStats,
      overlayBuildMs: {
        player: overlayPlayerStats,
        spectator: overlaySpectatorStats,
      },
      overlayBytesSent: {
        snapshot: this.overlayBytesSent.snapshot,
        diff: this.overlayBytesSent.diff,
        total: totalOverlayBytes,
      },
      overlayMessagesSent: {
        snapshot: this.overlayMessagesSent.snapshot,
        diff: this.overlayMessagesSent.diff,
        total: totalOverlayMessages,
      },
      overlayResyncCount: this.overlayResyncCount,
      yjs: {
        players: maps.players.size,
        zones: maps.zones.size,
        cards: maps.cards.size,
        zoneCardOrders: maps.zoneCardOrders.size,
        handRevealsToAll: maps.handRevealsToAll.size,
        libraryRevealsToAll: maps.libraryRevealsToAll.size,
        faceDownRevealsToAll: maps.faceDownRevealsToAll.size,
        playerOrder: maps.playerOrder.length,
        bytesSent: this.yjsUpdateBytes,
        updateCount: this.yjsUpdateCount,
        updatesPerSec: yjsUpdatesPerSec,
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

    this.intentApplySamples = [];
    this.overlayBuildSamples.player = [];
    this.overlayBuildSamples.spectator = [];
    this.overlayBytesSent = { snapshot: 0, diff: 0 };
    this.overlayMessagesSent = { snapshot: 0, diff: 0 };
    this.overlayResyncCount = 0;
    this.intentCountSinceMetrics = 0;
    this.lastIntentMetricsAt = now;
    this.yjsUpdateBytes = 0;
    this.yjsUpdateCount = 0;
  }

  private maybeLogPerfMetrics(reason: string) {
    if (!this.perfMetricsEnabled()) return;
    const now = Date.now();
    if (now - this.lastPerfMetricsAt < this.perfMetricsIntervalMs) return;
    this.logPerfMetrics(reason);
  }

  private recordOverlaySend(type: "snapshot" | "diff", message: string) {
    const bytes = getByteLength(message);
    if (type === "snapshot") {
      this.overlayBytesSent.snapshot += bytes;
      this.overlayMessagesSent.snapshot += 1;
    } else {
      this.overlayBytesSent.diff += bytes;
      this.overlayMessagesSent.diff += 1;
    }
  }

  private handleHelloMessage(conn: Connection, payload: unknown) {
    const requested = payload && typeof payload === "object" ? (payload as any).capabilities : null;
    const capabilities = Array.isArray(requested)
      ? requested.filter((value) => typeof value === "string")
      : [];
    const supported = new Set([OVERLAY_DIFF_CAPABILITY]);
    const accepted = capabilities.filter((value) => supported.has(value));
    this.connectionCapabilities.set(conn.id, new Set(accepted));
    try {
      conn.send(
        JSON.stringify({
          type: "helloAck",
          payload: { acceptedCapabilities: accepted },
        })
      );
    } catch (_err) {}
  }

  private async handleOverlayResync(conn: Connection, _payload: unknown) {
    await this.sendOverlayForConnection(conn, undefined, undefined, undefined, undefined, {
      forceSnapshot: true,
    });
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
    if (!this.hasPlayerConnections()) {
      this.enqueueHiddenStatePersist(this.resetGeneration, conn.id);
    }
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
      this.connectionCapabilities.clear();
      for (const connection of connections) {
        try {
          connection.close(ROOM_TEARDOWN_CLOSE_CODE, "room reset");
        } catch (_err) {}
      }

      if (this.isHiddenStateDirty()) {
        await this.flushHiddenStatePersist(this.resetGeneration);
      }
      this.hiddenState = null;
      this.roomTokens = null;
      this.intentLogMeta = null;
      this.snapshotMeta = null;
      this.intentLogWritePromise = Promise.resolve();
      this.libraryViews.clear();
      this.clearLibraryViewCleanupTimer();
      this.overlayStates.clear();

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
    this.ensureYjsMetricsListener();
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
      this.connectionCapabilities.delete(conn.id);
      this.libraryViews.delete(conn.id);
      if (this.libraryViews.size === 0) {
        this.clearLibraryViewCleanupTimer();
      }
      this.overlayStates.delete(conn.id);
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
      this.connectionCapabilities.delete(conn.id);
      this.libraryViews.delete(conn.id);
      if (this.libraryViews.size === 0) {
        this.clearLibraryViewCleanupTimer();
      }
      this.overlayStates.delete(conn.id);
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

      if (!parsed || typeof parsed.type !== "string") return;
      if (parsed.type === "hello") {
        this.handleHelloMessage(conn, parsed.payload);
        return;
      }
      if (parsed.type === "overlayResync") {
        void this.handleOverlayResync(conn, parsed.payload);
        return;
      }
      if (parsed.type !== "intent") return;
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
    if (this.snapshotBarrier) {
      await this.snapshotBarrier;
    }
    const finishIntent = this.beginIntentHandling();
    try {
      let ok = false;
      let error: string | undefined;
      let logEvents: { eventId: string; payload: Record<string, unknown> }[] = [];
      let hiddenChanged = false;
      let intentImpact: IntentImpact | undefined;
      this.intentCountSinceMetrics += 1;
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
        const applyStart = nowMs();
        const doc = this.document;
        const hidden = await this.ensureHiddenState(doc);
        const result = applyIntentToDoc(doc, normalizedIntent, hidden);
        const applyDuration = nowMs() - applyStart;
        sampleMetric(this.intentApplySamples, applyDuration);
        ok = result.ok;
        if (result.ok) {
          logEvents = result.logEvents;
          hiddenChanged = Boolean(result.hiddenChanged);
          intentImpact = result.impact;
        } else {
          error = result.error;
        }
      } catch (err: any) {
        ok = false;
        error = err?.message ?? "intent handler failed";
      }

      sendAck(intent.id, ok, error);

      const shouldLogIntent =
        ok && this.shouldLogIntent(hiddenChanged, intentImpact);
      if (shouldLogIntent) {
        const logged = await this.appendIntentLog(
          normalizedIntent,
          resetGeneration,
          conn.id
        );
        if (!logged) {
          this.enqueueHiddenStatePersist(resetGeneration, conn.id);
        }
        this.scheduleHiddenStatePersist(resetGeneration, conn.id);
      }

      if (ok && hiddenChanged) {
        await this.broadcastOverlays(intentImpact);
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

      if (ok) {
        if (normalizedIntent.type === "library.view") {
          await this.handleLibraryViewIntent(conn, normalizedIntent);
        } else if (normalizedIntent.type === "library.view.close") {
          await this.handleLibraryViewCloseIntent(conn, normalizedIntent);
        } else if (normalizedIntent.type === "library.view.ping") {
          this.handleLibraryViewPingIntent(conn, normalizedIntent);
        }
      }
    } finally {
      finishIntent();
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
    zoneLookup?: ReturnType<typeof buildOverlayZoneLookup>,
    options?: { forceSnapshot?: boolean }
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
      const buildResult = this.buildOverlaySnapshotData({
        snapshot: overlaySnapshot,
        zoneLookup: overlayZoneLookup,
        hidden: activeHidden,
        viewerRole,
        viewerId,
        libraryView,
      });
      this.sendOverlayForConnectionWithBuildResult(conn, buildResult, viewerId, {
        forceSnapshot: options?.forceSnapshot,
      });
    } catch (_err) {}
  }

  private async broadcastOverlays(impact?: IntentImpact) {
    if (this.intentConnections.size === 0) return;

    const maps = getMaps(this.document);
    const hidden = await this.ensureHiddenState(this.document);
    const snapshot = buildSnapshot(maps);
    const zoneLookup = buildOverlayZoneLookup(snapshot);
    const overlayBuildCache = new Map<string, OverlayBuildResult>();
    const revealScopes = impact?.changedRevealScopes;
    const impactedOwners = new Set<string>(impact?.changedOwners ?? []);
    let unknownZoneImpact = false;
    if (Array.isArray(impact?.changedZones)) {
      impact.changedZones.forEach((zoneId) => {
        const zone = snapshot.zones[zoneId];
        if (zone?.ownerId) {
          impactedOwners.add(zone.ownerId);
        } else {
          unknownZoneImpact = true;
        }
      });
    }
    const shouldBroadcastAll =
      !impact ||
      Boolean(revealScopes?.toAll) ||
      unknownZoneImpact ||
      (impactedOwners.size === 0 &&
        (revealScopes?.toPlayers?.length ?? 0) === 0);
    const affectedPlayers = new Set<string>(
      shouldBroadcastAll ? [] : impactedOwners
    );
    if (!shouldBroadcastAll && Array.isArray(revealScopes?.toPlayers)) {
      revealScopes?.toPlayers.forEach((playerId) => {
        if (typeof playerId === "string") affectedPlayers.add(playerId);
      });
    }
    for (const connection of this.intentConnections) {
      const state = (connection.state ?? {}) as IntentConnectionState;
      const viewerRole = state.viewerRole ?? "player";
      const viewerId = state.playerId;
      const libraryView = this.libraryViews.get(connection.id);
      const libraryViewOwner = libraryView?.playerId;
      const shouldSend =
        viewerRole === "spectator" ||
        shouldBroadcastAll ||
        (viewerId ? affectedPlayers.has(viewerId) : false) ||
        (libraryViewOwner ? impactedOwners.has(libraryViewOwner) : false);
      if (!shouldSend) continue;
      const cacheKey = `${viewerRole}|${viewerId ?? ""}|${libraryView?.playerId ?? ""}|${
        libraryView?.count ?? ""
      }`;
      let buildResult = overlayBuildCache.get(cacheKey);
      if (!buildResult) {
        buildResult = this.buildOverlaySnapshotData({
          snapshot,
          zoneLookup,
          hidden,
          viewerRole,
          viewerId,
          libraryView,
        });
        overlayBuildCache.set(cacheKey, buildResult);
      }
      this.sendOverlayForConnectionWithBuildResult(
        connection,
        buildResult,
        viewerId
      );
    }
    this.maybeLogPerfMetrics("overlay-broadcast");
  }

  private sendOverlayForConnectionWithBuildResult(
    conn: Connection,
    buildResult: OverlayBuildResult,
    viewerId?: string,
    options?: { forceSnapshot?: boolean }
  ) {
    try {
      const cache = this.overlayStates.get(conn.id);
      const capabilities = this.connectionCapabilities.get(conn.id);
      const supportsDiff = capabilities?.has(OVERLAY_DIFF_CAPABILITY) ?? false;
      const forceSnapshot = options?.forceSnapshot ?? false;
      const diffResult =
        cache && !forceSnapshot ? this.computeOverlayDiff(buildResult, cache) : null;

      if (cache && diffResult && !diffResult.hasChanges) return;

      if (!cache || !supportsDiff || forceSnapshot) {
        const { zoneCardOrderVersions, nextZoneOrderHashes } =
          this.computeZoneOrderVersions(buildResult, cache);
        const nextOverlayVersion = (cache?.overlayVersion ?? 0) + 1;
        const payload = this.buildOverlaySnapshotPayload({
          overlay: buildResult.overlay,
          overlayVersion: nextOverlayVersion,
          zoneCardOrderVersions,
          viewerId,
          meta: buildResult.meta,
        });
        const message = JSON.stringify({
          type: "privateOverlay",
          payload,
        });
        conn.send(message);
        this.recordOverlaySend("snapshot", message);
        if (forceSnapshot && cache) {
          this.overlayResyncCount += 1;
        }
        this.overlayStates.set(conn.id, {
          overlayVersion: nextOverlayVersion,
          cardHashes: buildResult.cardHashes,
          zoneOrderHashes: nextZoneOrderHashes,
          meta: buildResult.meta,
        });
        return;
      }

      if (!diffResult) return;

      const baseOverlayVersion = cache.overlayVersion;
      const nextOverlayVersion = baseOverlayVersion + 1;

      const diffPayload = this.buildOverlayDiffPayload({
        diff: diffResult.diff,
        overlayVersion: nextOverlayVersion,
        baseOverlayVersion,
        viewerId,
        meta: buildResult.meta,
      });
      const diffMessage = JSON.stringify({
        type: "privateOverlayDiff",
        payload: diffPayload,
      });

      const { zoneCardOrderVersions, nextZoneOrderHashes } =
        this.computeZoneOrderVersions(buildResult, cache);
      const snapshotPayload = this.buildOverlaySnapshotPayload({
        overlay: buildResult.overlay,
        overlayVersion: nextOverlayVersion,
        zoneCardOrderVersions,
        viewerId,
        meta: buildResult.meta,
      });
      const snapshotMessage = JSON.stringify({
        type: "privateOverlay",
        payload: snapshotPayload,
      });

      const diffBytes = getByteLength(diffMessage);
      const snapshotBytes = getByteLength(snapshotMessage);

      if (this.shouldFallbackToSnapshot(diffBytes, snapshotBytes)) {
        conn.send(snapshotMessage);
        this.recordOverlaySend("snapshot", snapshotMessage);
        this.overlayResyncCount += 1;
        this.overlayStates.set(conn.id, {
          overlayVersion: nextOverlayVersion,
          cardHashes: buildResult.cardHashes,
          zoneOrderHashes: nextZoneOrderHashes,
          meta: buildResult.meta,
        });
        return;
      }

      conn.send(diffMessage);
      this.recordOverlaySend("diff", diffMessage);
      this.overlayStates.set(conn.id, {
        overlayVersion: nextOverlayVersion,
        cardHashes: buildResult.cardHashes,
        zoneOrderHashes: diffResult.nextZoneOrderHashes,
        meta: buildResult.meta,
      });
    } catch (_err) {}
  }

  private buildOverlaySnapshotData(params: {
    snapshot: Snapshot;
    zoneLookup: ReturnType<typeof buildOverlayZoneLookup>;
    hidden: HiddenState;
    viewerRole: "player" | "spectator";
    viewerId?: string;
    libraryView?: { playerId: string; count?: number };
  }): OverlayBuildResult {
    const buildStart = nowMs();
    const overlay = buildOverlayForViewer({
      snapshot: params.snapshot,
      zoneLookup: params.zoneLookup,
      hidden: params.hidden,
      viewerRole: params.viewerRole,
      viewerId: params.viewerId,
      libraryView: params.libraryView,
    });
    const buildDuration = nowMs() - buildStart;
    if (params.viewerRole === "spectator") {
      sampleMetric(this.overlayBuildSamples.spectator, buildDuration);
    } else {
      sampleMetric(this.overlayBuildSamples.player, buildDuration);
    }

    const cardHashes = new Map<string, string>();
    let cardsWithArt = 0;
    for (const card of overlay.cards ?? []) {
      cardHashes.set(card.id, hashCardLite(card));
      if (typeof card.scryfallId === "string" && card.scryfallId.length > 0) {
        cardsWithArt += 1;
      }
    }
    const viewerHandCount =
      params.viewerRole !== "spectator" && params.viewerId
        ? (params.hidden.handOrder[params.viewerId]?.length ?? 0)
        : 0;
    const zoneOrderHashes = new Map<string, string>();
    if (overlay.zoneCardOrders) {
      for (const [zoneId, cardIds] of Object.entries(overlay.zoneCardOrders)) {
        if (!Array.isArray(cardIds)) continue;
        zoneOrderHashes.set(zoneId, hashZoneOrder(cardIds));
      }
    }

    return {
      overlay,
      cardHashes,
      zoneOrderHashes,
      meta: {
        cardCount: overlay.cards?.length ?? 0,
        cardsWithArt,
        viewerHandCount,
      },
    };
  }

  private buildOverlaySnapshotPayload(params: {
    overlay: OverlaySnapshotData;
    overlayVersion: number;
    zoneCardOrderVersions: Record<string, number>;
    viewerId?: string;
    meta: OverlayMeta;
  }): PrivateOverlayPayload {
    return {
      schemaVersion: OVERLAY_SCHEMA_VERSION,
      overlayVersion: params.overlayVersion,
      roomId: this.name,
      ...(params.viewerId ? { viewerId: params.viewerId } : null),
      cards: params.overlay.cards,
      ...(params.overlay.zoneCardOrders
        ? { zoneCardOrders: params.overlay.zoneCardOrders }
        : null),
      ...(Object.keys(params.zoneCardOrderVersions).length
        ? { zoneCardOrderVersions: params.zoneCardOrderVersions }
        : null),
      meta: params.meta,
    };
  }

  private buildOverlayDiffPayload(params: {
    diff: {
      upserts: CardLite[];
      removes: string[];
      zoneCardOrders?: Record<string, string[]>;
      zoneOrderRemovals?: string[];
      zoneCardOrderVersions?: Record<string, number>;
    };
    overlayVersion: number;
    baseOverlayVersion: number;
    viewerId?: string;
    meta: OverlayMeta;
  }): PrivateOverlayDiffPayload {
    return {
      schemaVersion: OVERLAY_SCHEMA_VERSION,
      overlayVersion: params.overlayVersion,
      baseOverlayVersion: params.baseOverlayVersion,
      roomId: this.name,
      ...(params.viewerId ? { viewerId: params.viewerId } : null),
      upserts: params.diff.upserts,
      removes: params.diff.removes,
      ...(params.diff.zoneCardOrders
        ? { zoneCardOrders: params.diff.zoneCardOrders }
        : null),
      ...(params.diff.zoneOrderRemovals && params.diff.zoneOrderRemovals.length
        ? { zoneOrderRemovals: params.diff.zoneOrderRemovals }
        : null),
      ...(params.diff.zoneCardOrderVersions &&
      Object.keys(params.diff.zoneCardOrderVersions).length
        ? { zoneCardOrderVersions: params.diff.zoneCardOrderVersions }
        : null),
      meta: params.meta,
    };
  }

  private computeZoneOrderVersions(
    build: OverlayBuildResult,
    cache?: OverlayCacheState
  ) {
    const zoneCardOrderVersions: Record<string, number> = {};
    const nextZoneOrderHashes = new Map<string, { hash: string; version: number }>();

    for (const [zoneId, hash] of build.zoneOrderHashes.entries()) {
      const prev = cache?.zoneOrderHashes.get(zoneId);
      const version = prev
        ? prev.hash === hash
          ? prev.version
          : prev.version + 1
        : 1;
      zoneCardOrderVersions[zoneId] = version;
      nextZoneOrderHashes.set(zoneId, { hash, version });
    }

    return { zoneCardOrderVersions, nextZoneOrderHashes };
  }

  private computeOverlayDiff(build: OverlayBuildResult, cache: OverlayCacheState) {
    const upserts: CardLite[] = [];
    for (const card of build.overlay.cards ?? []) {
      const hash = build.cardHashes.get(card.id);
      const prev = cache.cardHashes.get(card.id);
      if (!prev || !hash || prev !== hash) {
        upserts.push(card);
      }
    }

    const removes: string[] = [];
    for (const cardId of cache.cardHashes.keys()) {
      if (!build.cardHashes.has(cardId)) {
        removes.push(cardId);
      }
    }

    const zoneOrderRemovals: string[] = [];
    const zoneCardOrders: Record<string, string[]> = {};
    const zoneCardOrderVersions: Record<string, number> = {};
    const nextZoneOrderHashes = new Map<string, { hash: string; version: number }>();

    for (const [zoneId, hash] of build.zoneOrderHashes.entries()) {
      const prev = cache.zoneOrderHashes.get(zoneId);
      const version = prev
        ? prev.hash === hash
          ? prev.version
          : prev.version + 1
        : 1;
      nextZoneOrderHashes.set(zoneId, { hash, version });
      if (!prev || prev.hash !== hash) {
        const nextOrder = build.overlay.zoneCardOrders?.[zoneId];
        if (Array.isArray(nextOrder)) {
          zoneCardOrders[zoneId] = nextOrder;
          zoneCardOrderVersions[zoneId] = version;
        }
      }
    }

    for (const zoneId of cache.zoneOrderHashes.keys()) {
      if (!build.zoneOrderHashes.has(zoneId)) {
        zoneOrderRemovals.push(zoneId);
      }
    }

    const hasChanges =
      upserts.length > 0 ||
      removes.length > 0 ||
      Object.keys(zoneCardOrders).length > 0 ||
      zoneOrderRemovals.length > 0;

    return {
      hasChanges,
      diff: {
        upserts,
        removes,
        ...(Object.keys(zoneCardOrders).length
          ? { zoneCardOrders }
          : null),
        ...(zoneOrderRemovals.length ? { zoneOrderRemovals } : null),
        ...(Object.keys(zoneCardOrderVersions).length
          ? { zoneCardOrderVersions }
          : null),
      },
      nextZoneOrderHashes,
    };
  }

  private shouldFallbackToSnapshot(diffBytes: number, snapshotBytes: number) {
    if (!Number.isFinite(diffBytes) || !Number.isFinite(snapshotBytes)) return true;
    if (diffBytes > OVERLAY_DIFF_MAX_BYTES) return true;
    if (snapshotBytes <= 0) return true;
    return diffBytes / snapshotBytes > OVERLAY_DIFF_MAX_RATIO;
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
    this.libraryViews.set(conn.id, {
      playerId,
      ...(count ? { count } : null),
      lastPingAt: Date.now(),
    });
    this.ensureLibraryViewCleanupTimer();
    await this.sendOverlayForConnection(conn);
  }

  private async handleLibraryViewCloseIntent(conn: Connection, intent: Intent) {
    const state = (conn.state ?? {}) as IntentConnectionState;
    if (state.viewerRole === "spectator") return;
    const viewerId = state.playerId;
    const payload = isRecord(intent.payload) ? intent.payload : {};
    const playerId =
      typeof payload.playerId === "string" ? payload.playerId : null;
    if (!playerId) return;
    if (viewerId && viewerId !== playerId) return;
    this.libraryViews.delete(conn.id);
    if (this.libraryViews.size === 0) {
      this.clearLibraryViewCleanupTimer();
    }
    await this.sendOverlayForConnection(conn);
  }

  private handleLibraryViewPingIntent(conn: Connection, intent: Intent) {
    const state = (conn.state ?? {}) as IntentConnectionState;
    if (state.viewerRole === "spectator") return;
    const viewerId = state.playerId;
    const payload = isRecord(intent.payload) ? intent.payload : {};
    const playerId =
      typeof payload.playerId === "string" ? payload.playerId : null;
    if (!playerId) return;
    if (viewerId && viewerId !== playerId) return;
    const existing = this.libraryViews.get(conn.id);
    if (!existing || existing.playerId !== playerId) return;
    existing.lastPingAt = Date.now();
    this.libraryViews.set(conn.id, existing);
    this.ensureLibraryViewCleanupTimer();
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
