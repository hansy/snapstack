import { describe, expect, it } from "vitest";
import { ZONE } from "@/constants/zones";
import { computeRevealPatchAfterMove, normalizeMovePosition, resolveFaceDownAfterMove } from "../movementModel";

describe("movementModel", () => {
  describe("resolveFaceDownAfterMove", () => {
    it("uses requested faceDown when provided", () => {
      expect(
        resolveFaceDownAfterMove({
          fromZoneType: ZONE.HAND,
          toZoneType: ZONE.BATTLEFIELD,
          currentFaceDown: false,
          currentFaceDownMode: undefined,
          requestedFaceDown: true,
          requestedFaceDownMode: undefined,
        })
      ).toEqual({
        effectiveFaceDown: true,
        patchFaceDown: true,
        effectiveFaceDownMode: undefined,
        patchFaceDownMode: null,
      });
    });

    it("preserves faceDown between battlefields when not specified", () => {
      expect(
        resolveFaceDownAfterMove({
          fromZoneType: ZONE.BATTLEFIELD,
          toZoneType: ZONE.BATTLEFIELD,
          currentFaceDown: true,
          currentFaceDownMode: "morph",
          requestedFaceDown: undefined,
          requestedFaceDownMode: undefined,
        })
      ).toEqual({
        effectiveFaceDown: true,
        patchFaceDown: undefined,
        effectiveFaceDownMode: "morph",
        patchFaceDownMode: undefined,
      });
    });

    it("defaults to face-up outside battlefield-to-battlefield moves", () => {
      expect(
        resolveFaceDownAfterMove({
          fromZoneType: ZONE.BATTLEFIELD,
          toZoneType: ZONE.GRAVEYARD,
          currentFaceDown: true,
          currentFaceDownMode: "morph",
          requestedFaceDown: undefined,
          requestedFaceDownMode: undefined,
        })
      ).toEqual({
        effectiveFaceDown: false,
        patchFaceDown: false,
        effectiveFaceDownMode: undefined,
        patchFaceDownMode: null,
      });
    });
  });

  describe("computeRevealPatchAfterMove", () => {
    it("clears reveal metadata when entering the library", () => {
      expect(
        computeRevealPatchAfterMove({
          fromZoneType: ZONE.BATTLEFIELD,
          toZoneType: ZONE.LIBRARY,
          effectiveFaceDown: false,
        })
      ).toEqual({ knownToAll: false, revealedToAll: false, revealedTo: [] });
    });

    it("clears reveal metadata when landing face-down on the battlefield", () => {
      expect(
        computeRevealPatchAfterMove({
          fromZoneType: ZONE.HAND,
          toZoneType: ZONE.BATTLEFIELD,
          effectiveFaceDown: true,
        })
      ).toEqual({ knownToAll: false, revealedToAll: false, revealedTo: [] });
    });

    it("marks a face-up card as known when entering public zones", () => {
      expect(
        computeRevealPatchAfterMove({
          fromZoneType: ZONE.HAND,
          toZoneType: ZONE.GRAVEYARD,
          effectiveFaceDown: false,
        })
      ).toEqual({ knownToAll: true, revealedToAll: false, revealedTo: [] });
    });

    it("does nothing when moving into hidden zones", () => {
      expect(
        computeRevealPatchAfterMove({
          fromZoneType: ZONE.BATTLEFIELD,
          toZoneType: ZONE.HAND,
          effectiveFaceDown: false,
        })
      ).toBeNull();
    });
  });

  describe("normalizeMovePosition", () => {
    it("migrates legacy pixel coordinates", () => {
      const next = normalizeMovePosition({ x: 100, y: 100 }, { x: 0.5, y: 0.5 });
      expect(next.x).toBeCloseTo(0.1, 6);
      expect(next.y).toBeCloseTo(100 / 600, 6);
    });

    it("clamps and falls back when position is missing", () => {
      expect(normalizeMovePosition(undefined, { x: 2, y: -1 })).toEqual({ x: 1, y: 0 });
    });
  });
});
