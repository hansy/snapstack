import { describe, expect, it, vi } from "vitest";

import type { Card, Zone } from "@/types";
import type { ScryfallRelatedCard } from "@/types/scryfall";
import { ZONE } from "@/constants/zones";

import { createRelatedCardHandler } from "../createRelatedCard";

const createBattlefieldZone = (id: string, ownerId: string, cardIds: string[]): Zone => ({
  id,
  type: ZONE.BATTLEFIELD,
  ownerId,
  cardIds,
});

const createBaseCard = (overrides: Partial<Card> = {}): Card => ({
  id: "c1",
  ownerId: "me",
  controllerId: "me",
  zoneId: "me-battlefield",
  name: "Source",
  tapped: false,
  faceDown: false,
  position: { x: 0.1, y: 0.1 },
  rotation: 0,
  counters: [],
  ...overrides,
});

const createRelated = (overrides: Partial<ScryfallRelatedCard> = {}): ScryfallRelatedCard => ({
  object: "related_card",
  id: "r1",
  component: "token",
  name: "Goblin",
  uri: "https://scryfall.test/card",
  ...overrides,
});

const createPlayer = (id: string) =>
  ({
    id,
    name: id,
    life: 40,
    counters: [],
    commanderDamage: {},
    commanderTax: 0,
  }) as any;

describe("createRelatedCardHandler", () => {
  it("adds the planned card and toasts success", async () => {
    const zone = createBattlefieldZone("me-battlefield", "me", ["c1"]);
    const sourceCard = createBaseCard({ zoneId: zone.id });

    const addCard = vi.fn();
    const getState = () => ({
      zones: { [zone.id]: zone },
      cards: { [sourceCard.id]: sourceCard },
      players: { me: createPlayer("me") },
      addCard,
    });

    const toastLike = { success: vi.fn(), error: vi.fn() };
    const fetchScryfallCardByUri = vi.fn(async () => ({
      object: "card",
      id: "s1",
      lang: "en",
      name: "Goblin Token",
      layout: "token",
      uri: "https://scryfall.test/card",
      scryfall_uri: "https://scryfall.test/card",
      type_line: "Token Creature — Goblin",
      color_identity: [],
      keywords: [],
      legalities: {},
      games: ["paper"],
      set: "tst",
      set_name: "Test",
      collector_number: "1",
      rarity: "common",
      prices: {},
      related_uris: {},
    }) as any);

    const handler = createRelatedCardHandler({
      actorId: "me",
      getState,
      toast: toastLike,
      fetchScryfallCardByUri,
      createId: () => "new1",
    });

    await handler(sourceCard, createRelated());

    expect(addCard).toHaveBeenCalledTimes(1);
    expect(addCard.mock.calls[0][0]).toMatchObject({
      id: "new1",
      zoneId: zone.id,
      ownerId: "me",
      controllerId: "me",
    });
    expect(toastLike.success).toHaveBeenCalledWith("Created Goblin token");
    expect(toastLike.error).not.toHaveBeenCalled();
  });

  it("toasts permission denied when actor is not controller", async () => {
    const zone = createBattlefieldZone("me-battlefield", "me", ["c1"]);
    const sourceCard = createBaseCard({ zoneId: zone.id, controllerId: "other" });

    const addCard = vi.fn();
    const getState = () => ({
      zones: { [zone.id]: zone },
      cards: { [sourceCard.id]: sourceCard },
      players: { me: createPlayer("me") },
      addCard,
    });

    const toastLike = { success: vi.fn(), error: vi.fn() };
    const fetchScryfallCardByUri = vi.fn();

    const handler = createRelatedCardHandler({
      actorId: "me",
      getState,
      toast: toastLike,
      fetchScryfallCardByUri: fetchScryfallCardByUri as any,
      createId: () => "new1",
    });

    await handler(sourceCard, createRelated());

    expect(addCard).not.toHaveBeenCalled();
    expect(fetchScryfallCardByUri).not.toHaveBeenCalled();
    expect(toastLike.error).toHaveBeenCalledTimes(1);
  });

  it("logs and toasts fetch failures", async () => {
    const zone = createBattlefieldZone("me-battlefield", "me", ["c1"]);
    const sourceCard = createBaseCard({ zoneId: zone.id });

    const addCard = vi.fn();
    const getState = () => ({
      zones: { [zone.id]: zone },
      cards: { [sourceCard.id]: sourceCard },
      players: { me: createPlayer("me") },
      addCard,
    });

    const toastLike = { success: vi.fn(), error: vi.fn() };
    const logger = { error: vi.fn() };
    const fetchScryfallCardByUri = vi.fn(async () => {
      throw new Error("boom");
    });

    const handler = createRelatedCardHandler({
      actorId: "me",
      getState,
      toast: toastLike,
      fetchScryfallCardByUri,
      createId: () => "new1",
      logger,
    });

    await handler(sourceCard, createRelated());

    expect(addCard).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(toastLike.error).toHaveBeenCalledWith("Failed to create related card");
  });
});
