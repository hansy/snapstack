import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPendingIntents,
  createIntentDispatcher,
  handleIntentAck,
  resetIntentState,
  setAuthoritativeState,
} from "../gameStore/dispatchIntent";
import { sendIntent } from "@/partykit/intentTransport";
import { toast } from "sonner";

vi.mock("@/partykit/intentTransport", () => ({
  sendIntent: vi.fn(),
  getIntentConnectionMeta: vi.fn(() => ({
    isOpen: false,
    everConnected: true,
    lastOpenAt: null,
    lastCloseAt: 0,
  })),
}));
vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

const sendIntentMock = vi.mocked(sendIntent);
const warningToastMock = vi.mocked(toast.warning);

describe("dispatchIntent", () => {
  beforeEach(() => {
    resetIntentState();
    sendIntentMock.mockClear();
    sendIntentMock.mockReturnValue(true);
    warningToastMock.mockClear();
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

  it("drops local updates when intent send fails", () => {
    sendIntentMock.mockReturnValue(false);
    const setState = vi.fn();
    const dispatchIntent = createIntentDispatcher(setState);
    const applyLocal = vi.fn((state: any) => ({ ...state, updated: true }));

    const intentId = dispatchIntent({
      type: "card.tap",
      payload: { cardId: "c1" },
      applyLocal,
    });

    expect(intentId).toBeNull();
    expect(sendIntentMock).toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
    expect(warningToastMock).toHaveBeenCalled();

    const baseState = { updated: false } as any;
    const reconciled = applyPendingIntents(baseState);
    expect(reconciled).toEqual(baseState);
  });

  it("suppresses dropped intent warnings when requested", () => {
    sendIntentMock.mockReturnValue(false);
    const setState = vi.fn();
    const dispatchIntent = createIntentDispatcher(setState);

    const intentId = dispatchIntent({
      type: "player.leave",
      payload: { playerId: "p1" },
      suppressDropToast: true,
    });

    expect(intentId).toBeNull();
    expect(sendIntentMock).toHaveBeenCalled();
    expect(warningToastMock).not.toHaveBeenCalled();
  });

  it("throttles dropped intent warnings", () => {
    sendIntentMock.mockReturnValue(false);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

    const setState = vi.fn();
    const dispatchIntent = createIntentDispatcher(setState);
    dispatchIntent({ type: "card.tap", payload: { cardId: "c1" } });
    dispatchIntent({ type: "card.tap", payload: { cardId: "c2" } });

    expect(warningToastMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    vi.setSystemTime(new Date("2024-01-01T00:00:02.000Z"));
    dispatchIntent({ type: "card.tap", payload: { cardId: "c3" } });

    expect(warningToastMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
