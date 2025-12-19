import { describe, expect, it } from "vitest";

import { computeCardPreviewPosition } from "../cardPreviewPosition";

describe("computeCardPreviewPosition", () => {
  it("positions above the anchor by default", () => {
    const { top, left } = computeCardPreviewPosition({
      anchorRect: { top: 400, left: 100, bottom: 440, width: 80, height: 40 },
      previewWidth: 200,
      previewHeight: 280,
      viewportWidth: 1200,
      viewportHeight: 800,
      gapPx: 18,
    });

    expect(top).toBe(400 - 280 - 18);
    expect(left).toBe(100 + 40 - 100);
  });

  it("falls back below when there is no space above", () => {
    const { top } = computeCardPreviewPosition({
      anchorRect: { top: 10, left: 100, bottom: 50, width: 80, height: 40 },
      previewWidth: 200,
      previewHeight: 280,
      viewportWidth: 1200,
      viewportHeight: 800,
      gapPx: 18,
    });

    expect(top).toBe(50 + 18);
  });

  it("clamps left within the viewport", () => {
    const { left } = computeCardPreviewPosition({
      anchorRect: { top: 300, left: 0, bottom: 340, width: 10, height: 40 },
      previewWidth: 200,
      previewHeight: 280,
      viewportWidth: 220,
      viewportHeight: 800,
      gapPx: 18,
    });

    // left would be negative without clamping; ensure it clamps to the gap.
    expect(left).toBe(18);
  });
});
