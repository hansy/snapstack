import { describe, expect, it } from "vitest";

import { buildSignalingUrlFromEnv } from "../wsSignaling";

describe("buildSignalingUrlFromEnv", () => {
  it("returns null when env url is missing", () => {
    expect(buildSignalingUrlFromEnv(undefined)).toBeNull();
  });

  it("converts http(s) to ws(s) and appends /signal", () => {
    expect(buildSignalingUrlFromEnv("http://localhost:8787")).toBe(
      "ws://localhost:8787/signal"
    );
    expect(buildSignalingUrlFromEnv("https://example.com")).toBe(
      "wss://example.com/signal"
    );
  });

  it("preserves existing ws urls and trims trailing slashes", () => {
    expect(buildSignalingUrlFromEnv("wss://example.com/signal/")).toBe(
      "wss://example.com/signal"
    );
    expect(buildSignalingUrlFromEnv("ws://example.com/signal")).toBe(
      "ws://example.com/signal"
    );
  });
});

