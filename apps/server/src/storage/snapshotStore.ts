import * as Y from "yjs";

import { chunkHiddenCards } from "../domain/hiddenState";
import type { HiddenState, HiddenStateMeta } from "../domain/types";

export type SnapshotMeta = {
  id: string;
  createdAt: number;
  lastIntentIndex: number;
  hiddenStateMeta: HiddenStateMeta;
};

type SnapshotStoreOptions = {
  storage: DurableObjectStorage;
  yDocStorageKey: string;
  snapshotMetaKey: string;
  snapshotHiddenPrefix: string;
  snapshotPendingMetaKey?: string;
};

type SnapshotWriteParams = {
  doc: Y.Doc;
  hiddenState: HiddenState;
  lastIntentIndex: number;
  createdAt?: number;
  shouldAbort?: () => boolean;
  logContext?: { room: string; connId?: string | null };
};

const defaultPendingKey = "snapshot:meta:pending";

const logError = (
  message: string,
  error: unknown,
  context?: { room: string; connId?: string | null }
) => {
  console.error(message, {
    room: context?.room,
    connId: context?.connId ?? undefined,
    error:
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error),
  });
};

export class SnapshotStore {
  private storage: DurableObjectStorage;
  private yDocStorageKey: string;
  private snapshotMetaKey: string;
  private snapshotHiddenPrefix: string;
  private snapshotPendingMetaKey: string;

  constructor(options: SnapshotStoreOptions) {
    this.storage = options.storage;
    this.yDocStorageKey = options.yDocStorageKey;
    this.snapshotMetaKey = options.snapshotMetaKey;
    this.snapshotHiddenPrefix = options.snapshotHiddenPrefix;
    this.snapshotPendingMetaKey = options.snapshotPendingMetaKey ?? defaultPendingKey;
  }

  async loadCommittedMeta(logContext?: { room: string; connId?: string | null }) {
    const pending = await this.storage.get<SnapshotMeta>(this.snapshotPendingMetaKey);
    const committed = (await this.storage.get<SnapshotMeta>(this.snapshotMetaKey)) ?? null;
    if (pending) {
      if (committed?.id && pending.id === committed.id) {
        await this.cleanupPendingMetaKey(logContext);
      } else {
        await this.cleanupPendingSnapshot(pending, logContext);
      }
    }
    return committed;
  }

  async writeSnapshot(params: SnapshotWriteParams): Promise<SnapshotMeta | null> {
    const shouldAbort = params.shouldAbort ?? (() => false);
    const { hiddenState } = params;
    const createdAt = params.createdAt ?? Date.now();
    const snapshotId = crypto.randomUUID();
    const { cards, ...rest } = hiddenState;
    const chunks = chunkHiddenCards(cards);
    const chunkKeys = chunks.map(
      (_chunk, index) => `${this.snapshotHiddenPrefix}${snapshotId}:${index}`
    );
    const hiddenMeta: HiddenStateMeta = {
      ...rest,
      cardChunkKeys: chunkKeys,
    };
    const snapshotMeta: SnapshotMeta = {
      id: snapshotId,
      createdAt,
      lastIntentIndex: params.lastIntentIndex,
      hiddenStateMeta: hiddenMeta,
    };

    try {
      await this.storage.put(this.snapshotPendingMetaKey, snapshotMeta);
    } catch (error) {
      logError("[party] failed to stage snapshot meta", error, params.logContext);
      return null;
    }

    if (shouldAbort()) {
      await this.cleanupPendingSnapshot(snapshotMeta, params.logContext);
      return null;
    }

    try {
      const update = Y.encodeStateAsUpdate(params.doc);
      await this.storage.put(this.yDocStorageKey, update.buffer);
    } catch (error) {
      logError("[party] failed to save yjs snapshot", error, params.logContext);
      await this.cleanupPendingSnapshot(snapshotMeta, params.logContext);
      return null;
    }

    for (let index = 0; index < chunks.length; index += 1) {
      if (shouldAbort()) {
        await this.cleanupPendingSnapshot(snapshotMeta, params.logContext);
        return null;
      }
      const key = chunkKeys[index];
      try {
        await this.storage.put(key, chunks[index]);
      } catch (error) {
        logError("[party] failed to save hidden state chunk", error, params.logContext);
        await this.cleanupPendingSnapshot(snapshotMeta, params.logContext);
        return null;
      }
    }

    if (shouldAbort()) {
      await this.cleanupPendingSnapshot(snapshotMeta, params.logContext);
      return null;
    }

    try {
      await this.storage.put(this.snapshotMetaKey, snapshotMeta);
    } catch (error) {
      logError("[party] failed to commit snapshot meta", error, params.logContext);
      await this.cleanupSnapshotMetaKey();
      await this.cleanupPendingSnapshot(snapshotMeta, params.logContext);
      return null;
    }

    try {
      await this.storage.delete(this.snapshotPendingMetaKey);
    } catch (error) {
      logError("[party] failed to clear pending snapshot meta", error, params.logContext);
    }

    return snapshotMeta;
  }

  async cleanupSnapshot(meta: SnapshotMeta) {
    await this.cleanupSnapshotMetaKey();
    await this.cleanupHiddenChunks(meta);
  }

  private async cleanupPendingSnapshot(
    meta: SnapshotMeta,
    logContext?: { room: string; connId?: string | null }
  ) {
    await this.cleanupPendingMetaKey(logContext);
    await this.cleanupHiddenChunks(meta, logContext);
  }

  private async cleanupPendingMetaKey(
    logContext?: { room: string; connId?: string | null }
  ) {
    try {
      await this.storage.delete(this.snapshotPendingMetaKey);
    } catch (error) {
      logError("[party] failed to delete pending snapshot meta", error, logContext);
    }
  }

  private async cleanupSnapshotMetaKey() {
    try {
      await this.storage.delete(this.snapshotMetaKey);
    } catch (_error) {}
  }

  private async cleanupHiddenChunks(
    meta: SnapshotMeta,
    logContext?: { room: string; connId?: string | null }
  ) {
    const chunkKeys = meta?.hiddenStateMeta?.cardChunkKeys ?? [];
    for (const key of chunkKeys) {
      try {
        await this.storage.delete(key);
      } catch (error) {
        logError("[party] failed to delete snapshot chunk", error, logContext);
      }
    }
  }
}
