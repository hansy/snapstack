import { describe, expect, it } from "vitest";

import { isValidHandshake, parseHandshakeParams } from "../handshake";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const CLIENT_KEY = "123e4567-e89b-42d3-a456-426614174001";

describe("parseHandshakeParams", () => {
  it("defaults missing values to empty strings and NaN", () => {
    const parsed = parseHandshakeParams(new URLSearchParams());
    expect(parsed.userId).toBe("");
    expect(parsed.clientKey).toBe("");
    expect(Number.isNaN(parsed.sessionVersion)).toBe(true);
  });

  it("parses the sessionVersion as an integer", () => {
    const parsed = parseHandshakeParams(
      new URLSearchParams({
        userId: USER_ID,
        clientKey: CLIENT_KEY,
        sessionVersion: "12",
      })
    );
    expect(parsed.sessionVersion).toBe(12);
  });
});

describe("isValidHandshake", () => {
  it("accepts valid UUIDs and non-negative session versions", () => {
    const parsed = parseHandshakeParams(
      new URLSearchParams({
        userId: USER_ID,
        clientKey: CLIENT_KEY,
        sessionVersion: "0",
      })
    );
    expect(isValidHandshake(parsed)).toBe(true);
  });

  it("rejects invalid UUIDs or session versions", () => {
    const parsed = parseHandshakeParams(
      new URLSearchParams({
        userId: "not-a-uuid",
        clientKey: CLIENT_KEY,
        sessionVersion: "-1",
      })
    );
    expect(isValidHandshake(parsed)).toBe(false);
  });
});
