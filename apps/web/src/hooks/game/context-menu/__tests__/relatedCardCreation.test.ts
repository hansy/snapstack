import { describe, expect, it } from "vitest";

import { ZONE } from "@/constants/zones";

import { planRelatedBattlefieldCardCreation } from "../relatedCardCreation";

describe("gameContextMenu/relatedCardCreation", () => {
  it("rejects non-battlefield zones", async () => {
    const result = await planRelatedBattlefieldCardCreation({
      sourceCard: {
        id: "c1",
        name: "Card",
        ownerId: "p1",
        controllerId: "p1",
        zoneId: "z1",
        tapped: false,
        faceDown: false,
        position: { x: 0, y: 0 },
        rotation: 0,
        counters: [],
      },
      related: { object: "related_card", id: "r1", component: "token", name: "T", uri: "u" },
      actorId: "p1",
      zonesById: { z1: { id: "z1", type: ZONE.HAND, ownerId: "p1", cardIds: [] } },
      cardsById: {},
      fetchScryfallCardByUri: async () => {
        throw new Error("should not fetch");
      },
      createId: () => "new",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_battlefield");
  });

  it("rejects when the actor cannot modify the battlefield card", async () => {
    const result = await planRelatedBattlefieldCardCreation({
      sourceCard: {
        id: "c1",
        name: "Card",
        ownerId: "p1",
        controllerId: "p2",
        zoneId: "bf",
        tapped: false,
        faceDown: false,
        position: { x: 0, y: 0 },
        rotation: 0,
        counters: [],
      },
      related: { object: "related_card", id: "r1", component: "token", name: "T", uri: "u" },
      actorId: "p1",
      zonesById: { bf: { id: "bf", type: ZONE.BATTLEFIELD, ownerId: "p1", cardIds: [] } },
      cardsById: {},
      fetchScryfallCardByUri: async () => {
        throw new Error("should not fetch");
      },
      createId: () => "new",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("permission_denied");
  });

  it("creates a planned card on success", async () => {
    const result = await planRelatedBattlefieldCardCreation({
      sourceCard: {
        id: "c1",
        name: "Card",
        ownerId: "p1",
        controllerId: "p1",
        zoneId: "bf",
        tapped: false,
        faceDown: false,
        position: { x: 0.5, y: 0.5 },
        rotation: 0,
        counters: [],
      },
      related: { object: "related_card", id: "r1", component: "token", name: "T", uri: "u" },
      actorId: "p1",
      zonesById: { bf: { id: "bf", type: ZONE.BATTLEFIELD, ownerId: "p1", cardIds: [] } },
      cardsById: {},
      fetchScryfallCardByUri: async () =>
        ({
          object: "card",
          id: "s1",
          lang: "en",
          name: "Token",
          layout: "token",
          uri: "u",
          scryfall_uri: "s",
          type_line: "Token Creature",
          color_identity: [],
          keywords: [],
          legalities: {},
          games: [],
          set: "set",
          set_name: "Set",
          collector_number: "1",
          rarity: "common",
          prices: {},
          related_uris: {},
        }) as any,
      createId: () => "new",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.card.id).toBe("new");
      expect(result.card.zoneId).toBe("bf");
      expect(result.card.isToken).toBe(true);
    }
  });
});

