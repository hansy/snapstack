import { buildCardPart, buildPlayerPart } from "../helpers";
import type { LogEventDefinition, LogEventId } from "@/logging/types";

type CounterPayload = {
  cardId: string;
  zoneId: string;
  actorId?: string;
  counterType: string;
  delta: number;
  newTotal: number;
  cardName?: string;
};

type GlobalCounterPayload = { counterType: string; color?: string; actorId?: string };

const formatCounterAdd: LogEventDefinition<CounterPayload>["format"] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone, payload.cardName);
  return [
    actor,
    {
      kind: "text",
      text: ` added ${payload.delta} ${payload.counterType} counter${payload.delta === 1 ? "" : "s"} to `,
    },
    cardPart,
    { kind: "text", text: ` (now ${payload.newTotal})` },
  ];
};

const formatCounterRemove: LogEventDefinition<CounterPayload>["format"] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone, payload.cardName);
  const absDelta = Math.abs(payload.delta);
  return [
    actor,
    {
      kind: "text",
      text: ` removed ${absDelta} ${payload.counterType} counter${absDelta === 1 ? "" : "s"} from `,
    },
    cardPart,
    { kind: "text", text: ` (now ${payload.newTotal})` },
  ];
};

const formatGlobalCounterAdd: LogEventDefinition<GlobalCounterPayload>["format"] = (payload, _ctx) => {
  const colorSuffix = payload.color ? ` (${payload.color})` : "";
  return [{ kind: "text", text: `Added global counter type ${payload.counterType}${colorSuffix}` }];
};

export const counterEvents = {
  "counter.add": {
    format: formatCounterAdd,
  },
  "counter.remove": {
    format: formatCounterRemove,
  },
  "counter.global.add": {
    format: formatGlobalCounterAdd,
  },
} satisfies Partial<Record<LogEventId, LogEventDefinition<any>>>;

