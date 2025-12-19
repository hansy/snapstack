import { describe, expect, it, vi } from "vitest";

import { CLIENT_KEY_STORAGE, genUuidLike, getOrCreateClientKey } from "../clientKey";

describe("genUuidLike", () => {
  it("generates a stable uuid-like value for a deterministic rng", () => {
    const rng = () => 0;
    expect(genUuidLike(rng)).toBe("00000000-0000-4000-8000-000000000000");
  });
});

describe("getOrCreateClientKey", () => {
  it("returns an existing key from storage", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue("existing"),
      setItem: vi.fn(),
    } as any;

    const key = getOrCreateClientKey({ storage });
    expect(key).toBe("existing");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("creates and stores a key when missing", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    } as any;

    const key = getOrCreateClientKey({
      storage,
      rng: () => 0,
      storageKey: CLIENT_KEY_STORAGE,
    });

    expect(key).toBe("00000000-0000-4000-8000-000000000000");
    expect(storage.setItem).toHaveBeenCalledWith(CLIENT_KEY_STORAGE, key);
  });
});

