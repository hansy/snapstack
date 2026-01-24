import type { Connection } from "partyserver";

import type { CardLite } from "@mtg/shared/types/cards";

import { buildOverlayForViewer } from "../domain/overlay";
import type {
  HiddenState,
  OverlayMeta,
  OverlaySnapshotData,
  PrivateOverlayDiffPayload,
  PrivateOverlayPayload,
  Snapshot,
} from "../domain/types";

const DEFAULT_SCHEMA_VERSION = 1;
const DEFAULT_DIFF_MAX_RATIO = 0.7;
const DEFAULT_DIFF_MAX_BYTES = 64_000;

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

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
          (counter) => `${counter.type}:${counter.count}:${counter.color ?? ""}`
        )
        .join("|")
    : "";
  const position = card.position ? `${card.position.x},${card.position.y}` : "";
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

export type OverlayBuildResult = {
  overlay: OverlaySnapshotData;
  cardHashes: Map<string, string>;
  zoneOrderHashes: Map<string, string>;
  meta: OverlayMeta;
};

export type OverlayMetrics = {
  buildSamples: { player: number[]; spectator: number[] };
  bytesSent: { snapshot: number; diff: number };
  messagesSent: { snapshot: number; diff: number };
  resyncCount: number;
};

type OverlayDiffResult = {
  hasChanges: boolean;
  diff: {
    upserts: CardLite[];
    removes: string[];
    zoneCardOrders?: Record<string, string[]>;
    zoneOrderRemovals?: string[];
    zoneCardOrderVersions?: Record<string, number>;
  };
  nextZoneOrderHashes: Map<string, { hash: string; version: number }>;
};

type OverlayServiceOptions = {
  roomId: string;
  sampleLimit: number;
  schemaVersion?: number;
  diffMaxRatio?: number;
  diffMaxBytes?: number;
};

export class OverlayService {
  private overlayStates = new Map<string, OverlayCacheState>();
  private buildSamples: OverlayMetrics["buildSamples"] = {
    player: [],
    spectator: [],
  };
  private bytesSent: OverlayMetrics["bytesSent"] = { snapshot: 0, diff: 0 };
  private messagesSent: OverlayMetrics["messagesSent"] = { snapshot: 0, diff: 0 };
  private resyncCount = 0;
  private schemaVersion: number;
  private diffMaxRatio: number;
  private diffMaxBytes: number;

  constructor(private options: OverlayServiceOptions) {
    this.schemaVersion = options.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
    this.diffMaxRatio = options.diffMaxRatio ?? DEFAULT_DIFF_MAX_RATIO;
    this.diffMaxBytes = options.diffMaxBytes ?? DEFAULT_DIFF_MAX_BYTES;
  }

  get cacheSize() {
    return this.overlayStates.size;
  }

  getMetrics(): OverlayMetrics {
    return {
      buildSamples: this.buildSamples,
      bytesSent: this.bytesSent,
      messagesSent: this.messagesSent,
      resyncCount: this.resyncCount,
    };
  }

  resetMetrics() {
    this.buildSamples = { player: [], spectator: [] };
    this.bytesSent = { snapshot: 0, diff: 0 };
    this.messagesSent = { snapshot: 0, diff: 0 };
    this.resyncCount = 0;
  }

  clearCache() {
    this.overlayStates.clear();
  }

  removeConnection(connId: string) {
    this.overlayStates.delete(connId);
  }

