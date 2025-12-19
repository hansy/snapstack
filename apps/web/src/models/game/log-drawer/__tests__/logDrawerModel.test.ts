import { describe, expect, it } from "vitest";

import { computeVisibleCardName, formatTimeAgo, getBorderColorClass, isPublicZoneType } from "../logDrawerModel";

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
});

