import { describe, expect, it } from "vitest";

import type { LogContext, LogEventDefinition } from "../types";
import type { DrawPayload } from "../eventRegistry/libraryEvents";

import { buildLogEntry, computeAggregatedLogEntryUpdate } from "../logEntryModel";

describe("logEntryModel", () => {
  const ctx: LogContext = { players: {}, cards: {}, zones: {} } as any;

  const def: LogEventDefinition<DrawPayload> = {
    format: (payload) => [{ kind: "text", text: String(payload.count ?? 1) }],
    aggregate: {
      key: () => "k",
      mergePayload: (existing, incoming) => ({
        ...incoming,
        count: (existing.count ?? 1) + (incoming.count ?? 1),
      }),
      windowMs: 2000,
    },
  };

  it("buildLogEntry creates a stable shape and formats parts", () => {
    const entry = buildLogEntry({
      eventId: "card.draw",
      def,
      payload: { playerId: "p1", count: 2, actorId: "p1" },
      ctx,
      aggregateKey: "k",
      timestamp: 123,
      sourceClientId: 7,
      createId: () => "id1",
    });

    expect(entry.id).toBe("id1");
    expect(entry.ts).toBe(123);
    expect(entry.eventId).toBe("card.draw");
    expect(entry.actorId).toBe("p1");
    expect(entry.visibility).toBe("public");
    expect(entry.aggregateKey).toBe("k");
    expect(entry.sourceClientId).toBe(7);
    expect(entry.parts.map((p) => p.text)).toEqual(["2"]);
  });

  it("appends when there is no last entry", () => {
    const update = computeAggregatedLogEntryUpdate({
      eventId: "card.draw",
      def,
      payload: { playerId: "p1", count: 1 },
      ctx,
      aggregateKey: "k",
      lastEntry: undefined,
      timestamp: 1000,
      createId: () => "new1",
    });

    expect(update.kind).toBe("append");
    expect(update.entry.id).toBe("new1");
    expect(update.entry.parts.map((p) => p.text)).toEqual(["1"]);
  });

  it("replaces the last entry when within the aggregation window", () => {
    const last = buildLogEntry({
      eventId: "card.draw",
      def,
      payload: { playerId: "p1", count: 1 },
      ctx,
      aggregateKey: "k",
      existingId: "e1",
      timestamp: 1000,
      createId: () => "ignored",
    });

    const update = computeAggregatedLogEntryUpdate({
      eventId: "card.draw",
      def,
      payload: { playerId: "p1", count: 2 },
      ctx,
      aggregateKey: "k",
      lastEntry: last,
      timestamp: 1500,
      createId: () => "new1",
    });

    expect(update.kind).toBe("replaceLast");
    expect(update.entry.id).toBe("e1");
    expect(update.entry.ts).toBe(1500);
    expect(update.entry.payload?.count).toBe(3);
    expect(update.entry.parts.map((p) => p.text)).toEqual(["3"]);
  });

  it("appends a new entry when outside the aggregation window", () => {
    const last = buildLogEntry({
      eventId: "card.draw",
      def,
      payload: { playerId: "p1", count: 1 },
      ctx,
      aggregateKey: "k",
      existingId: "e1",
      timestamp: 1000,
      createId: () => "ignored",
    });

    const update = computeAggregatedLogEntryUpdate({
      eventId: "card.draw",
      def,
      payload: { playerId: "p1", count: 2 },
      ctx,
      aggregateKey: "k",
      lastEntry: last,
      timestamp: 4000,
      createId: () => "new1",
    });

    expect(update.kind).toBe("append");
    expect(update.entry.id).toBe("new1");
    expect(update.entry.payload?.count).toBe(2);
    expect(update.entry.parts.map((p) => p.text)).toEqual(["2"]);
  });

  it("does not aggregate when the aggregate key is missing", () => {
    const last = buildLogEntry({
      eventId: "card.draw",
      def,
      payload: { playerId: "p1", count: 1 },
      ctx,
      aggregateKey: "k",
      existingId: "e1",
      timestamp: 1000,
      createId: () => "ignored",
    });

    const update = computeAggregatedLogEntryUpdate({
      eventId: "card.draw",
      def,
      payload: { playerId: "p1", count: 2 },
      ctx,
      aggregateKey: undefined,
      lastEntry: last,
      timestamp: 1500,
      createId: () => "new1",
    });

    expect(update.kind).toBe("append");
    expect(update.entry.id).toBe("new1");
    expect(update.entry.payload?.count).toBe(2);
  });
});
