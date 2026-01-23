import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { PrivateOverlayDiffPayload, PrivateOverlayPayload } from "@/partykit/messages";
import { applyPendingIntents, getPublicAuthoritativeState, setAuthoritativeState } from "@/store/gameStore/dispatchIntent";
import { mergePrivateOverlay } from "@/store/gameStore/overlay";
import { debugLog, isDebugEnabled, type DebugFlagKey } from "@/lib/debug";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

export const createPrivateOverlayActions = (
  set: SetState,
  get: GetState
): Pick<GameState, "privateOverlay" | "applyPrivateOverlay" | "applyPrivateOverlayDiff"> => ({
  privateOverlay: null,

  applyPrivateOverlay: (overlay: PrivateOverlayPayload) => {
    const debugKey: DebugFlagKey = "faceDownDrag";
    if (isDebugEnabled(debugKey)) {
      const faceDownIds = overlay.cards
        .filter((card) => card.faceDown)
        .map((card) => card.id);
      debugLog(debugKey, "overlay-apply", {
        faceDownCount: faceDownIds.length,
        faceDownIds: faceDownIds.slice(0, 5),
        totalCards: overlay.cards.length,
      });
    }
    const base = getPublicAuthoritativeState() ?? get();
    const merged = mergePrivateOverlay(base, overlay);
    setAuthoritativeState(merged, base);
    const reconciled = applyPendingIntents(merged);
    set({ ...reconciled, privateOverlay: overlay });
  },

  applyPrivateOverlayDiff: (diff: PrivateOverlayDiffPayload) => {
    const current = get().privateOverlay;
    if (!current || current.overlayVersion !== diff.baseOverlayVersion) {
      return false;
    }

    const nextCards = new Map(current.cards.map((card) => [card.id, card]));
    diff.removes.forEach((cardId) => {
      nextCards.delete(cardId);
    });
    diff.upserts.forEach((card) => {
      nextCards.set(card.id, card);
    });

    const nextZoneCardOrders: Record<string, string[]> = {
      ...(current.zoneCardOrders ?? {}),
    };
    if (diff.zoneCardOrders) {
      Object.entries(diff.zoneCardOrders).forEach(([zoneId, cardIds]) => {
        if (Array.isArray(cardIds)) {
          nextZoneCardOrders[zoneId] = cardIds;
        }
      });
    }
    if (Array.isArray(diff.zoneOrderRemovals)) {
      diff.zoneOrderRemovals.forEach((zoneId) => {
        delete nextZoneCardOrders[zoneId];
      });
    }

    const nextZoneOrderVersions: Record<string, number> = {
      ...(current.zoneCardOrderVersions ?? {}),
    };
    if (diff.zoneCardOrderVersions) {
      Object.entries(diff.zoneCardOrderVersions).forEach(([zoneId, version]) => {
        if (typeof version === "number") {
          nextZoneOrderVersions[zoneId] = version;
        }
      });
    }
    if (Array.isArray(diff.zoneOrderRemovals)) {
      diff.zoneOrderRemovals.forEach((zoneId) => {
        delete nextZoneOrderVersions[zoneId];
      });
    }

    const nextOverlay: PrivateOverlayPayload = {
      schemaVersion: diff.schemaVersion,
      overlayVersion: diff.overlayVersion,
      roomId: diff.roomId,
      ...(diff.viewerId ? { viewerId: diff.viewerId } : current.viewerId ? { viewerId: current.viewerId } : null),
      cards: Array.from(nextCards.values()),
      ...(Object.keys(nextZoneCardOrders).length
        ? { zoneCardOrders: nextZoneCardOrders }
        : null),
      ...(Object.keys(nextZoneOrderVersions).length
        ? { zoneCardOrderVersions: nextZoneOrderVersions }
        : null),
      ...(diff.meta ? { meta: diff.meta } : current.meta ? { meta: current.meta } : null),
    };

    const base = getPublicAuthoritativeState() ?? get();
    const merged = mergePrivateOverlay(base, nextOverlay);
    setAuthoritativeState(merged, base);
    const reconciled = applyPendingIntents(merged);
    set({ ...reconciled, privateOverlay: nextOverlay });
    return true;
  },
});
