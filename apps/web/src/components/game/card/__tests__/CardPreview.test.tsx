import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Card, Player, Zone } from "@/types";
import { useGameStore } from "@/store/gameStore";
import { ZONE } from "@/constants/zones";
import { CardPreview } from "../CardPreview";

const buildZone = (id: string, type: keyof typeof ZONE, ownerId: string, cardIds: string[] = []) =>
  ({
    id,
    type: ZONE[type],
    ownerId,
    cardIds,
  }) satisfies Zone;

const buildCard = (id: string, name: string, zoneId: string): Card => ({
  id,
  name,
  ownerId: "me",
  controllerId: "me",
  zoneId,
  tapped: false,
  faceDown: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  counters: [],
});

const buildPlayer = (id: string, name: string): Player => ({
  id,
  name,
  life: 20,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
});

describe("CardPreview", () => {
  beforeEach(() => {
    useGameStore.setState({
      zones: {},
      cards: {},
      players: {},
      myPlayerId: "me",
    });
  });

  it("does not violate hook ordering during initial positioning", async () => {
    const zoneId = "me-battlefield";
    const cardId = "c1";
    const zone = buildZone(zoneId, "BATTLEFIELD", "me", [cardId]);
    const card = buildCard(cardId, "Test Card", zoneId);

    useGameStore.setState((state) => ({
      ...state,
      zones: { [zoneId]: zone },
      cards: { [cardId]: card },
      players: { me: buildPlayer("me", "Me") },
      myPlayerId: "me",
    }));

    const anchorRect = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    render(<CardPreview card={card} anchorRect={anchorRect} locked={false} />);

    expect(await screen.findByText("Test Card")).toBeTruthy();
  });

  it("treats hand zones based on zone type, not zone id naming", async () => {
    const zoneId = "z123";
    const cardId = "c1";
    const zone = buildZone(zoneId, "HAND", "me", [cardId]);
    const card: Card = { ...buildCard(cardId, "Test Card", zoneId), customText: "Hello" };

    useGameStore.setState((state) => ({
      ...state,
      zones: { [zoneId]: zone },
      cards: { [cardId]: card },
      players: { me: buildPlayer("me", "Me") },
      myPlayerId: "me",
    }));

    const anchorRect = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    render(<CardPreview card={card} anchorRect={anchorRect} locked={false} />);

    expect(await screen.findByText("Test Card")).toBeTruthy();
    expect(screen.queryByText("Hello")).toBeNull();
  });
});
