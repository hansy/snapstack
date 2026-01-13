import { describe, expect, it } from "vitest";

import type { LogContext, LogMessage, LogMessagePart } from "@/logging/types";
import {
  computeVisibleCardName,
  formatTimeAgo,
  getBorderColorClass,
  isPublicZoneType,
  resolveLogCardContext,
  resolveLogCardDisplayName,
} from "../logDrawerModel";

describe("logDrawerModel", () => {
  it("maps actor colors to border classes", () => {
    expect(getBorderColorClass("rose")).toBe("border-rose-500/50");
    expect(getBorderColorClass("violet")).toBe("border-violet-500/50");
    expect(getBorderColorClass("sky")).toBe("border-sky-500/50");
    expect(getBorderColorClass("amber")).toBe("border-amber-500/50");
    expect(getBorderColorClass("emerald")).toBe("border-emerald-500/50");
    expect(getBorderColorClass("unknown")).toBe("border-zinc-700/50");
    expect(getBorderColorClass(undefined)).toBe("border-zinc-700/50");
  });

  it("formats relative time deterministically", () => {
    const now = 1_000_000;
    expect(formatTimeAgo(now - 59_000, now)).toBe("just now");
    expect(formatTimeAgo(now - 60_000, now)).toBe("1m ago");
    expect(formatTimeAgo(now - 60 * 60_000, now)).toBe("1h ago");
    expect(formatTimeAgo(now - 25 * 60 * 60_000, now)).toBe("long ago");
  });

  it("treats hand/library as non-public zone types", () => {
    expect(isPublicZoneType(undefined)).toBe(false);
    expect(isPublicZoneType("hand")).toBe(false);
    expect(isPublicZoneType("library")).toBe(false);
    expect(isPublicZoneType("battlefield")).toBe(true);
    expect(isPublicZoneType("graveyard")).toBe(true);
  });

  it("uses fallback card name only when zones are public", () => {
    expect(
      computeVisibleCardName({
        computedName: "Lightning Bolt",
        fallbackName: "Bolt",
      })
    ).toBe("Lightning Bolt");

    expect(
      computeVisibleCardName({
        computedName: "a card",
        fallbackName: "Lightning Bolt",
        fromZoneType: "battlefield",
      })
    ).toBe("Lightning Bolt");

    expect(
      computeVisibleCardName({
        computedName: "a card",
        fallbackName: "Lightning Bolt",
        fromZoneType: "hand",
        toZoneType: "library",
      })
    ).toBe("a card");
  });

  it("keeps forced-hidden move entries redacted", () => {
    const logContext: LogContext = {
      players: {},
      cards: {
        c1: {
          id: "c1",
          name: "Lightning Bolt",
          ownerId: "p1",
          controllerId: "p1",
          zoneId: "z2",
          tapped: false,
          faceDown: false,
          position: { x: 0, y: 0 },
          rotation: 0,
          counters: [],
        } as any,
      },
      zones: {
        z1: { id: "z1", type: "hand", ownerId: "p1", cardIds: [] } as any,
        z2: { id: "z2", type: "battlefield", ownerId: "p1", cardIds: ["c1"] } as any,
      },
    };

    const entry: LogMessage = {
      id: "log-1",
      ts: 1,
      eventId: "card.move",
      visibility: "public",
      parts: [],
      payload: {
        cardId: "c1",
        fromZoneId: "z1",
        toZoneId: "z2",
        cardName: "a card",
        forceHidden: true,
      },
    };

    const part: LogMessagePart = { kind: "card", cardId: "c1", text: "a card" };
    const cardContext = resolveLogCardContext(entry, logContext);
    const name = resolveLogCardDisplayName({ part, logContext, cardContext });

    expect(name).toBe("a card");
  });
});
