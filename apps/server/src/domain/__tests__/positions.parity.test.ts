import { describe, expect, it } from "vitest";

import * as shared from "@mtg/shared/positions";
import * as server from "../positions";

const makeCards = (): Record<string, { position: { x: number; y: number } }> => ({
  c1: { position: { x: 0.5, y: 0.5 } },
  c2: { position: { x: 0.5, y: 0.55 } },
});

describe("positions parity", () => {
  it("matches grid constants", () => {
    expect(server.GRID_STEP_X).toBe(shared.GRID_STEP_X);
    expect(server.GRID_STEP_Y).toBe(shared.GRID_STEP_Y);
    expect(server.LEGACY_BATTLEFIELD_WIDTH).toBe(shared.LEGACY_BATTLEFIELD_WIDTH);
    expect(server.LEGACY_BATTLEFIELD_HEIGHT).toBe(shared.LEGACY_BATTLEFIELD_HEIGHT);
  });

  it("matches clampNormalizedPosition", () => {
    const input = { x: -0.25, y: 1.25 };
    expect(server.clampNormalizedPosition(input)).toEqual(
      shared.clampNormalizedPosition(input)
    );
  });

  it("matches normalizeMovePosition", () => {
    const position = { x: 500, y: 300 };
    const fallback = { x: 0.1, y: 0.1 };
    expect(server.normalizeMovePosition(position, fallback)).toEqual(
      shared.normalizeMovePosition(position, fallback)
    );
  });

  it("matches resolveBattlefieldCollisionPosition", () => {
    const ordered = ["c1", "c2"];
    const cards = makeCards();
    const target = { x: 0.5, y: 0.5 };
    const getPosition = (cardId: string) => cards[cardId]?.position ?? null;

    expect(
      server.resolveBattlefieldCollisionPosition({
        movingCardId: "c2",
        targetPosition: target,
        orderedCardIds: ordered,
        getPosition,
      })
    ).toEqual(
      shared.resolveBattlefieldCollisionPosition({
        movingCardId: "c2",
        targetPosition: target,
        orderedCardIds: ordered,
        getPosition,
      })
    );
  });

  it("matches findAvailablePositionNormalized", () => {
    const cards = makeCards();
    const zoneCardIds = Object.keys(cards);
    const start = { x: 0.5, y: 0.5 };

    expect(
      server.findAvailablePositionNormalized(start, zoneCardIds, cards)
    ).toEqual(shared.findAvailablePositionNormalized(start, zoneCardIds, cards));
  });
});
