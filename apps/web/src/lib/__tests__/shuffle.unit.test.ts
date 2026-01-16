import { describe, expect, test } from "vitest";

import { shuffle } from "@/lib/shuffle";

describe("shuffle helper", () => {
  test("preserves contents without mutating the source array", () => {
    const original = [1, 2, 3, 4];
    const result = shuffle(original, () => 0.1);

    expect(result).not.toBe(original);
    expect(original).toEqual([1, 2, 3, 4]);
    expect(result.slice().sort()).toEqual(original.slice().sort());
  });

  test("respects a custom deterministic random generator", () => {
    const sequence = [0.1, 0.3, 0.7];
    let index = 0;
    const deterministicRandom = () => sequence[index++ % sequence.length];

    const output = shuffle([1, 2, 3, 4], deterministicRandom);

    expect(output).toEqual([3, 2, 4, 1]);
  });

  test("returns identical ordering for empty or single-item arrays", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(["only"])).toEqual(["only"]);
  });
});
