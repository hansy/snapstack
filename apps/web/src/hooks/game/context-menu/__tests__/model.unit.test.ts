import { describe, expect, it } from "vitest";

import type { Card, Zone } from "@/types";
import type { ScryfallCard, ScryfallRelatedCard } from "@/types/scryfall";
import { ZONE as ZONE_CONST } from "@/constants/zones";
import { GRID_STEP_X, GRID_STEP_Y } from "@/lib/positions";

import { buildRelatedBattlefieldCard, isScryfallTokenCard } from "../model";

const createZone = (overrides: Partial<Zone>): Zone =>
  ({
    id: overrides.id ?? "p1-battlefield",
    type: overrides.type ?? ZONE_CONST.BATTLEFIELD,
    ownerId: overrides.ownerId ?? "p1",
    cardIds: overrides.cardIds ?? [],
  }) satisfies Zone;

const createCard = (overrides: Partial<Card>): Card =>
  ({
    id: overrides.id ?? "c1",
    name: overrides.name ?? "Card",
    ownerId: overrides.ownerId ?? "p1",
    controllerId: overrides.controllerId ?? overrides.ownerId ?? "p1",
    zoneId: overrides.zoneId ?? "p1-battlefield",
    tapped: overrides.tapped ?? false,
    faceDown: overrides.faceDown ?? false,
    position: overrides.position ?? { x: 0.1, y: 0.1 },
    rotation: overrides.rotation ?? 0,
    counters: overrides.counters ?? [],
  }) as any;

const createRelated = (overrides: Partial<ScryfallRelatedCard> = {}): ScryfallRelatedCard =>
  ({
    object: "related_card",
    id: "r1",
    component: "token",
    name: "Goblin",
    uri: "https://api.scryfall.com/cards/abc",
    ...overrides,
  }) as any;

const createScryfallCard = (overrides: Partial<ScryfallCard> = {}): ScryfallCard =>
  ({
    object: "card",
    id: overrides.id ?? "s1",
    name: overrides.name ?? "Top Name",
    layout: overrides.layout ?? "normal",
    type_line: overrides.type_line ?? "Token Creature — Goblin",
    card_faces: overrides.card_faces,
    power: overrides.power,
    toughness: overrides.toughness,
    ...overrides,
  }) as any;

describe("gameContextMenu model", () => {
  it("detects token cards from related.component, layout, or type_line", () => {
    expect(
      isScryfallTokenCard({
        related: createRelated({ component: "token" }),
        card: { layout: "normal", type_line: "Creature" } as any,
      })
    ).toBe(true);

    expect(
      isScryfallTokenCard({
        related: createRelated({ component: "meld_result" }),
        card: { layout: "token", type_line: "Creature" } as any,
      })
    ).toBe(true);

    expect(
      isScryfallTokenCard({
        related: createRelated({ component: "meld_result" }),
        card: { layout: "normal", type_line: "Token Artifact" } as any,
      })
    ).toBe(true);
  });

  it("builds a related battlefield card near the source card and populates derived fields", () => {
    const zone = createZone({ id: "bf", type: ZONE_CONST.BATTLEFIELD, cardIds: ["base"] });
    const source = createCard({ id: "base", zoneId: "bf", position: { x: 0.1, y: 0.1 } });

    const scryfall = createScryfallCard({
      id: "scry",
      name: "Top Name",
      layout: "normal",
      type_line: "Creature — Human",
      power: "2",
      toughness: undefined,
      card_faces: [{ name: "Face Name", power: "1", toughness: "1" }] as any,
    });

    const related = createRelated({ name: "Related Name", component: "token" });

    const planned = buildRelatedBattlefieldCard({
      sourceCard: source,
      battlefield: zone,
      playerId: "p1",
      related,
      scryfallCard: scryfall,
      cardsById: { base: source },
      createId: () => "new1",
    });

    expect(planned?.id).toBe("new1");
    expect(planned?.zoneId).toBe("bf");
    expect(planned?.ownerId).toBe("p1");
    expect(planned?.controllerId).toBe("p1");

    expect(planned?.name).toBe("Face Name");
    expect(planned?.typeLine).toBe("Creature — Human");
    expect(planned?.isToken).toBe(true);

    expect(planned?.power).toBe("2");
    expect(planned?.toughness).toBe("1");
    expect(planned?.basePower).toBe("2");
    expect(planned?.baseToughness).toBe("1");

    expect(planned?.position.x).toBeCloseTo(0.1 + GRID_STEP_X, 6);
    expect(planned?.position.y).toBeCloseTo(0.1 + GRID_STEP_Y, 6);
  });

  it("bumps the planned position when it would overlap an existing card", () => {
    const zone = createZone({ id: "bf", type: ZONE_CONST.BATTLEFIELD, cardIds: ["base", "occ"] });
    const source = createCard({ id: "base", zoneId: "bf", position: { x: 0.1, y: 0.1 } });
    const occupied: Pick<Card, "position"> = {
      position: { x: 0.1 + GRID_STEP_X, y: 0.1 + GRID_STEP_Y },
    };

    const planned = buildRelatedBattlefieldCard({
      sourceCard: source,
      battlefield: zone,
      playerId: "p1",
      related: createRelated({ component: "meld_result" }),
      scryfallCard: createScryfallCard({ layout: "token", type_line: "Creature" }),
      cardsById: { base: source, occ: occupied },
      createId: () => "new1",
    });

    expect(planned?.position.x).toBeCloseTo(0.1 + 2 * GRID_STEP_X, 6);
    expect(planned?.position.y).toBeCloseTo(0.1 + 2 * GRID_STEP_Y, 6);
  });

  it("returns null for non-battlefield zones", () => {
    const nonBattlefield = createZone({ id: "hand", type: ZONE_CONST.HAND });
    const source = createCard({ id: "base", zoneId: "hand" });

    expect(
      buildRelatedBattlefieldCard({
        sourceCard: source,
        battlefield: nonBattlefield,
        playerId: "p1",
        related: createRelated(),
        scryfallCard: createScryfallCard(),
        cardsById: { base: source },
        createId: () => "new1",
      })
    ).toBeNull();
  });
});

