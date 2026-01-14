import { buildPlayerPart } from "../helpers";
import type { LogEventDefinition, LogEventId } from "@/logging/types";

export type CoinFlipPayload = {
  actorId?: string;
  count: number;
  results: ("heads" | "tails")[];
};

const formatCoinFlip: LogEventDefinition<CoinFlipPayload>["format"] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.actorId);
  const coinLabel = payload.count === 1 ? "coin" : "coins";
  const resultsText =
    payload.count === 1
      ? `${payload.results[0] ?? ""}`
      : `[${payload.results.join(", ")}]`;

  return [
    player,
    { kind: "text", text: ` flipped ${payload.count} ${coinLabel}: ` },
    { kind: "value", text: resultsText },
  ];
};

export const coinEvents = {
  "coin.flip": {
    format: formatCoinFlip,
  },
} satisfies Partial<Record<LogEventId, LogEventDefinition<any>>>;
