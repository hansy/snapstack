import { describe, expect, it, vi } from "vitest";

import { parseConnectionParams, resolveConnectionAuth } from "../auth";

const tokens = { playerToken: "player-token", spectatorToken: "spectator-token" };

describe("connection auth helpers", () => {
  it("parses spectator tokens as spectator role", () => {
    const url = new URL(
      "https://example.test/?playerId=p1&st=spectator-token&viewerRole=player"
    );

    expect(parseConnectionParams(url)).toEqual({
      playerId: "p1",
      viewerRole: "spectator",
      token: "spectator-token",
    });
  });

  it("honors spectator role even with a player token", () => {
    const url = new URL(
      "https://example.test/?playerId=p1&gt=player-token&viewerRole=spectator"
    );

    expect(parseConnectionParams(url)).toEqual({
      playerId: "p1",
      viewerRole: "spectator",
      token: "player-token",
    });
  });

  it("rejects missing token when stored tokens exist", async () => {
    const ensureTokens = vi.fn(async () => tokens);
    const result = await resolveConnectionAuth(
      { playerId: "p1", viewerRole: "player" },
      tokens,
      ensureTokens,
      { allowTokenCreation: true }
    );

    expect(result).toEqual({ ok: false, reason: "missing token" });
    expect(ensureTokens).not.toHaveBeenCalled();
  });

  it("rejects spectator without a token when none exist", async () => {
    const ensureTokens = vi.fn(async () => tokens);
    const result = await resolveConnectionAuth(
      { playerId: "p1", viewerRole: "spectator" },
      null,
      ensureTokens,
      { allowTokenCreation: true }
    );

    expect(result).toEqual({ ok: false, reason: "missing token" });
  });

  it("rejects missing player when no token is provided", async () => {
    const ensureTokens = vi.fn(async () => tokens);
    const result = await resolveConnectionAuth(
      { viewerRole: "player" },
      null,
      ensureTokens,
      { allowTokenCreation: false }
    );

    expect(result).toEqual({ ok: false, reason: "missing player" });
  });

  it("allows player without token when creation is disabled", async () => {
    const ensureTokens = vi.fn(async () => tokens);
    const result = await resolveConnectionAuth(
      { playerId: "p1", viewerRole: "player" },
      null,
      ensureTokens,
      { allowTokenCreation: false }
    );

    expect(result).toEqual({
      ok: true,
      resolvedRole: "player",
      playerId: "p1",
      token: undefined,
      tokens: null,
    });
    expect(ensureTokens).not.toHaveBeenCalled();
  });

  it("creates tokens for a new player when allowed", async () => {
    const ensureTokens = vi.fn(async () => tokens);
    const result = await resolveConnectionAuth(
      { playerId: "p1", viewerRole: "player" },
      null,
      ensureTokens,
      { allowTokenCreation: true }
    );

    expect(result).toEqual({
      ok: true,
      resolvedRole: "player",
      playerId: "p1",
      token: "player-token",
      tokens,
    });
    expect(ensureTokens).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid tokens", async () => {
    const ensureTokens = vi.fn(async () => tokens);
    const result = await resolveConnectionAuth(
      { playerId: "p1", viewerRole: "player", token: "bad-token" },
      null,
      ensureTokens,
      { allowTokenCreation: false }
    );

    expect(result).toEqual({ ok: false, reason: "invalid token" });
  });

  it("resolves spectators from spectator tokens", async () => {
    const ensureTokens = vi.fn(async () => tokens);
    const result = await resolveConnectionAuth(
      { playerId: "p1", viewerRole: "player", token: "spectator-token" },
      tokens,
      ensureTokens,
      { allowTokenCreation: false }
    );

    expect(result).toEqual({
      ok: true,
      resolvedRole: "spectator",
      playerId: undefined,
      token: "spectator-token",
      tokens,
    });
  });

  it("honors spectator request with player token", async () => {
    const ensureTokens = vi.fn(async () => tokens);
    const result = await resolveConnectionAuth(
      { playerId: "p1", viewerRole: "spectator", token: "player-token" },
      tokens,
      ensureTokens,
      { allowTokenCreation: false }
    );

    expect(result).toEqual({
      ok: true,
      resolvedRole: "spectator",
      playerId: undefined,
      token: "player-token",
      tokens,
    });
  });

  it("rejects missing player when resolving a player role", async () => {
    const ensureTokens = vi.fn(async () => tokens);
    const result = await resolveConnectionAuth(
      { viewerRole: "player", token: "player-token" },
      tokens,
      ensureTokens,
      { allowTokenCreation: false }
    );

    expect(result).toEqual({ ok: false, reason: "missing player" });
  });
});
