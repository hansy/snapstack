import { buildPlayerPart } from "../helpers";
import type { LogEventDefinition, LogEventId } from "@/logging/types";

import { DEFAULT_AGGREGATE_WINDOW_MS } from "./constants";

type LifePayload = {
  playerId: string;
  actorId?: string;
  from: number;
  to: number;
  delta?: number;
};

type CommanderTaxPayload = {
  playerId: string;
  actorId?: string;
  from: number;
  to: number;
  delta?: number;
};

const formatLife: LogEventDefinition<LifePayload>["format"] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  const delta = typeof payload.delta === "number" ? payload.delta : payload.to - payload.from;
  const signed = delta >= 0 ? `+${delta}` : `${delta}`;
  return [player, { kind: "text", text: ` life ${signed} (${payload.from} -> ${payload.to})` }];
};

const formatCommanderTax: LogEventDefinition<CommanderTaxPayload>["format"] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  const delta = typeof payload.delta === "number" ? payload.delta : payload.to - payload.from;
  const signed = delta >= 0 ? `+${delta}` : `${delta}`;
  return [
    player,
    { kind: "text", text: ` commander tax ${signed} (${payload.from} -> ${payload.to})` },
  ];
};

export const playerEvents = {
  "player.life": {
    format: formatLife,
    aggregate: {
      key: (payload: LifePayload) => `life:${payload.playerId}`,
      mergePayload: (existing: LifePayload, incoming: LifePayload) => {
        const existingDelta =
          typeof existing.delta === "number" ? existing.delta : existing.to - existing.from;
        const nextDelta =
          typeof incoming.delta === "number" ? incoming.delta : incoming.to - incoming.from;
        const totalDelta = existingDelta + nextDelta;
        return {
          ...incoming,
          from: existing.from,
          to: existing.from + totalDelta,
          delta: totalDelta,
        };
      },
      windowMs: DEFAULT_AGGREGATE_WINDOW_MS,
    },
  },
  "player.commanderTax": {
    format: formatCommanderTax,
  },
} satisfies Partial<Record<LogEventId, LogEventDefinition<any>>>;

