import { describe, expect, it } from "vitest";

import { INTENT_TYPES } from "../intentTypes";
import { intentHandlers } from "../handlers";

describe("intent handler registry", () => {
  it("matches the known intent types", () => {
    const handlerTypes = Object.keys(intentHandlers).sort();
    const expected = [...INTENT_TYPES].sort();
    expect(handlerTypes).toEqual(expected);
  });
});
