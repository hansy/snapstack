import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSize = vi.hoisted(() => ({ width: 1000, height: 800 }));
const mockRef = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/shared/useElementSize", () => ({
  useElementSize: () => ({ ref: mockRef, size: mockSize }),
}));

import {
  computeSeatSizing,
  useSeatSizing,
  getLgMediaQuery,
  PREVIEW_MAX_WIDTH_PX,
  PREVIEW_MIN_WIDTH_PX,
  PREVIEW_SCALE_K,
} from "../useSeatSizing";

const setMatchMedia = (matches: boolean) => {
  const lgQuery = getLgMediaQuery();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === lgQuery ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

describe("computeSeatSizing", () => {
  it("derives base sizing from seat height", () => {
    const result = computeSeatSizing({ seatWidth: 1000, seatHeight: 800 });

    expect(result.handHeightPx).toBeCloseTo(200);
    expect(result.battlefieldHeightPx).toBeCloseTo(600);
    expect(result.baseCardHeightPx).toBeCloseTo(150);
    expect(result.baseCardWidthPx).toBeCloseTo(100);
    expect(result.previewWidthPx).toBe(PREVIEW_MIN_WIDTH_PX);
    expect(result.previewHeightPx).toBeCloseTo(300);
  });

  it("clamps hand height overrides to min/max", () => {
    const result = computeSeatSizing({
      seatWidth: 1000,
      seatHeight: 800,
      handHeightOverridePx: 50,
    });

    expect(result.handHeightPx).toBeCloseTo(120);
  });

  it("clamps preview width to the max bound", () => {
    const result = computeSeatSizing({
      seatWidth: 1600,
      seatHeight: 2000,
      previewScale: PREVIEW_SCALE_K,
      previewMinWidthPx: PREVIEW_MIN_WIDTH_PX,
      previewMaxWidthPx: PREVIEW_MAX_WIDTH_PX,
    });

    expect(result.previewWidthPx).toBe(PREVIEW_MAX_WIDTH_PX);
  });
});

describe("useSeatSizing", () => {
  beforeEach(() => {
    document.documentElement.style.setProperty("--breakpoint-lg", "1024px");
    setMatchMedia(true);
  });

  it("returns null sizing when not in lg", () => {
    setMatchMedia(false);
    const { result } = renderHook(() => useSeatSizing());
    expect(result.current.sizing).toBeNull();
    expect(result.current.cssVars).toBeUndefined();
  });

  it("returns sizing and css vars for lg", () => {
    const { result } = renderHook(() => useSeatSizing());
    expect(result.current.sizing).not.toBeNull();
    expect(result.current.cssVars).toBeDefined();
    const cssVars = result.current.cssVars as Record<string, string> | undefined;
    expect(cssVars?.["--card-h"]).toBeDefined();
    expect(cssVars?.["--preview-w"]).toBeDefined();
    expect(cssVars?.["--preview-h"]).toBeDefined();
  });
});
