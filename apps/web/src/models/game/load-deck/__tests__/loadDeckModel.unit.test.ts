import { describe, expect, it } from "vitest";

import type { Zone } from "@/types";
import type { FetchScryfallResult, ParsedCard } from "@/services/deck-import/deckImport";
import { ZONE } from "@/constants/zones";

import { isMultiplayerProviderReady, planDeckImport, resolveDeckZoneIds } from "../loadDeckModel";

describe("loadDeckModel", () => {
  it("isMultiplayerProviderReady requires handles + connected provider", () => {
    expect(isMultiplayerProviderReady({ handles: null, provider: { wsconnected: true } })).toBe(
      false
    );
    expect(isMultiplayerProviderReady({ handles: {}, provider: null })).toBe(false);
    expect(isMultiplayerProviderReady({ handles: {}, provider: { wsconnected: true } })).toBe(true);
    expect(isMultiplayerProviderReady({ handles: {}, provider: { synced: true } })).toBe(true);
    expect(
      isMultiplayerProviderReady({ handles: {}, provider: { wsconnected: false, synced: false } })
    ).toBe(false);
  });

  it("resolveDeckZoneIds falls back when zones are missing", () => {
    expect(resolveDeckZoneIds({ zones: {}, playerId: "p1" })).toEqual({
      libraryZoneId: "p1-library",
      commanderZoneId: "p1-commander",
      sideboardZoneId: "p1-sideboard",
    });

    const zones: Record<string, Zone> = {
      lib: { id: "lib", type: ZONE.LIBRARY, ownerId: "p1", cardIds: [] },
      cmd: { id: "cmd", type: ZONE.COMMANDER, ownerId: "p1", cardIds: [] },
      sb: { id: "sb", type: ZONE.SIDEBOARD, ownerId: "p1", cardIds: [] },
    };

    expect(resolveDeckZoneIds({ zones, playerId: "p1" })).toEqual({
      libraryZoneId: "lib",
      commanderZoneId: "cmd",
      sideboardZoneId: "sb",
    });
  });

  it("planDeckImport chunks cards and sets library cards face-down", async () => {
    const parsed: ParsedCard[] = [
      { quantity: 1, name: "A", set: "set", collectorNumber: "1", section: "main" },
      { quantity: 1, name: "B", set: "set", collectorNumber: "2", section: "commander" },
      { quantity: 1, name: "C", set: "set", collectorNumber: "3", section: "sideboard" },
    ];

    const fetchResult: FetchScryfallResult = {
      cards: [
        { name: "A", section: "main" },
        { name: "B", section: "commander" },
        { name: "C", section: "sideboard" },
      ],
      missing: [],
      warnings: [],
      errors: [],
    };

    const zones: Record<string, Zone> = {
      lib: { id: "lib", type: ZONE.LIBRARY, ownerId: "p1", cardIds: [] },
      cmd: { id: "cmd", type: ZONE.COMMANDER, ownerId: "p1", cardIds: [] },
      sb: { id: "sb", type: ZONE.SIDEBOARD, ownerId: "p1", cardIds: [] },
    };

    const result = await planDeckImport({
      importText: "ignored",
      playerId: "p1",
      zones,
      chunkSize: 1,
      parseDeckList: () => parsed,
      validateDeckListLimits: () => ({ ok: true }),
      fetchScryfallCards: async () => fetchResult,
      validateImportResult: () => ({ ok: true, warnings: ["warn"] }),
    });

    expect(result.warnings).toEqual(["warn"]);
    expect(result.chunks).toHaveLength(3);

    expect(result.chunks[0]?.[0]?.zoneId).toBe("lib");
    expect(result.chunks[0]?.[0]?.cardData.faceDown).toBe(true);

    expect(result.chunks[1]?.[0]?.zoneId).toBe("cmd");
    expect(result.chunks[1]?.[0]?.cardData.faceDown).not.toBe(true);

    expect(result.chunks[2]?.[0]?.zoneId).toBe("sb");
    expect(result.chunks[2]?.[0]?.cardData.faceDown).not.toBe(true);
    expect(result.chunks[2]?.[0]?.cardData.deckSection).toBe("sideboard");
  });

  it("planDeckImport errors on empty parsed list", async () => {
    await expect(
      planDeckImport({
        importText: "",
        playerId: "p1",
        zones: {},
        parseDeckList: () => [],
        validateDeckListLimits: () => ({ ok: true }),
        fetchScryfallCards: async () => ({ cards: [], missing: [], warnings: [], errors: [] }),
        validateImportResult: () => ({ ok: true, warnings: [] }),
      })
    ).rejects.toThrow("No valid cards found in the list.");
  });

  it("planDeckImport errors when size validation fails", async () => {
    await expect(
      planDeckImport({
        importText: "ignored",
        playerId: "p1",
        zones: {},
        parseDeckList: () => [
          { quantity: 1, name: "A", set: "set", collectorNumber: "1", section: "main" },
        ],
        validateDeckListLimits: () => ({ ok: false, error: "Too many cards" }),
        fetchScryfallCards: async () => ({ cards: [], missing: [], warnings: [], errors: [] }),
        validateImportResult: () => ({ ok: true, warnings: [] }),
      })
    ).rejects.toThrow("Too many cards");
  });
});
