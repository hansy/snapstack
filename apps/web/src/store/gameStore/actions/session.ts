import type { StoreApi } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type { GameState } from "@/types";

import { clearLogs } from "@/logging/logStore";
import { destroySession, getSessionHandles } from "@/yjs/docManager";
import { removePlayer as yRemovePlayer, type SharedMaps } from "@/yjs/yMutations";

type SetState = StoreApi<GameState>["setState"];
type GetState = StoreApi<GameState>["getState"];

export const createSessionActions = (
  set: SetState,
  get: GetState
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
> => ({
  playerIdsBySession: {},
  sessionVersions: {},
  sessionId: uuidv4(),
  myPlayerId: uuidv4(),
  hasHydrated: false,

  resetSession: (newSessionId, playerId) => {
    const freshSessionId = newSessionId ?? uuidv4();
    const freshPlayerId =
      playerId ?? get().playerIdsBySession[freshSessionId] ?? uuidv4();

    clearLogs();

    set((state) => ({
      players: {},
      playerOrder: [],
      cards: {},
      zones: {},
      battlefieldViewScale: {},
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
      const handles = getSessionHandles(sessionId);
      if (handles) {
        handles.doc.transact(() => {
          const maps: SharedMaps = {
            players: handles.players,
            playerOrder: handles.playerOrder,
            zones: handles.zones,
            cards: handles.cards,
            zoneCardOrders: handles.zoneCardOrders,
            globalCounters: handles.globalCounters,
            battlefieldViewScale: handles.battlefieldViewScale,
          };
          yRemovePlayer(maps, playerId);
        });
      }

      try {
        destroySession(sessionId);
      } catch (_err) {}

      get().forgetSessionIdentity(sessionId);
    }

    get().resetSession();
  },

  setHasHydrated: (next) => {
    set({ hasHydrated: next });
  },
});
