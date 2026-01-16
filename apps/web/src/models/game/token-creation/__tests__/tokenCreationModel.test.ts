import { describe, expect, it } from "vitest";

import type { Card } from "@/types";
import type { ScryfallCard } from "@/types/scryfall";

import { GRID_STEP_X, GRID_STEP_Y } from "@/lib/positions";
import { planTokenCards } from "../tokenCreationModel";

const createToken = (overrides: Partial<ScryfallCard> = {}) =>
  ({
    id: "token-1",
    layout: "token",
    name: "Token",
    type_line: "Token",
    ...overrides,
  }) as unknown as ScryfallCard;

describe("tokenCreationModel", () => {
  it("plans positions without overlapping newly created tokens", () => {
    const ids = ["t1", "t2"];
    let index = 0;
    const createId = () => ids[index++]!;

    const existingCard: Card = {
      id: "existing",
      name: "Existing",
      ownerId: "p1",
      controllerId: "p1",
      zoneId: "p1-battlefield",
      tapped: false,
      faceDown: false,
      position: { x: 0.5, y: 0.5 },
      rotation: 0,
      counters: [],
    };

    const planned = planTokenCards({
      token: createToken(),
      playerId: "p1",
      battlefieldZoneId: "p1-battlefield",
      existingBattlefieldCardIds: ["existing"],
      cardsById: {
        existing: existingCard,
      },
      quantity: 2,
      createId,
    });

    expect(planned).toHaveLength(2);

    expect(planned[0]?.position.x).toBeCloseTo(0.5 + GRID_STEP_X, 6);
    expect(planned[0]?.position.y).toBeCloseTo(0.5 + GRID_STEP_Y, 6);
    expect(planned[1]?.position.x).toBeCloseTo(0.5 + 2 * GRID_STEP_X, 6);
    expect(planned[1]?.position.y).toBeCloseTo(0.5 + 2 * GRID_STEP_Y, 6);
  });

  it("derives name and P/T from token faces and top-level fields", () => {
    const token = createToken({
      id: "token-pt",
      name: "Top Name",
      type_line: "Token Creature — Test",
      power: "2",
      toughness: undefined,
      card_faces: [{ name: "Face Name", power: "1", toughness: "1" }] as any,
    });

    const [card] = planTokenCards({
      token,
      playerId: "p1",
      battlefieldZoneId: "p1-battlefield",
      existingBattlefieldCardIds: [],
      cardsById: {} as Record<string, Pick<Card, "position">>,
      quantity: 1,
      createId: () => "new1",
    });

    expect(card?.id).toBe("new1");
    expect(card?.zoneId).toBe("p1-battlefield");
    expect(card?.ownerId).toBe("p1");
    expect(card?.controllerId).toBe("p1");
    expect(card?.isToken).toBe(true);
    expect(card?.name).toBe("Face Name");
    expect(card?.typeLine).toBe("Token Creature — Test");
    expect(card?.power).toBe("2");
    expect(card?.toughness).toBe("1");
    expect(card?.scryfallId).toBe("token-pt");
    expect(card?.scryfall?.id).toBe("token-pt");
    expect(card?.scryfall?.layout).toBe("token");
  });
});
