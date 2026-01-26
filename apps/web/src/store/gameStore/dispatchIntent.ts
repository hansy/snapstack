import type { StoreApi } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import type { GameState } from "@/types";
import type { Intent, IntentAck } from "@/partykit/messages";
import { getIntentConnectionMeta, sendIntent } from "@/partykit/intentTransport";

export type DispatchIntentArgs = {
  type: string;
  payload: Record<string, unknown>;
  applyLocal?: (state: GameState) => Partial<GameState> | GameState;
  isRemote?: boolean;
  skipSend?: boolean;
  suppressDropToast?: boolean;
};

export type DispatchIntent = (args: DispatchIntentArgs) => string | null;

type PendingIntent = {
  id: string;
  applyLocal?: (state: GameState) => Partial<GameState> | GameState;
};

const pendingIntents: PendingIntent[] = [];
let lastAuthoritativeState: GameState | null = null;
let lastPublicState: GameState | null = null;
let lastDropToastAt = 0;
let firstDropAt: number | null = null;

const DROP_TOAST_COOLDOWN_MS = 2000;
const INTENT_DROP_GRACE_MS = 10_000;
const INTENT_DISCONNECT_GRACE_MS = 4_000;

const shouldWarnIntentDropped = () => {
  const now = Date.now();
  const meta = getIntentConnectionMeta();
  if (meta.isOpen) {
    firstDropAt = null;
    return false;
  }
  if (meta.everConnected) {
    firstDropAt = null;
    if (meta.lastCloseAt && now - meta.lastCloseAt < INTENT_DISCONNECT_GRACE_MS) {
      return false;
    }
    return true;
  }
  if (firstDropAt === null) {
    firstDropAt = now;
    return false;
  }
  return now - firstDropAt >= INTENT_DROP_GRACE_MS;
};

const warnIntentDropped = () => {
  if (!shouldWarnIntentDropped()) return;
  const now = Date.now();
  if (now - lastDropToastAt < DROP_TOAST_COOLDOWN_MS) return;
  lastDropToastAt = now;
  toast.warning("Reconnecting to multiplayer, please wait a moment then try again.");
};

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
  lastDropToastAt = 0;
  firstDropAt = null;
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
  return ({
    type,
    payload,
    applyLocal,
    isRemote,
    skipSend,
    suppressDropToast,
  }) => {
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
      if (sent === false) {
        if (!suppressDropToast) {
          warnIntentDropped();
        }
        return null;
      }
    }

    pendingIntents.push({ id: intentId, applyLocal });
    if (applyLocal) {
      setState(applyLocal);
    }

    return intentId;
  };
};
