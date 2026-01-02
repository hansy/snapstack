import { buildPlayerPart } from "../helpers";
import type { LogEventDefinition, LogEventId } from "@/logging/types";

import { DEFAULT_AGGREGATE_WINDOW_MS } from "./constants";

type DrawPayload = { playerId: string; actorId?: string; count?: number };
type DiscardPayload = { playerId: string; actorId?: string; count?: number };
type ShufflePayload = { playerId: string; actorId?: string };

const formatDraw: LogEventDefinition<DrawPayload>["format"] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  const count = payload.count || 1;
  const cardText = `drew ${count} card${count === 1 ? "" : "s"}`;
  return [player, { kind: "text", text: ` ${cardText}` }];
};

const formatDiscard: LogEventDefinition<DiscardPayload>["format"] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  const count = payload.count || 1;
  const cardText = `discarded ${count} card${count === 1 ? "" : "s"} from Library`;
  return [player, { kind: "text", text: ` ${cardText}` }];
};

const formatShuffle: LogEventDefinition<ShufflePayload>["format"] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  return [player, { kind: "text", text: " shuffled Library" }];
};

export const libraryEvents = {
  "library.shuffle": {
    format: formatShuffle,
  },
  "card.draw": {
    format: formatDraw,
    aggregate: {
      key: (payload: DrawPayload) => `draw:${payload.playerId}`,
      mergePayload: (existing: DrawPayload, incoming: DrawPayload) => {
        const existingCount = existing.count || 1;
        const incomingCount = incoming.count || 1;
        return {
          ...incoming,
          count: existingCount + incomingCount,
        };
      },
      windowMs: DEFAULT_AGGREGATE_WINDOW_MS,
    },
  },
  "card.discard": {
    format: formatDiscard,
    aggregate: {
      key: (payload: DiscardPayload) => `discard:${payload.playerId}`,
      mergePayload: (existing: DiscardPayload, incoming: DiscardPayload) => {
        const existingCount = existing.count || 1;
        const incomingCount = incoming.count || 1;
        return {
          ...incoming,
          count: existingCount + incomingCount,
        };
      },
      windowMs: DEFAULT_AGGREGATE_WINDOW_MS,
    },
  },
} satisfies Partial<Record<LogEventId, LogEventDefinition<any>>>;
