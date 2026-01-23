import { describe, expect, it } from "vitest";

import * as shared from "@mtg/shared/rules/permissions";
import * as server from "../permissions";
import { ZONE } from "../constants";
import type { Card, Player, Zone } from "@mtg/shared/types";

const makeCard = (overrides: Partial<Card> = {}): Card => ({
  id: overrides.id ?? "c1",
  name: overrides.name ?? "Card",
  ownerId: overrides.ownerId ?? "p1",
  controllerId: overrides.controllerId ?? overrides.ownerId ?? "p1",
  zoneId: overrides.zoneId ?? "z1",
  tapped: overrides.tapped ?? false,
  faceDown: overrides.faceDown ?? false,
  position: overrides.position ?? { x: 0, y: 0 },
  rotation: overrides.rotation ?? 0,
  counters: overrides.counters ?? [],
  ...overrides,
});

const makeZone = (
  id: string,
  type: Zone["type"],
  ownerId: string,
  cardIds: string[] = []
): Zone => ({
  id,
  type,
  ownerId,
  cardIds,
});

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: overrides.id ?? "p1",
  name: overrides.name ?? "Player",
  life: overrides.life ?? 20,
  counters: overrides.counters ?? [],
  commanderDamage: overrides.commanderDamage ?? {},
  commanderTax: overrides.commanderTax ?? 0,
  ...overrides,
});

describe("permissions parity", () => {
  it("matches canTapCard decisions", () => {
    const card = makeCard({ controllerId: "p1" });
    const zone = makeZone("bf", ZONE.BATTLEFIELD, "p1");

    expect(server.canTapCard("p1", card, zone)).toEqual(
      shared.canTapCard("p1", card, zone)
    );
  });

  it("matches canModifyCardState decisions", () => {
    const card = makeCard({ controllerId: "p1" });
    const zone = makeZone("bf", ZONE.BATTLEFIELD, "p1");

    expect(server.canModifyCardState("p2", card, zone)).toEqual(
      shared.canModifyCardState("p2", card, zone)
    );
  });

  it("matches canUpdatePlayer decisions", () => {
    const player = makePlayer({ id: "p1" });
    const updates = { life: 18 };

    expect(server.canUpdatePlayer("p1", player, updates)).toEqual(
      shared.canUpdatePlayer("p1", player, updates)
    );
  });

  it("matches canViewHiddenZone decisions", () => {
    const library = makeZone("lib", ZONE.LIBRARY, "p1");

    expect(server.canViewHiddenZone("p2", library)).toEqual(
      shared.canViewHiddenZone("p2", library)
    );
  });

  it("matches canMoveCard decisions", () => {
    const card = makeCard({ ownerId: "p1", controllerId: "p1" });
    const fromZone = makeZone("bf", ZONE.BATTLEFIELD, "p1");
    const toZone = makeZone("hand", ZONE.HAND, "p1");

    expect(server.canMoveCard("p1", card, fromZone, toZone)).toEqual(
      shared.canMoveCard("p1", card, fromZone, toZone)
    );
  });

  it("matches canAddCard decisions", () => {
    const token = makeCard({ ownerId: "p1", isToken: true });
    const zone = makeZone("hand", ZONE.HAND, "p1");

    expect(server.canAddCard("p1", token, zone)).toEqual(
      shared.canAddCard("p1", token, zone)
    );
  });

  it("matches canRemoveToken decisions", () => {
    const card = makeCard({ isToken: false });
    const zone = makeZone("bf", ZONE.BATTLEFIELD, "p1");

    expect(server.canRemoveToken("p1", card, zone)).toEqual(
      shared.canRemoveToken("p1", card, zone)
    );
  });
});
