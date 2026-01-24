import { describe, expect, it } from "vitest";

import { SnapshotStore, type SnapshotMeta } from "../storage/snapshotStore";
import type { HiddenStateMeta } from "../domain/types";

const createHiddenMeta = (chunkKeys: string[]): HiddenStateMeta => ({
  handOrder: {},
  libraryOrder: {},
  sideboardOrder: {},
  faceDownBattlefield: {},
  handReveals: {},
  libraryReveals: {},
  faceDownReveals: {},
  cardChunkKeys: chunkKeys,
});

const createSnapshotMeta = (id: string, chunkKeys: string[]): SnapshotMeta => ({
  id,
  createdAt: 123,
  lastIntentIndex: 5,
  hiddenStateMeta: createHiddenMeta(chunkKeys),
});

const createStorage = () => {
  const data = new Map<string, unknown>();
  const storage = {
    get: async <T = unknown>(key: string) => data.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      data.set(key, value);
    },
    delete: async (key: string) => {
      data.delete(key);
    },
  };
  return { data, storage };
};

const createSnapshotStore = (storage: unknown) =>
  new SnapshotStore({
    storage: storage as DurableObjectStorage,
    yDocStorageKey: "yjs:doc",
    snapshotMetaKey: "snapshot:meta",
    snapshotHiddenPrefix: "snapshot:hidden:",
  });

describe("SnapshotStore.loadCommittedMeta", () => {
  it("cleans pending snapshots when no committed meta exists", async () => {
    const { data, storage } = createStorage();
    const pendingChunkKeys = ["snapshot:hidden:pending:0", "snapshot:hidden:pending:1"];
    const pendingMeta = createSnapshotMeta("pending", pendingChunkKeys);

    data.set("snapshot:meta:pending", pendingMeta);
    pendingChunkKeys.forEach((key) => data.set(key, { pending: true }));

    const store = createSnapshotStore(storage);
    const committed = await store.loadCommittedMeta();

    expect(committed).toBeNull();
    expect(data.has("snapshot:meta:pending")).toBe(false);
    expect(data.has("snapshot:meta")).toBe(false);
    pendingChunkKeys.forEach((key) => {
      expect(data.has(key)).toBe(false);
    });
  });

  it("keeps committed chunks when pending matches committed id", async () => {
    const { data, storage } = createStorage();
    const chunkKeys = ["snapshot:hidden:same:0", "snapshot:hidden:same:1"];
    const meta = createSnapshotMeta("same", chunkKeys);

    data.set("snapshot:meta:pending", meta);
    data.set("snapshot:meta", meta);
    chunkKeys.forEach((key) => data.set(key, { committed: true }));

    const store = createSnapshotStore(storage);
    const committed = await store.loadCommittedMeta();

    expect(committed?.id).toBe("same");
    expect(data.has("snapshot:meta:pending")).toBe(false);
    expect(data.has("snapshot:meta")).toBe(true);
    chunkKeys.forEach((key) => {
      expect(data.has(key)).toBe(true);
    });
  });

  it("cleans pending chunks when committed differs", async () => {
    const { data, storage } = createStorage();
    const pendingChunkKeys = ["snapshot:hidden:pending:0"];
    const committedChunkKeys = ["snapshot:hidden:committed:0"];
    const pendingMeta = createSnapshotMeta("pending", pendingChunkKeys);
    const committedMeta = createSnapshotMeta("committed", committedChunkKeys);

    data.set("snapshot:meta:pending", pendingMeta);
    data.set("snapshot:meta", committedMeta);
    pendingChunkKeys.forEach((key) => data.set(key, { pending: true }));
    committedChunkKeys.forEach((key) => data.set(key, { committed: true }));

    const store = createSnapshotStore(storage);
    const committed = await store.loadCommittedMeta();

    expect(committed?.id).toBe("committed");
    expect(data.has("snapshot:meta:pending")).toBe(false);
    pendingChunkKeys.forEach((key) => {
      expect(data.has(key)).toBe(false);
    });
    committedChunkKeys.forEach((key) => {
      expect(data.has(key)).toBe(true);
    });
  });
});
