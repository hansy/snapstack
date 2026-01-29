import { beforeAll, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  createJoinToken,
  verifyJoinToken,
} from "@mtg/shared/security/joinToken";

const ensureWebCrypto = () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto });
  }
};

const ensureBase64 = () => {
  if (typeof globalThis.btoa !== "function") {
    globalThis.btoa = (input: string) =>
      Buffer.from(input, "binary").toString("base64");
  }
  if (typeof globalThis.atob !== "function") {
    globalThis.atob = (input: string) =>
      Buffer.from(input, "base64").toString("binary");
  }
};

beforeAll(() => {
  ensureWebCrypto();
  ensureBase64();
});

describe("join tokens", () => {
  it("creates and verifies a valid token", async () => {
    const secret = "test-secret";
    const exp = Date.now() + 60_000;
    const token = await createJoinToken({ roomId: "room-123", exp }, secret);
    const result = await verifyJoinToken(token, secret, { now: exp - 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.roomId).toBe("room-123");
      expect(result.payload.exp).toBe(exp);
    }
  });

  it("rejects expired tokens", async () => {
    const secret = "test-secret";
    const exp = Date.now() - 10_000;
    const token = await createJoinToken({ roomId: "room-xyz", exp }, secret);
    const result = await verifyJoinToken(token, secret, { now: Date.now() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("token expired");
    }
  });

  it("rejects tampered tokens", async () => {
    const secret = "test-secret";
    const exp = Date.now() + 60_000;
    const token = await createJoinToken({ roomId: "room-xyz", exp }, secret);
    const [payload, signature] = token.split(".");
    const lastChar = signature.slice(-1);
    const replacement = lastChar === "a" ? "b" : "a";
    const tampered = `${payload}.${signature.slice(0, -1)}${replacement}`;
    const result = await verifyJoinToken(tampered, secret, { now: Date.now() });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid formats", async () => {
    const result = await verifyJoinToken("nope", "secret");
    expect(result.ok).toBe(false);
  });
});
