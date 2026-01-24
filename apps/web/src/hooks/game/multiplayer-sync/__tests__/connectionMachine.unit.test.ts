import { describe, expect, it } from "vitest";

import {
  createConnectionMachineState,
  transitionConnectionMachine,
} from "../connectionMachine";
import { DEFAULT_BACKOFF_CONFIG } from "../connectionBackoff";

const deterministicConfig = {
  backoff: DEFAULT_BACKOFF_CONFIG,
  random: () => 0.5,
};

describe("connectionMachine", () => {
  it("schedules reconnect on disconnect and increments attempt", () => {
    const initial = createConnectionMachineState();

    const { state, effects } = transitionConnectionMachine(
      initial,
      { type: "disconnected", reason: "close" },
      deterministicConfig
    );

    expect(state.pendingReconnect).toBe(true);
    expect(state.reconnectAttempt).toBe(1);
    expect(effects).toEqual([
      {
        type: "scheduleReconnect",
        delayMs: 500,
        reason: "close",
        attempt: 0,
      },
    ]);
  });

  it("resets attempts and schedules reconnect on resume", () => {
    const initial = {
      ...createConnectionMachineState(),
      reconnectAttempt: 3,
      pendingStableReset: true,
    };

    const { state, effects } = transitionConnectionMachine(
      initial,
      { type: "resume" },
      deterministicConfig
    );

    expect(state.phase).toBe("connecting");
    expect(state.pendingStableReset).toBe(false);
    expect(state.pendingReconnect).toBe(true);
    expect(state.reconnectAttempt).toBe(1);
    expect(effects).toEqual([
      { type: "cancelStableReset" },
      {
        type: "scheduleReconnect",
        delayMs: 500,
        reason: "resume",
        attempt: 0,
      },
    ]);
  });

  it("schedules stable reset on connect and clears reconnect", () => {
    const initial = {
      ...createConnectionMachineState(),
      pendingReconnect: true,
    };

    const { state, effects } = transitionConnectionMachine(
      initial,
      { type: "connected" },
      deterministicConfig
    );

    expect(state.phase).toBe("connected");
    expect(state.pendingReconnect).toBe(false);
    expect(state.pendingStableReset).toBe(true);
    expect(effects).toEqual([
      { type: "cancelReconnect" },
      { type: "scheduleStableReset", delayMs: DEFAULT_BACKOFF_CONFIG.stableResetMs },
    ]);
  });

  it("clears attempts after stable reset timer", () => {
    const initial = {
      ...createConnectionMachineState(),
      reconnectAttempt: 4,
      pendingStableReset: true,
    };

    const { state, effects } = transitionConnectionMachine(
      initial,
      { type: "stable-reset-timer-fired" },
      deterministicConfig
    );

    expect(state.reconnectAttempt).toBe(0);
    expect(state.pendingStableReset).toBe(false);
    expect(effects).toEqual([]);
  });

  it("abandons reconnect after max attempts", () => {
    const cappedConfig = {
      backoff: { ...DEFAULT_BACKOFF_CONFIG, maxAttempts: 2 },
      random: () => 0.1,
    };
    const initial = {
      ...createConnectionMachineState(),
      reconnectAttempt: 2,
    };

    const { state, effects } = transitionConnectionMachine(
      initial,
      { type: "disconnected", reason: "close" },
      cappedConfig
    );

    expect(state.abandoned).toBe(true);
    expect(state.pendingReconnect).toBe(false);
    expect(effects).toEqual([{ type: "abandonReconnect", attempt: 2 }]);
  });

  it("cancels timers when paused", () => {
    const initial = {
      ...createConnectionMachineState(),
      pendingReconnect: true,
      pendingStableReset: true,
    };

    const { state, effects } = transitionConnectionMachine(
      initial,
      { type: "pause" },
      deterministicConfig
    );

    expect(state.phase).toBe("paused");
    expect(state.pendingReconnect).toBe(false);
    expect(state.pendingStableReset).toBe(false);
    expect(effects).toEqual([{ type: "cancelReconnect" }, { type: "cancelStableReset" }]);
  });
});
