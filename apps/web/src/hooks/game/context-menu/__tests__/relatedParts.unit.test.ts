import { describe, expect, it } from "vitest";

import { ZONE } from "@/constants/zones";

import { fetchBattlefieldRelatedParts, getNonComboRelatedParts } from "../relatedParts";

describe("gameContextMenu/relatedParts", () => {
  it("filters out combo pieces", () => {
    expect(
      getNonComboRelatedParts([
        {
          object: "related_card",
          id: "1",
          component: "combo_piece",
          name: "A",
          uri: "a",
        },
        {
          object: "related_card",
          id: "2",
          component: "token",
          name: "B",
          uri: "b",
        },
      ])
    ).toHaveLength(1);
  });

  it("only fetches related parts for battlefield cards", async () => {
    const fetchCardById = async () => ({
      card: {
        object: "card" as const,
        id: "c1",
        lang: "en",
        name: "X",
        layout: "normal",
        uri: "u",
        scryfall_uri: "s",
        type_line: "Creature",
        color_identity: [],
        keywords: [],
        legalities: {},
        games: [],
        set: "set",
        set_name: "Set",
        collector_number: "1",
        rarity: "common" as const,
        prices: {},
        related_uris: {},
        all_parts: [
          { object: "related_card" as const, id: "1", component: "token", name: "T", uri: "t" },
        ],
      },
      errors: [],
    });

    expect(
      await fetchBattlefieldRelatedParts({
        card: { scryfallId: "x" },
        zoneType: ZONE.HAND,
        fetchCardById,
      })
    ).toBeUndefined();

    const parts = await fetchBattlefieldRelatedParts({
      card: { scryfallId: "x" },
      zoneType: ZONE.BATTLEFIELD,
      fetchCardById,
    });
    expect(parts?.[0]?.name).toBe("T");
  });
});
