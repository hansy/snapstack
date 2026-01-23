import { describe, expect, it } from "vitest";

import { MAX_HIDDEN_STATE_CHUNK_SIZE } from "../domain/constants";
import { chunkHiddenCards } from "../domain/hiddenState";
import type { Card } from "@mtg/shared/types/cards";

const repeatChar = (char: string, count: number) => Array(count + 1).join(char);

const createCard = (id: string, oracleText: string): Card => ({
  id,
  name: `Card ${id}`,
  ownerId: "p1",
  controllerId: "p1",
  zoneId: "hand-p1",
  tapped: false,
  faceDown: false,
  position: { x: 0.5, y: 0.5 },
  rotation: 0,
  counters: [],
  oracleText,
  imageUrl: `https://img.example/${id}.png`,
});

describe("chunkHiddenCards", () => {
  it("keeps chunk JSON size within bounds and preserves all cards", () => {
    const cards: Record<string, Card> = {};
    const text = repeatChar("T", 500);

    for (let i = 0; i < 300; i += 1) {
      const id = `card-${i}`;
      cards[id] = createCard(id, text);
    }

    const totalSize = JSON.stringify(cards).length;
    expect(totalSize).toBeGreaterThan(MAX_HIDDEN_STATE_CHUNK_SIZE);

    const chunks = chunkHiddenCards(cards);
    expect(chunks.length).toBeGreaterThan(1);

    const flattened = chunks.flatMap((chunk) => Object.keys(chunk));
    expect(flattened.sort()).toEqual(Object.keys(cards).sort());

    chunks.forEach((chunk) => {
      const size = JSON.stringify(chunk).length;
      expect(size).toBeLessThanOrEqual(MAX_HIDDEN_STATE_CHUNK_SIZE);
    });
  });
});
