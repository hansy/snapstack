import { describe, expect, it } from "vitest";
import { computePeerCounts } from "../peerCount";

describe("computePeerCounts", () => {
  it("deduplicates by user id when present", () => {
    const states = new Map<number, any>([
      [1, { client: { id: "u1", role: "player" } }],
      [2, { client: { id: "u1", role: "player" } }],
      [3, { client: { id: "u2", role: "spectator" } }],
    ]);

    expect(computePeerCounts(states)).toEqual({
      total: 2,
      players: 1,
      spectators: 1,
    });
  });

  it("falls back to client id when user id is missing", () => {
    const states = new Map<number, any>([
      [1, { client: { role: "player" } }],
      [2, { client: { role: "spectator" } }],
    ]);

    expect(computePeerCounts(states)).toEqual({
      total: 2,
      players: 1,
      spectators: 1,
    });
  });

  it("never returns less than 1", () => {
    expect(computePeerCounts(new Map())).toEqual({
      total: 1,
      players: 1,
      spectators: 0,
    });
  });
});
