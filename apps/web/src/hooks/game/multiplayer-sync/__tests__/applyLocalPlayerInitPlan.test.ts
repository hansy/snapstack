import { describe, expect, it, vi } from "vitest";

import type { Player, Zone } from "@/types";
import type { SharedMaps } from "@/yjs/yMutations";

import type { LocalPlayerInitPlan } from "../localPlayerInitPlan";
import { applyLocalPlayerInitPlan } from "../applyLocalPlayerInitPlan";

describe("applyLocalPlayerInitPlan", () => {
  const sharedMaps = {} as SharedMaps;

  it("applies upsertPlayer and ignores patchLocalPlayer when both exist", () => {
    const transact = vi.fn((fn: () => void) => fn());
    const upsertPlayer = vi.fn();
    const patchPlayer = vi.fn();
    const upsertZone = vi.fn();

    const plan: LocalPlayerInitPlan = {
      upsertPlayer: { id: "p1", name: "P1" } as Player,
      patchLocalPlayer: { name: "Ignored" },
      patchColors: [],
      zonesToCreate: [],
    };

    applyLocalPlayerInitPlan({
      transact,
      sharedMaps,
      playerId: "p1",
      plan,
      mutations: { upsertPlayer, patchPlayer, upsertZone },
    });

    expect(transact).toHaveBeenCalledTimes(1);
    expect(upsertPlayer).toHaveBeenCalledWith(sharedMaps, plan.upsertPlayer);
    expect(patchPlayer).not.toHaveBeenCalled();
  });

  it("patches the local player when no upsertPlayer exists", () => {
    const transact = vi.fn((fn: () => void) => fn());
    const upsertPlayer = vi.fn();
    const patchPlayer = vi.fn();
    const upsertZone = vi.fn();

    const plan: LocalPlayerInitPlan = {
      patchLocalPlayer: { name: "P1" },
      patchColors: [],
      zonesToCreate: [],
    };

    applyLocalPlayerInitPlan({
      transact,
      sharedMaps,
      playerId: "p1",
      plan,
      mutations: { upsertPlayer, patchPlayer, upsertZone },
    });

    expect(patchPlayer).toHaveBeenCalledWith(sharedMaps, "p1", { name: "P1" });
    expect(upsertPlayer).not.toHaveBeenCalled();
  });

  it("patches colors and creates zones inside the transaction", () => {
    const events: string[] = [];
    const transact = vi.fn((fn: () => void) => {
      events.push("transact:start");
      fn();
      events.push("transact:end");
    });

    const patchPlayer = vi.fn((_: SharedMaps, id: string, patch: any) => {
      events.push(`patch:${id}:${String(patch.color ?? patch.name ?? "")}`);
    });
    const upsertPlayer = vi.fn(() => {
      events.push("upsertPlayer");
    });
    const upsertZone = vi.fn((_: SharedMaps, zone: Zone) => {
      events.push(`zone:${zone.id}`);
    });

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
      transact,
      sharedMaps,
      playerId: "p1",
      plan,
      mutations: { upsertPlayer, patchPlayer, upsertZone },
    });

    expect(events[0]).toBe("transact:start");
    expect(events[events.length - 1]).toBe("transact:end");
    expect(upsertPlayer).not.toHaveBeenCalled();

    expect(patchPlayer).toHaveBeenCalledWith(sharedMaps, "p1", { name: "P1" });
    expect(patchPlayer).toHaveBeenCalledWith(sharedMaps, "p1", { color: "rose" });
    expect(patchPlayer).toHaveBeenCalledWith(sharedMaps, "p2", { color: "sky" });

    expect(upsertZone).toHaveBeenCalledTimes(2);
    expect(events).toContain("zone:p1-library");
    expect(events).toContain("zone:p1-hand");
  });
});

