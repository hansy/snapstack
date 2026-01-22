import type { StoreApi } from "zustand";

import type { GameState } from "@/types";
import type { PrivateOverlayPayload } from "@/partykit/messages";
import { applyPendingIntents, getPublicAuthoritativeState, setAuthoritativeState } from "@/store/gameStore/dispatchIntent";
import { mergePrivateOverlay } from "@/store/gameStore/overlay";
import { debugLog, isDebugEnabled, type DebugFlagKey } from "@/lib/debug";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

export const createPrivateOverlayActions = (
  set: SetState,
  get: GetState
): Pick<GameState, "privateOverlay" | "applyPrivateOverlay"> => ({
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
});
