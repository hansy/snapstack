import { describe, expect, it } from "vitest";

import { ZONE } from "../constants";
import {
  canAddCard,
  canModifyCardState,
  canMoveCard,
  canRemoveToken,
  canTapCard,
  canUpdatePlayer,
  canViewHiddenZone,
} from "../permissions";
import type { Card } from "../../../web/src/types/cards";
import type { Player } from "../../../web/src/types/players";
import type { Zone, ZoneType } from "../../../web/src/types/zones";

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
  type: ZoneType,
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

describe("server permissions", () => {
  it("should allow tapping when actor controls a battlefield card", () => {
    const card = makeCard({ controllerId: "p1" });
    const zone = makeZone("bf", ZONE.BATTLEFIELD, "p1");

    expect(canTapCard("p1", card, zone)).toEqual({ allowed: true });
  });

  it("should deny tapping when the card is not on the battlefield", () => {
    const card = makeCard({ controllerId: "p1" });
    const zone = makeZone("hand", ZONE.HAND, "p1");

    expect(canTapCard("p1", card, zone).allowed).toBe(false);
  });

  it("should deny battlefield edits when actor is not the controller", () => {
    const card = makeCard({ controllerId: "p1" });
    const zone = makeZone("bf", ZONE.BATTLEFIELD, "p1");

    expect(canModifyCardState("p2", card, zone).allowed).toBe(false);
  });

  it("should allow players to update their own record", () => {
    const player = makePlayer({ id: "p1" });

    expect(canUpdatePlayer("p1", player, { life: 18 })).toEqual({ allowed: true });
  });

  it("should deny life changes for other players", () => {
    const player = makePlayer({ id: "p1", life: 20 });

    const result = canUpdatePlayer("p2", player, { life: 18 });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("life total");
    }
  });

  it("should deny name changes for other players", () => {
    const player = makePlayer({ id: "p1" });

    const result = canUpdatePlayer("p2", player, { name: "New" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("name");
    }
  });

  it("should deny other updates for non-owners", () => {
    const player = makePlayer({ id: "p1" });

    const result = canUpdatePlayer("p2", player, { color: "#fff" });
    expect(result.allowed).toBe(false);
  });

  it("should deny viewing hidden zones owned by other players", () => {
    const library = makeZone("lib", ZONE.LIBRARY, "p1");

    expect(canViewHiddenZone("p2", library).allowed).toBe(false);
  });

  it("should allow viewing public zones regardless of owner", () => {
    const graveyard = makeZone("gy", ZONE.GRAVEYARD, "p1");

    expect(canViewHiddenZone("p2", graveyard).allowed).toBe(true);
  });

  it("should allow moving into an owned hidden zone", () => {
    const card = makeCard({ ownerId: "p1", controllerId: "p1" });
    const fromZone = makeZone("bf", ZONE.BATTLEFIELD, "p1");
    const toZone = makeZone("hand", ZONE.HAND, "p1");

    expect(canMoveCard("p1", card, fromZone, toZone).allowed).toBe(true);
  });

  it("should deny moving into a hidden zone owned by another player", () => {
    const card = makeCard({ ownerId: "p1", controllerId: "p1" });
    const fromZone = makeZone("bf", ZONE.BATTLEFIELD, "p1");
    const toZone = makeZone("hand", ZONE.HAND, "p1");

    expect(canMoveCard("p2", card, fromZone, toZone).allowed).toBe(false);
  });

  it("should deny moving a token off the battlefield when actor is not the owner", () => {
    const token = makeCard({ ownerId: "p1", controllerId: "p2", isToken: true });
    const fromZone = makeZone("bf", ZONE.BATTLEFIELD, "p1");
    const toZone = makeZone("gy", ZONE.GRAVEYARD, "p1");

    expect(canMoveCard("p2", token, fromZone, toZone).allowed).toBe(false);
  });

  it("should allow owner or controller to move between battlefields", () => {
    const card = makeCard({ ownerId: "p1", controllerId: "p2" });
    const fromZone = makeZone("bf1", ZONE.BATTLEFIELD, "p1");
    const toZone = makeZone("bf2", ZONE.BATTLEFIELD, "p2");

    expect(canMoveCard("p2", card, fromZone, toZone).allowed).toBe(true);
  });

  it("should allow the battlefield host to move a foreign card between public zones", () => {
    const card = makeCard({ ownerId: "p1", controllerId: "p1" });
    const fromZone = makeZone("bf", ZONE.BATTLEFIELD, "p2");
    const toZone = makeZone("gy", ZONE.GRAVEYARD, "p1");

    expect(canMoveCard("p2", card, fromZone, toZone).allowed).toBe(true);
  });

  it("should deny moving from a hidden zone when actor is not the owner", () => {
    const card = makeCard({ ownerId: "p1" });
    const fromZone = makeZone("lib", ZONE.LIBRARY, "p1");
    const toZone = makeZone("bf", ZONE.BATTLEFIELD, "p1");

    expect(canMoveCard("p2", card, fromZone, toZone).allowed).toBe(false);
  });

  it("should deny adding tokens to non-battlefield zones", () => {
    const token = makeCard({ ownerId: "p1", isToken: true });
    const zone = makeZone("hand", ZONE.HAND, "p1");

    expect(canAddCard("p1", token, zone).allowed).toBe(false);
  });

  it("should deny adding a card into another player's hidden zone", () => {
    const card = makeCard({ ownerId: "p1" });
    const zone = makeZone("hand", ZONE.HAND, "p2");

    expect(canAddCard("p1", card, zone).allowed).toBe(false);
  });

  it("should allow adding cards to a battlefield when actor is owner or controller", () => {
    const card = makeCard({ ownerId: "p1", controllerId: "p2" });
    const zone = makeZone("bf", ZONE.BATTLEFIELD, "p2");

    expect(canAddCard("p2", card, zone).allowed).toBe(true);
  });

  it("should deny removing non-token cards via token removal", () => {
    const card = makeCard({ isToken: false });
    const zone = makeZone("bf", ZONE.BATTLEFIELD, "p1");

    expect(canRemoveToken("p1", card, zone).allowed).toBe(false);
  });

  it("should allow removing tokens for owners, controllers, or zone hosts", () => {
    const token = makeCard({ ownerId: "p1", controllerId: "p2", isToken: true });
    const zone = makeZone("bf", ZONE.BATTLEFIELD, "p3");

    expect(canRemoveToken("p1", token, zone).allowed).toBe(true);
    expect(canRemoveToken("p2", token, zone).allowed).toBe(true);
    expect(canRemoveToken("p3", token, zone).allowed).toBe(true);
  });
});
