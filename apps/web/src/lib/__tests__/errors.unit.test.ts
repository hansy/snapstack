import { describe, expect, it } from "vitest";

import { isAbortError } from "../errors";

describe("isAbortError", () => {
  it("returns true for an Error named AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });

  it("returns true for a plain object with name AbortError", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isAbortError(new Error("nope"))).toBe(false);
  });
});

