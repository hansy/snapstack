import { describe, expect, it } from "vitest";

import { resolvePartyKitHost } from "../partyKitHost";

describe("resolvePartyKitHost", () => {
  it("returns null when host is missing or blank", () => {
    expect(resolvePartyKitHost(undefined)).toBeNull();
    expect(resolvePartyKitHost("")).toBeNull();
    expect(resolvePartyKitHost("   ")).toBeNull();
  });

  it("strips protocol and path segments", () => {
    expect(resolvePartyKitHost("https://example.com/parties/main"))
      .toBe("example.com");
    expect(resolvePartyKitHost("http://localhost:1999")).toBe("localhost:1999");
    expect(resolvePartyKitHost("wss://example.com/"))
      .toBe("example.com");
  });

  it("keeps host-only values and trims trailing slashes", () => {
    expect(resolvePartyKitHost("localhost:1999"))
      .toBe("localhost:1999");
    expect(resolvePartyKitHost("localhost:1999/"))
      .toBe("localhost:1999");
    expect(resolvePartyKitHost("example.com/path"))
      .toBe("example.com");
  });
});
