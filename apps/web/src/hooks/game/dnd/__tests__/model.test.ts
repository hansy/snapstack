import { describe, expect, it } from "vitest";

import type { Card, Zone } from "@/types";
import { ZONE } from "@/constants/zones";
import { computeDragEndPlan, computeDragMoveUiState } from "../model";

const createCard = (id: string, overrides: Partial<Card> = {}): Card => ({
  id,
  name: id,
  ownerId: "p1",
  controllerId: "p1",
  zoneId: "p1-hand",
  tapped: false,
  faceDown: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  counters: [],
  ...overrides,
});

const rect = (params: {
  left: number;
  top: number;
  width: number;
  height: number;
}) => ({
  left: params.left,
  top: params.top,
  width: params.width,
  height: params.height,
  right: params.left + params.width,
  bottom: params.top + params.height,
});

describe("gameDnD model", () => {
  describe("computeDragMoveUiState", () => {
    it("returns defaults when not over anything", () => {
      const state = computeDragMoveUiState({
        myPlayerId: "p1",
        cards: {},
        zones: {},
        over: null,
      });

      expect(state).toEqual({ ghostCard: null, overCardScale: 1 });
    });

    it("computes battlefield ghost placement when permitted", () => {
      const zones: Record<string, Zone> = {
        "p1-hand": { id: "p1-hand", type: ZONE.HAND, ownerId: "p1", cardIds: ["c1"] },
        "p1-battlefield": {
          id: "p1-battlefield",
          type: ZONE.BATTLEFIELD,
          ownerId: "p1",
          cardIds: [],
        },
      };
      const cards = {
        c1: createCard("c1", { zoneId: "p1-hand" }),
      };

      const state = computeDragMoveUiState({
        myPlayerId: "p1",
        cards,
        zones,
        activeCardId: "c1",
        activeRect: rect({ left: 300, top: 300, width: 80, height: 120 }),
        activeTapped: false,
        over: {
          id: "p1-battlefield",
          type: ZONE.BATTLEFIELD,
          rect: rect({ left: 0, top: 0, width: 1000, height: 600 }),
          scale: 1,
          cardScale: 1,
          mirrorY: false,
        },
      });

      expect(state.overCardScale).toBe(1);
      expect(state.ghostCard).toEqual({
        zoneId: "p1-battlefield",
        position: { x: 340, y: 360 },
        tapped: false,
      });
    });

    it("returns defaults when permission is denied", () => {
      const zones: Record<string, Zone> = {
        "p2-battlefield": {
          id: "p2-battlefield",
          type: ZONE.BATTLEFIELD,
          ownerId: "p2",
          cardIds: ["c1"],
        },
        "p1-battlefield": {
          id: "p1-battlefield",
          type: ZONE.BATTLEFIELD,
          ownerId: "p1",
          cardIds: [],
        },
      };
      const cards = {
        c1: createCard("c1", {
          ownerId: "p2",
          controllerId: "p2",
          zoneId: "p2-battlefield",
        }),
      };

      const state = computeDragMoveUiState({
        myPlayerId: "p1",
        cards,
        zones,
        activeCardId: "c1",
        activeRect: rect({ left: 0, top: 0, width: 80, height: 120 }),
        over: {
          id: "p1-battlefield",
          type: ZONE.BATTLEFIELD,
          rect: rect({ left: 0, top: 0, width: 1000, height: 600 }),
          scale: 1,
          cardScale: 1,
          mirrorY: false,
        },
      });

      expect(state).toEqual({ ghostCard: null, overCardScale: 1 });
    });
  });

  describe("computeDragEndPlan", () => {
    it("plans hand reordering within the same hand zone", () => {
      const zones: Record<string, Zone> = {
        "p1-hand": {
          id: "p1-hand",
          type: ZONE.HAND,
          ownerId: "p1",
          cardIds: ["a", "b", "c"],
        },
      };
      const cards = {
        a: createCard("a", { zoneId: "p1-hand" }),
        b: createCard("b", { zoneId: "p1-hand" }),
        c: createCard("c", { zoneId: "p1-hand" }),
      };

      expect(
        computeDragEndPlan({
          myPlayerId: "p1",
          cards,
          zones,
          cardId: "a",
          toZoneId: "p1-hand",
          overCardId: "c",
        })
      ).toEqual({ kind: "reorderHand", zoneId: "p1-hand", oldIndex: 0, newIndex: 2 });
    });

    it("plans battlefield move with canonical (unmirrored) position", () => {
      const zones: Record<string, Zone> = {
        "p1-hand": { id: "p1-hand", type: ZONE.HAND, ownerId: "p1", cardIds: ["c1"] },
        "p1-battlefield": {
          id: "p1-battlefield",
          type: ZONE.BATTLEFIELD,
          ownerId: "p1",
          cardIds: [],
        },
      };
      const cards = {
        c1: createCard("c1", { zoneId: "p1-hand" }),
      };

      const plan = computeDragEndPlan({
        myPlayerId: "p1",
        cards,
        zones,
        cardId: "c1",
        toZoneId: "p1-battlefield",
        activeRect: rect({ left: 300, top: 300, width: 80, height: 120 }),
        overRect: rect({ left: 0, top: 0, width: 1000, height: 600 }),
        overScale: 1,
        overCardScale: 1,
        mirrorY: false,
      });

      expect(plan.kind).toBe("moveCard");
      if (plan.kind !== "moveCard") return;
      expect(plan.position?.x).toBeCloseTo(0.34, 6);
      expect(plan.position?.y).toBeCloseTo(0.6, 6);
    });

    it("mirrors Y for opponent battlefield views", () => {
      const zones: Record<string, Zone> = {
        "p1-hand": { id: "p1-hand", type: ZONE.HAND, ownerId: "p1", cardIds: ["c1"] },
        "p2-battlefield": {
          id: "p2-battlefield",
          type: ZONE.BATTLEFIELD,
          ownerId: "p2",
          cardIds: [],
        },
      };
      const cards = {
        c1: createCard("c1", {
          zoneId: "p1-hand",
          ownerId: "p1",
          controllerId: "p1",
        }),
      };

      const plan = computeDragEndPlan({
        myPlayerId: "p1",
        cards,
        zones,
        cardId: "c1",
        toZoneId: "p2-battlefield",
        activeRect: rect({ left: 300, top: 300, width: 80, height: 120 }),
        overRect: rect({ left: 0, top: 0, width: 1000, height: 600 }),
        overScale: 1,
        overCardScale: 1,
        mirrorY: true,
      });

      expect(plan.kind).toBe("moveCard");
      if (plan.kind !== "moveCard") return;
      expect(plan.position?.x).toBeCloseTo(0.34, 6);
      expect(plan.position?.y).toBeCloseTo(0.4, 6);
    });
  });
});

