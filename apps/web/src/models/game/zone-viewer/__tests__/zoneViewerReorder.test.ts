import { describe, expect, it } from "vitest";

import { mergeZoneCardOrder, reorderZoneViewerList } from "../zoneViewerReorder";

describe("zoneViewerReorder", () => {
  describe("reorderZoneViewerList", () => {
    it("moves the dragged id to the target index", () => {
      expect(reorderZoneViewerList(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
      expect(reorderZoneViewerList(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    });

    it("returns original ids when from/to missing", () => {
      const ids = ["a", "b"];
      expect(reorderZoneViewerList(ids, "x", "b")).toBe(ids);
      expect(reorderZoneViewerList(ids, "a", "x")).toBe(ids);
    });
  });

  describe("mergeZoneCardOrder", () => {
    it("keeps non-reordered cards in place and appends reordered cards", () => {
      expect(
        mergeZoneCardOrder({
          zoneCardIds: ["b0", "b1", "t0", "t1"],
          reorderedIds: ["t1", "t0"],
        })
      ).toEqual(["b0", "b1", "t1", "t0"]);
    });

    it("ignores reordered ids not present in the zone", () => {
      expect(
        mergeZoneCardOrder({
          zoneCardIds: ["a", "b", "c"],
          reorderedIds: ["c", "x", "b"],
        })
      ).toEqual(["a", "c", "b"]);
    });

    it("deduplicates reordered ids", () => {
      expect(
        mergeZoneCardOrder({
          zoneCardIds: ["a", "b", "c"],
          reorderedIds: ["c", "c", "b", "b"],
        })
      ).toEqual(["a", "c", "b"]);
    });
  });
});

