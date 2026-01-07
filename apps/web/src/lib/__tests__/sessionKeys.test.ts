import { describe, expect, it } from "vitest";

import { createMemoryStorage } from "@/store/testUtils";
import {
  buildSessionLink,
  ensureSessionAccessKeys,
  getShareRoleForRoom,
  getSessionAccessKeys,
  syncSessionAccessKeysFromLocation,
} from "@/lib/sessionKeys";

describe("sessionKeys", () => {
  it("generates and persists session access keys", () => {
    const storage = createMemoryStorage();
    const keys = ensureSessionAccessKeys("s1", storage);

    expect(keys.playerKey).toBeTruthy();
    expect(keys.spectatorKey).toBeTruthy();
    expect(getSessionAccessKeys("s1", storage)).toEqual(keys);
  });

  it("syncs keys from the URL hash", () => {
    const storage = createMemoryStorage();
    const location = { hash: "#k=playerKey123&s=spectatorKey456" } as Location;

    const result = syncSessionAccessKeysFromLocation("s2", location, storage);

    expect(result.fromHash.playerKey).toBe("playerKey123");
    expect(result.fromHash.spectatorKey).toBe("spectatorKey456");
    expect(result.keys.playerKey).toBe("playerKey123");
    expect(result.keys.spectatorKey).toBe("spectatorKey456");
  });

  it("builds session links for the requested role", () => {
    const link = buildSessionLink({
      sessionId: "s3",
      role: "player",
      keys: { playerKey: "pk" },
      baseUrl: "http://example.com",
    });

    expect(link).toBe("http://example.com/game/s3#k=pk");
  });

  it("chooses spectator links for locked rooms", () => {
    expect(getShareRoleForRoom(true)).toBe("spectator");
    expect(getShareRoleForRoom(false)).toBe("player");
  });
});
