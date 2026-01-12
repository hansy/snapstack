import { describe, expect, it } from "vitest";

import { ZONE } from "@/constants/zones";
import {
  BATTLEFIELD_HOVER_PREVIEW_DELAY_MS,
  canToggleCardPreviewLock,
  computeCardContainerStyle,
  getCardHoverPreviewPolicy,
  shouldDisableHoverAnimation,
} from "../cardModel";

describe("cardModel", () => {
  describe("computeCardContainerStyle", () => {
    it("composes transform parts in order", () => {
      const style = computeCardContainerStyle({
        propStyle: { transform: "translate(10px, 20px)", left: 5 },
        scale: 2,
        tapped: true,
        isDragging: false,
      });

      expect(style.left).toBe(5);
      expect(style.transform).toBe(
        "translate(10px, 20px) scale(2) rotate(90deg)"
      );
      expect(style.transformOrigin).toBe("center center");
      expect(style.opacity).toBe(1);
    });

    it("omits transform if nothing is applied", () => {
      const style = computeCardContainerStyle({
        propStyle: { left: 5 },
        scale: 1,
        tapped: false,
        isDragging: false,
      });

      expect(style.transform).toBeUndefined();
      expect(style.left).toBe(5);
    });

    it("sets opacity to 0 while dragging", () => {
      const style = computeCardContainerStyle({
        propStyle: {},
        scale: 1,
        tapped: false,
        isDragging: true,
      });

      expect(style.opacity).toBe(0);
    });
  });

  describe("getCardHoverPreviewPolicy", () => {
    it("disables preview while dragging", () => {
      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.BATTLEFIELD,
          canPeek: true,
          faceDown: false,
          isDragging: true,
        })
      ).toEqual({ kind: "none" });
    });

    it("blocks face-down preview when viewer cannot peek", () => {
      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.BATTLEFIELD,
          canPeek: false,
          faceDown: true,
          isDragging: false,
        })
      ).toEqual({ kind: "none" });
    });

    it("shows immediate preview in hand only when identity is visible", () => {
      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.HAND,
          canPeek: false,
          faceDown: false,
          isDragging: false,
        })
      ).toEqual({ kind: "none" });

      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.HAND,
          canPeek: true,
          faceDown: false,
          isDragging: false,
        })
      ).toEqual({ kind: "immediate" });
    });

    it("shows delayed preview on battlefield", () => {
      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.BATTLEFIELD,
          canPeek: true,
          faceDown: false,
          isDragging: false,
        })
      ).toEqual({ kind: "delayed", delayMs: BATTLEFIELD_HOVER_PREVIEW_DELAY_MS });
    });

    it("shows immediate preview for top graveyard/exile cards", () => {
      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.GRAVEYARD,
          canPeek: true,
          faceDown: false,
          isDragging: false,
          isZoneTopCard: true,
        })
      ).toEqual({ kind: "immediate" });

      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.EXILE,
          canPeek: true,
          faceDown: false,
          isDragging: false,
          isZoneTopCard: true,
        })
      ).toEqual({ kind: "immediate" });

      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.GRAVEYARD,
          canPeek: true,
          faceDown: false,
          isDragging: false,
          isZoneTopCard: false,
        })
      ).toEqual({ kind: "none" });
    });

    it("shows immediate preview for revealed top library cards", () => {
      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.LIBRARY,
          canPeek: true,
          faceDown: false,
          isDragging: false,
          isZoneTopCard: true,
          allowLibraryTopPreview: true,
        })
      ).toEqual({ kind: "immediate" });

      expect(
        getCardHoverPreviewPolicy({
          zoneType: ZONE.LIBRARY,
          canPeek: true,
          faceDown: false,
          isDragging: false,
          isZoneTopCard: true,
          allowLibraryTopPreview: false,
        })
      ).toEqual({ kind: "none" });
    });
  });

  describe("canToggleCardPreviewLock", () => {
    it("allows lock on battlefield (if not dragging)", () => {
      expect(
        canToggleCardPreviewLock({
          zoneType: ZONE.BATTLEFIELD,
          canPeek: false,
          faceDown: false,
          isDragging: false,
        })
      ).toBe(true);
    });

    it("allows lock in hand only when identity is visible", () => {
      expect(
        canToggleCardPreviewLock({
          zoneType: ZONE.HAND,
          canPeek: false,
          faceDown: false,
          isDragging: false,
        })
      ).toBe(false);

      expect(
        canToggleCardPreviewLock({
          zoneType: ZONE.HAND,
          canPeek: true,
          faceDown: false,
          isDragging: false,
        })
      ).toBe(true);
    });

    it("disallows lock for face-down cards when viewer cannot peek", () => {
      expect(
        canToggleCardPreviewLock({
          zoneType: ZONE.BATTLEFIELD,
          canPeek: false,
          faceDown: true,
          isDragging: false,
        })
      ).toBe(false);
    });
  });

  describe("shouldDisableHoverAnimation", () => {
    it("disables hover animation for opponent hands", () => {
      expect(
        shouldDisableHoverAnimation({
          zoneType: ZONE.HAND,
          ownerId: "p2",
          viewerId: "p1",
        })
      ).toBe(true);
      expect(
        shouldDisableHoverAnimation({
          zoneType: ZONE.HAND,
          ownerId: "p1",
          viewerId: "p1",
        })
      ).toBe(false);
    });
  });
});
