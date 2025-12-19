import { describe, expect, it } from "vitest";
import { computePeerCount } from "../peerCount";

describe("computePeerCount", () => {
  it("deduplicates by user id when present", () => {
    const states = new Map<number, any>([
      [1, { client: { id: "u1" } }],
      [2, { client: { id: "u1" } }],
      [3, { client: { id: "u2" } }],
    ]);

    expect(computePeerCount(states)).toBe(2);
  });

  it("falls back to client id when user id is missing", () => {
    const states = new Map<number, any>([
      [1, {}],
      [2, {}],
    ]);

    expect(computePeerCount(states)).toBe(2);
  });

  it("never returns less than 1", () => {
    expect(computePeerCount(new Map())).toBe(1);
  });
});