  buildOverlaySnapshotData(params: {
    snapshot: Snapshot;
    zoneLookup: Parameters<typeof buildOverlayForViewer>[0]["zoneLookup"];
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
    this.recordBuildSample(params.viewerRole, buildDuration);

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

  sendOverlayForConnection(params: {
    conn: Connection;
    buildResult: OverlayBuildResult;
    viewerId?: string;
    supportsDiff: boolean;
    forceSnapshot?: boolean;
  }) {
    try {
      const cache = this.overlayStates.get(params.conn.id);
      const forceSnapshot = params.forceSnapshot ?? false;
      const diffResult =
        cache && !forceSnapshot ? this.computeOverlayDiff(params.buildResult, cache) : null;

      if (cache && diffResult && !diffResult.hasChanges) return;

      if (!cache || !params.supportsDiff || forceSnapshot) {
        const { zoneCardOrderVersions, nextZoneOrderHashes } =
          this.computeZoneOrderVersions(params.buildResult, cache);
        const nextOverlayVersion = (cache?.overlayVersion ?? 0) + 1;
        const payload = this.buildOverlaySnapshotPayload({
          overlay: params.buildResult.overlay,
          overlayVersion: nextOverlayVersion,
          zoneCardOrderVersions,
          viewerId: params.viewerId,
          meta: params.buildResult.meta,
        });
        const message = JSON.stringify({
          type: "privateOverlay",
          payload,
        });
        params.conn.send(message);
        this.recordOverlaySend("snapshot", message);
        if (forceSnapshot && cache) {
          this.resyncCount += 1;
        }
        this.overlayStates.set(params.conn.id, {
          overlayVersion: nextOverlayVersion,
          cardHashes: params.buildResult.cardHashes,
          zoneOrderHashes: nextZoneOrderHashes,
          meta: params.buildResult.meta,
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
        viewerId: params.viewerId,
        meta: params.buildResult.meta,
      });
      const diffMessage = JSON.stringify({
        type: "privateOverlayDiff",
        payload: diffPayload,
      });

      const { zoneCardOrderVersions, nextZoneOrderHashes } =
        this.computeZoneOrderVersions(params.buildResult, cache);
      const snapshotPayload = this.buildOverlaySnapshotPayload({
        overlay: params.buildResult.overlay,
        overlayVersion: nextOverlayVersion,
        zoneCardOrderVersions,
        viewerId: params.viewerId,
        meta: params.buildResult.meta,
      });
      const snapshotMessage = JSON.stringify({
        type: "privateOverlay",
        payload: snapshotPayload,
      });

      const diffBytes = getByteLength(diffMessage);
      const snapshotBytes = getByteLength(snapshotMessage);

      if (this.shouldFallbackToSnapshot(diffBytes, snapshotBytes)) {
        params.conn.send(snapshotMessage);
        this.recordOverlaySend("snapshot", snapshotMessage);
        this.resyncCount += 1;
        this.overlayStates.set(params.conn.id, {
          overlayVersion: nextOverlayVersion,
          cardHashes: params.buildResult.cardHashes,
          zoneOrderHashes: nextZoneOrderHashes,
          meta: params.buildResult.meta,
        });
        return;
      }

      params.conn.send(diffMessage);
      this.recordOverlaySend("diff", diffMessage);
      this.overlayStates.set(params.conn.id, {
        overlayVersion: nextOverlayVersion,
        cardHashes: params.buildResult.cardHashes,
        zoneOrderHashes: diffResult.nextZoneOrderHashes,
        meta: params.buildResult.meta,
      });
    } catch (_err) {}
  }

  private recordBuildSample(role: "player" | "spectator", value: number) {
    if (!Number.isFinite(value)) return;
    const target = role === "spectator" ? this.buildSamples.spectator : this.buildSamples.player;
    if (target.length >= this.options.sampleLimit) {
      target.shift();
    }
    target.push(value);
  }

  private recordOverlaySend(type: "snapshot" | "diff", message: string) {
    const bytes = getByteLength(message);
    if (type === "snapshot") {
      this.bytesSent.snapshot += bytes;
      this.messagesSent.snapshot += 1;
    } else {
      this.bytesSent.diff += bytes;
      this.messagesSent.diff += 1;
    }
  }

  private buildOverlaySnapshotPayload(params: {
    overlay: OverlaySnapshotData;
    overlayVersion: number;
    zoneCardOrderVersions: Record<string, number>;
    viewerId?: string;
    meta: OverlayMeta;
  }): PrivateOverlayPayload {
    return {
      schemaVersion: this.schemaVersion,
      overlayVersion: params.overlayVersion,
      roomId: this.options.roomId,
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
      schemaVersion: this.schemaVersion,
      overlayVersion: params.overlayVersion,
      baseOverlayVersion: params.baseOverlayVersion,
      roomId: this.options.roomId,
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

  private computeOverlayDiff(build: OverlayBuildResult, cache: OverlayCacheState): OverlayDiffResult {
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
    if (diffBytes > this.diffMaxBytes) return true;
    if (snapshotBytes <= 0) return true;
    return diffBytes / snapshotBytes > this.diffMaxRatio;
  }
}
