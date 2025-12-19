import { buildPlayerPart } from "../helpers";
import type { LogEventDefinition, LogEventId } from "@/logging/types";

type DiceRollPayload = {
  actorId?: string;
  sides: number;
  count: number;
  results: number[];
};

const formatDiceRoll: LogEventDefinition<DiceRollPayload>["format"] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.actorId);
  const dieLabel = payload.count === 1 ? "die" : "dice";
  const resultsText =
    payload.count === 1
      ? `${payload.results[0] ?? ""}`
      : `[${payload.results.join(", ")}]`;

  return [
    player,
    { kind: "text", text: ` rolled ${payload.count} ${payload.sides}-sided ${dieLabel}: ` },
    { kind: "value", text: resultsText },
  ];
};

export const diceEvents = {
  "dice.roll": {
    format: formatDiceRoll,
  },
} satisfies Partial<Record<LogEventId, LogEventDefinition<any>>>;
