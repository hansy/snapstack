import {
  computeBackoffDelay,
  DEFAULT_BACKOFF_CONFIG,
  shouldAbandonReconnect,
  type BackoffConfig,
  type BackoffReason,
} from "./connectionBackoff";

export type ConnectionPhase = "connecting" | "connected" | "paused" | "abandoned";

export type ConnectionMachineState = {
  phase: ConnectionPhase;
  reconnectAttempt: number;
  pendingReconnect: boolean;
  pendingStableReset: boolean;
  abandoned: boolean;
};

export type ConnectionMachineEvent =
  | { type: "pause" }
  | { type: "resume" }
  | { type: "connected" }
  | { type: "status-disconnected" }
  | { type: "disconnected"; reason: BackoffReason }
  | { type: "reconnect-timer-fired" }
  | { type: "stable-reset-timer-fired" }
  | { type: "reset" };

export type ConnectionMachineEffect =
  | { type: "scheduleReconnect"; delayMs: number; reason: BackoffReason; attempt: number }
  | { type: "cancelReconnect" }
  | { type: "scheduleStableReset"; delayMs: number }
  | { type: "cancelStableReset" }
  | { type: "abandonReconnect"; attempt: number };

export type ConnectionMachineConfig = {
  backoff?: BackoffConfig;
  random?: () => number;
};

export const createConnectionMachineState = (): ConnectionMachineState => ({
  phase: "connecting",
  reconnectAttempt: 0,
  pendingReconnect: false,
  pendingStableReset: false,
  abandoned: false,
});

export const transitionConnectionMachine = (
  state: ConnectionMachineState,
  event: ConnectionMachineEvent,
  config: ConnectionMachineConfig = {}
): { state: ConnectionMachineState; effects: ConnectionMachineEffect[] } => {
  const backoff = config.backoff ?? DEFAULT_BACKOFF_CONFIG;
  const random = config.random ?? Math.random;
  const next: ConnectionMachineState = { ...state };
  const effects: ConnectionMachineEffect[] = [];

  const cancelReconnect = () => {
    if (!next.pendingReconnect) return;
    next.pendingReconnect = false;
    effects.push({ type: "cancelReconnect" });
  };

  const cancelStableReset = () => {
    if (!next.pendingStableReset) return;
    next.pendingStableReset = false;
    effects.push({ type: "cancelStableReset" });
  };

  const scheduleReconnect = (reason: BackoffReason, resetAttempt: boolean) => {
    if (next.pendingReconnect) return;
    if (resetAttempt) {
      next.reconnectAttempt = 0;
      next.abandoned = false;
    }
    const attempt = next.reconnectAttempt;
    if (shouldAbandonReconnect(attempt, backoff)) {
      next.abandoned = true;
      effects.push({ type: "abandonReconnect", attempt });
      return;
    }
    const delayMs = computeBackoffDelay(attempt, reason, backoff, random);
    next.reconnectAttempt = attempt + 1;
    next.pendingReconnect = true;
    next.abandoned = false;
    effects.push({ type: "scheduleReconnect", delayMs, reason, attempt });
  };

  const scheduleStableReset = () => {
    next.pendingStableReset = true;
    effects.push({ type: "scheduleStableReset", delayMs: backoff.stableResetMs });
  };

  switch (event.type) {
    case "pause": {
      next.phase = "paused";
      cancelReconnect();
      cancelStableReset();
      break;
    }
    case "resume": {
      next.phase = "connecting";
      cancelStableReset();
      scheduleReconnect("resume", true);
      break;
    }
    case "connected": {
      next.phase = "connected";
      next.abandoned = false;
      cancelReconnect();
      cancelStableReset();
      scheduleStableReset();
      break;
    }
    case "status-disconnected": {
      if (next.phase === "connected") {
        next.phase = "connecting";
      }
      cancelStableReset();
      break;
    }
    case "disconnected": {
      next.phase = "connecting";
      cancelStableReset();
      scheduleReconnect(event.reason, false);
      break;
    }
    case "reconnect-timer-fired": {
      next.pendingReconnect = false;
      next.phase = "connecting";
      break;
    }
    case "stable-reset-timer-fired": {
      next.pendingStableReset = false;
      next.reconnectAttempt = 0;
      next.abandoned = false;
      break;
    }
    case "reset": {
      next.phase = "connecting";
      next.reconnectAttempt = 0;
      next.abandoned = false;
      cancelReconnect();
      cancelStableReset();
      break;
    }
    default:
      break;
  }

  return { state: next, effects };
};
