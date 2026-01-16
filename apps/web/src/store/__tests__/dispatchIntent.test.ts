import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPendingIntents,
  createIntentDispatcher,
  handleIntentAck,
  resetIntentState,
  setAuthoritativeState,
} from "../gameStore/dispatchIntent";
import { sendIntent } from "@/partykit/intentTransport";

vi.mock("@/partykit/intentTransport", () => ({
  sendIntent: vi.fn(),
}));

const sendIntentMock = vi.mocked(sendIntent);

describe("dispatchIntent", () => {
  beforeEach(() => {
    resetIntentState();
    sendIntentMock.mockClear();
  });

  it("sends intent and applies local update", () => {
    const setState = vi.fn();
    const dispatchIntent = createIntentDispatcher(setState);

    const applyLocal = vi.fn((state: any) => ({ ...state, updated: true }));
    const intentId = dispatchIntent({
      type: "player.update",
      payload: { playerId: "p1" },
      applyLocal,
    });

    expect(intentId).toEqual(expect.any(String));
    expect(sendIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "player.update" })
    );
    expect(setState).toHaveBeenCalledWith(applyLocal);
  });

  it("skips send when marked as remote", () => {
    const setState = vi.fn();
    const dispatchIntent = createIntentDispatcher(setState);

    const applyLocal = vi.fn((state: any) => state);
    const intentId = dispatchIntent({
      type: "card.move",
      payload: { cardId: "c1" },
      applyLocal,
      isRemote: true,
    });

    expect(intentId).toBeNull();
    expect(sendIntentMock).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalledWith(applyLocal);
  });

  it("reconciles pending intents on failed ack", () => {
    const setState = vi.fn();
    const dispatchIntent = createIntentDispatcher(setState);
    const applyLocal = vi.fn((state: any) => ({ ...state, updated: true }));

    const intentId = dispatchIntent({
      type: "card.tap",
      payload: { cardId: "c1" },
      applyLocal,
    });

    const baseState = { updated: false } as any;
    setAuthoritativeState(baseState);
    handleIntentAck(
      { type: "ack", intentId: intentId as string, ok: false },
      setState
    );

    const reconciled = applyPendingIntents(baseState);
    expect(setState).toHaveBeenCalledWith(reconciled);
  });
});
