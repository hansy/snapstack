import { describe, expect, it } from "vitest";

import { getRoomFromUrl, normalizePathname } from "../request";

const ROOM_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_ROOM_ID = "123e4567-e89b-42d3-a456-426614174001";

const makeUrl = (path: string, query?: string) =>
  new URL(`https://example.test${path}${query ? `?${query}` : ""}`);

describe("normalizePathname", () => {
  it("trims trailing slashes", () => {
    expect(normalizePathname("/signal/")).toBe("/signal");
    expect(normalizePathname("/signal///")).toBe("/signal");
  });

  it("returns empty string for root", () => {
    expect(normalizePathname("/")).toBe("");
  });
});

describe("getRoomFromUrl", () => {
  it("prefers the path room when present", () => {
    const url = makeUrl(`/signal/${ROOM_ID}`, `room=${OTHER_ROOM_ID}`);
    expect(getRoomFromUrl(url)).toBe(ROOM_ID);
  });

  it("falls back to query parameter when path has no room", () => {
    const url = makeUrl("/signal", `room=${ROOM_ID}`);
    expect(getRoomFromUrl(url)).toBe(ROOM_ID);
  });

  it("handles trailing slashes on the signal path", () => {
    const url = makeUrl("/signal/", `room=${ROOM_ID}`);
    expect(getRoomFromUrl(url)).toBe(ROOM_ID);
  });

  it("does not treat /signalx as a room path", () => {
    const url = makeUrl("/signalx", `room=${ROOM_ID}`);
    expect(getRoomFromUrl(url)).toBe(ROOM_ID);
  });

  it("returns null when no room is provided", () => {
    const url = makeUrl("/signal");
    expect(getRoomFromUrl(url)).toBeNull();
  });
});
