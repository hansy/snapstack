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

  test("distribution of the top card is roughly uniform", () => {
    const deck = ["a", "b", "c", "d"] as const;
    type Card = (typeof deck)[number];
    const runs = 5000;
    const counts: Record<Card, number> = { a: 0, b: 0, c: 0, d: 0 };

    for (let i = 0; i < runs; i += 1) {
      const shuffled = shuffle(deck);
      const top = shuffled[shuffled.length - 1] as Card;
      counts[top] += 1;
    }

    const expected = runs / deck.length;
    const chiSquared = Object.values(counts).reduce((acc, count) => {
      const diff = count - expected;
      return acc + (diff * diff) / expected;
    }, 0);

    // 4 buckets => 3 degrees of freedom. Threshold keeps flake odds tiny while flagging bias.
    expect(chiSquared).toBeLessThan(20);
  });
});
