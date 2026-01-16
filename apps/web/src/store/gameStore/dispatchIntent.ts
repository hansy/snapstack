import type { StoreApi } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type { GameState } from "@/types";
import type { Intent, IntentAck } from "@/partykit/messages";
import { sendIntent } from "@/partykit/intentTransport";

export type DispatchIntentArgs = {
  type: string;
  payload: Record<string, unknown>;
  applyLocal?: (state: GameState) => Partial<GameState> | GameState;
  isRemote?: boolean;
  skipSend?: boolean;
};

export type DispatchIntent = (args: DispatchIntentArgs) => string | null;

type PendingIntent = {
  id: string;
  applyLocal?: (state: GameState) => Partial<GameState> | GameState;
};

const pendingIntents: PendingIntent[] = [];
let lastAuthoritativeState: GameState | null = null;
let lastPublicState: GameState | null = null;

const applyLocalPatch = (
  state: GameState,
  applyLocal: PendingIntent["applyLocal"]
): GameState => {
  if (!applyLocal) return state;
  const patch = applyLocal(state);
  if (!patch || patch === state) return state;
  return { ...state, ...patch };
};

export const applyPendingIntents = (state: GameState): GameState => {
  let next = state;
  pendingIntents.forEach((pending) => {
    next = applyLocalPatch(next, pending.applyLocal);
  });
  return next;
};

export const setAuthoritativeState = (state: GameState, publicState?: GameState) => {
  lastAuthoritativeState = state;
  if (publicState) lastPublicState = publicState;
};

export const getAuthoritativeState = () => lastAuthoritativeState;

export const getPublicAuthoritativeState = () => lastPublicState;

export const resetIntentState = () => {
  pendingIntents.splice(0, pendingIntents.length);
  lastAuthoritativeState = null;
  lastPublicState = null;
};

export const handleIntentAck = (
  ack: IntentAck,
  setState: StoreApi<GameState>["setState"]
): string | null => {
  const index = pendingIntents.findIndex((pending) => pending.id === ack.intentId);
  if (index === -1) return null;
  pendingIntents.splice(index, 1);

  if (!ack.ok && lastAuthoritativeState) {
    const reconciled = applyPendingIntents(lastAuthoritativeState);
    setState(reconciled);
  }

  if (!ack.ok) {
    return ack.error || "Action rejected";
  }

  return null;
};

export const createIntentDispatcher = (
  setState: StoreApi<GameState>["setState"]
): DispatchIntent => {
  return ({ type, payload, applyLocal, isRemote, skipSend }) => {
    if (isRemote) {
      if (applyLocal) {
        setState(applyLocal);
      }
      return null;
    }

    const intentId = uuidv4();
    if (!skipSend) {
      const intent: Intent = {
        id: intentId,
        type,
        payload,
      };
      const sent = sendIntent(intent);
      if (!sent && import.meta.env.DEV) {
        console.warn("[party] intent send failed", {
          intentId,
          type,
        });
      } else if (import.meta.env.DEV) {
        if (
          type === "library.draw" ||
          type === "library.shuffle" ||
          type === "deck.load" ||
          type === "deck.reset" ||
          type === "deck.mulligan" ||
          type === "card.add" ||
          type === "card.add.batch"
        ) {
          console.info("[party] intent sent", {
            intentId,
            type,
            actorId: typeof payload.actorId === "string" ? payload.actorId : undefined,
          });
        }
      }
    }

    pendingIntents.push({ id: intentId, applyLocal });
    if (applyLocal) {
      setState(applyLocal);
    }

    return intentId;
  };
};
