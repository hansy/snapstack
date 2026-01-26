import type { StoreApi } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type { GameState } from "@/types";

import { clearLogs } from "@/logging/logStore";
import { destroyAllSessions, destroySession } from "@/yjs/docManager";
import type { DispatchIntent } from "@/store/gameStore/dispatchIntent";
import { resetIntentState } from "@/store/gameStore/dispatchIntent";
import { clearRoomHostPending, writeRoomTokensToStorage } from "@/lib/partyKitToken";
import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { clearIntentTransport } from "@/partykit/intentTransport";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

export const createSessionActions = (
  set: SetState,
  get: GetState,
  { dispatchIntent }: { dispatchIntent: DispatchIntent }
): Pick<
  GameState,
  | "playerIdsBySession"
  | "sessionVersions"
  | "sessionId"
  | "myPlayerId"
  | "hasHydrated"
  | "resetSession"
  | "ensurePlayerIdForSession"
  | "forgetSessionIdentity"
  | "ensureSessionVersion"
  | "leaveGame"
  | "setHasHydrated"
  | "viewerRole"
  | "setViewerRole"
  | "overlayCapabilities"
  | "setOverlayCapabilities"
  | "roomTokens"
  | "setRoomTokens"
> => ({
  playerIdsBySession: {},
  sessionVersions: {},
  sessionId: uuidv4(),
  myPlayerId: uuidv4(),
  hasHydrated: false,
  viewerRole: "player",
  overlayCapabilities: [],
  roomTokens: null,

  resetSession: (newSessionId, playerId) => {
    const freshSessionId = newSessionId ?? uuidv4();
    const freshPlayerId =
      playerId ?? get().playerIdsBySession[freshSessionId] ?? uuidv4();

    clearLogs();
    resetIntentState();

    set((state) => ({
      players: {},
      playerOrder: [],
      cards: {},
      zones: {},
      handRevealsToAll: {},
      libraryRevealsToAll: {},
      faceDownRevealsToAll: {},
      battlefieldViewScale: {},
      roomHostId: null,
      roomLockedByHost: false,
      roomOverCapacity: false,
      privateOverlay: null,
      overlayCapabilities: [],
      roomTokens: null,
      viewerRole: "player",
      sessionId: freshSessionId,
      myPlayerId: freshPlayerId,
      playerIdsBySession: {
        ...state.playerIdsBySession,
        [freshSessionId]: freshPlayerId,
      },
      sessionVersions: {
        ...state.sessionVersions,
        [freshSessionId]: (state.sessionVersions[freshSessionId] ?? 0) + 1,
      },
      globalCounters: {},
      activeModal: null,
    }));
  },

  ensurePlayerIdForSession: (sessionId: string) => {
    const existing = get().playerIdsBySession[sessionId];
    if (existing) return existing;
    const fresh = uuidv4();
    set((state) => ({
      playerIdsBySession: { ...state.playerIdsBySession, [sessionId]: fresh },
    }));
    return fresh;
  },

  forgetSessionIdentity: (sessionId: string) => {
    set((state) => {
      const next = { ...state.playerIdsBySession };
      delete next[sessionId];
      const nextVersions = { ...state.sessionVersions };
      nextVersions[sessionId] = (nextVersions[sessionId] ?? 0) + 1;
      return { playerIdsBySession: next, sessionVersions: nextVersions };
    });
  },

  ensureSessionVersion: (sessionId: string) => {
    const current = get().sessionVersions[sessionId];
    if (typeof current === "number") return current;
    const next = 1;
    set((state) => ({
      sessionVersions: { ...state.sessionVersions, [sessionId]: next },
    }));
    return next;
  },

  leaveGame: () => {
    const sessionId = get().sessionId;
    const playerId = get().myPlayerId;

    if (sessionId) {
      dispatchIntent({
        type: "player.leave",
        payload: { playerId, actorId: playerId },
        suppressDropToast: true,
      });

      try {
        destroySession(sessionId);
      } catch (_err) {}
      try {
        destroyAllSessions();
      } catch (_err) {}
      try {
        clearIntentTransport();
      } catch (_err) {}

      get().forgetSessionIdentity(sessionId);
      writeRoomTokensToStorage(sessionId, null);
      clearRoomHostPending(sessionId);
      useClientPrefsStore.getState().clearLastSessionId();
    }

    get().resetSession();
  },

  setHasHydrated: (next) => {
    set({ hasHydrated: next });
  },

  setViewerRole: (role) => {
    set({ viewerRole: role });
  },

  setOverlayCapabilities: (capabilities) => {
    set({ overlayCapabilities: [...capabilities] });
  },

  setRoomTokens: (tokens) => {
    set((state) => ({
      roomTokens: tokens ? { ...state.roomTokens, ...tokens } : null,
    }));
  },
});
