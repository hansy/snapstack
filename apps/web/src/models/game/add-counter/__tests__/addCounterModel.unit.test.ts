import { describe, expect, it } from "vitest";

import { getAllCounterTypes, normalizeCounterCount, normalizeCounterType, planAddCounter } from "../addCounterModel";

describe("addCounterModel", () => {
  it("normalizes counter types (trim + max length)", () => {
    expect(normalizeCounterType("  +1/+1  ")).toBe("+1/+1");
    expect(normalizeCounterType("")).toBe("");

    const long = "a".repeat(100);
    expect(normalizeCounterType(long)).toHaveLength(64);
  });

  it("normalizes counter counts (>= 1 integer)", () => {
    expect(normalizeCounterCount(1)).toBe(1);
    expect(normalizeCounterCount(0)).toBe(1);
    expect(normalizeCounterCount(-5)).toBe(1);
    expect(normalizeCounterCount(2.9)).toBe(2);
    expect(normalizeCounterCount(Number.NaN)).toBe(1);
  });

  it("builds a sorted unique list of counter types", () => {
    expect(
      getAllCounterTypes({
        presetTypes: ["b", "a", "a"],
        globalCounterTypes: ["c", "b"],
      })
    ).toEqual(["a", "b", "c"]);
  });

  it("plans a counter and indicates whether to add it globally", () => {
    const planned = planAddCounter({
      rawType: "  Poison  ",
      rawCount: 2,
      globalCounters: {},
      resolveColor: (type) => `color:${type}`,
    });

    expect(planned?.counter.type).toBe("Poison");
    expect(planned?.counter.count).toBe(2);
    expect(planned?.counter.color).toBe("color:Poison");
    expect(planned?.shouldAddGlobalCounter).toBe(true);

    const existing = planAddCounter({
      rawType: "Poison",
      rawCount: -1,
      globalCounters: { Poison: "#00ff00" },
      resolveColor: (type, globals) => globals[type] ?? "#fff",
    });

    expect(existing?.counter.count).toBe(1);
    expect(existing?.shouldAddGlobalCounter).toBe(false);
  });

  it("returns null for empty types", () => {
    expect(
      planAddCounter({
        rawType: "   ",
        rawCount: 1,
        globalCounters: {},
        resolveColor: () => "#fff",
      })
    ).toBeNull();
  });
});

