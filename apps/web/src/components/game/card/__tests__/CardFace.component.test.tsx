import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Card, Player, Zone } from "@/types";
import { useGameStore } from "@/store/gameStore";
import { ZONE } from "@/constants/zones";

import { CardFace } from "../CardFace";

const buildZone = (id: string, type: keyof typeof ZONE, ownerId: string): Zone => ({
  id,
  type: ZONE[type],
  ownerId,
  cardIds: [],
});

const buildPlayer = (id: string, name: string): Player => ({
  id,
  name,
  life: 20,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
});

const buildTransformCard = (zoneId: string): Card => ({
  id: "c1",
  name: "Transform Card",
  ownerId: "me",
  controllerId: "me",
  zoneId,
  tapped: false,
  faceDown: false,
  position: { x: 0.5, y: 0.5 },
  rotation: 0,
  counters: [],
  currentFaceIndex: 1,
  power: "3",
  toughness: "2",
  basePower: "3",
  baseToughness: "2",
  scryfall: {
    id: "s1",
    layout: "transform",
    card_faces: [
      { name: "Front", power: "1", toughness: "1" },
      { name: "Back", power: "3", toughness: "2" },
    ],
  },
});

describe("CardFace", () => {
  beforeEach(() => {
    useGameStore.setState({
      zones: {},
      cards: {},
      players: {},
      myPlayerId: "me",
      globalCounters: {},
    });
  });

  it("renders transform flip faces with their own stats", () => {
    const zone = buildZone("bf-me", "BATTLEFIELD", "me");
    const card = buildTransformCard(zone.id);

    useGameStore.setState((state) => ({
      ...state,
      zones: { ...state.zones, [zone.id]: zone },
      cards: { ...state.cards, [card.id]: card },
      players: { me: buildPlayer("me", "Me") },
    }));

    render(<CardFace card={card} />);

    expect(screen.queryAllByText("1")).toHaveLength(2);
  });
});
