import { describe, expect, it, vi } from "vitest";

import type { Player, Zone } from "@/types";

import type { LocalPlayerInitPlan } from "../localPlayerInitPlan";
import { applyLocalPlayerInitPlan } from "../applyLocalPlayerInitPlan";

describe("applyLocalPlayerInitPlan", () => {
  it("applies upsertPlayer and ignores patchLocalPlayer when both exist", () => {
    const addPlayer = vi.fn();
    const updatePlayer = vi.fn();
    const addZone = vi.fn();

    const plan: LocalPlayerInitPlan = {
      upsertPlayer: { id: "p1", name: "P1" } as Player,
      patchLocalPlayer: { name: "Ignored" },
      patchColors: [],
      zonesToCreate: [],
    };

    applyLocalPlayerInitPlan({
      playerId: "p1",
      plan,
      actions: { addPlayer, updatePlayer, addZone },
    });

    expect(addPlayer).toHaveBeenCalledWith(plan.upsertPlayer);
    expect(updatePlayer).not.toHaveBeenCalled();
  });

  it("patches the local player when no upsertPlayer exists", () => {
    const addPlayer = vi.fn();
    const updatePlayer = vi.fn();
    const addZone = vi.fn();

    const plan: LocalPlayerInitPlan = {
      patchLocalPlayer: { name: "P1" },
      patchColors: [],
      zonesToCreate: [],
    };

    applyLocalPlayerInitPlan({
      playerId: "p1",
      plan,
      actions: { addPlayer, updatePlayer, addZone },
    });

    expect(updatePlayer).toHaveBeenCalledWith("p1", { name: "P1" }, "p1");
    expect(addPlayer).not.toHaveBeenCalled();
  });

  it("patches colors and creates zones", () => {
    const addPlayer = vi.fn();
    const updatePlayer = vi.fn();
    const addZone = vi.fn();

    const plan: LocalPlayerInitPlan = {
      patchLocalPlayer: { name: "P1" },
      patchColors: [
        { playerId: "p1", color: "rose" },
        { playerId: "p2", color: "sky" },
      ],
      zonesToCreate: [
        { id: "p1-library", type: "library", ownerId: "p1", cardIds: [] },
        { id: "p1-hand", type: "hand", ownerId: "p1", cardIds: [] },
      ],
    };

    applyLocalPlayerInitPlan({
      playerId: "p1",
      plan,
      actions: { addPlayer, updatePlayer, addZone },
    });

    expect(addPlayer).not.toHaveBeenCalled();
    expect(updatePlayer).toHaveBeenCalledWith("p1", { name: "P1" }, "p1");
    expect(updatePlayer).toHaveBeenCalledWith("p1", { color: "rose" }, "p1");
    expect(updatePlayer).toHaveBeenCalledWith("p2", { color: "sky" }, "p1");

    expect(addZone).toHaveBeenCalledTimes(2);
    expect(addZone).toHaveBeenCalledWith(plan.zonesToCreate[0] as Zone);
    expect(addZone).toHaveBeenCalledWith(plan.zonesToCreate[1] as Zone);
  });
});
