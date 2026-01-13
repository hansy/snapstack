import { buildCardPart, buildPlayerPart, getZoneLabel } from "../helpers";
import type { LogEventDefinition, LogEventId } from "@/logging/types";

export type MovePayload = {
  cardId: string;
  fromZoneId: string;
  toZoneId: string;
  actorId?: string;
  gainsControlBy?: string;
  cardName?: string;
  fromZoneType?: string;
  toZoneType?: string;
  faceDown?: boolean;
  forceHidden?: boolean;
};

export type TapPayload = {
  cardId: string;
  zoneId: string;
  actorId?: string;
  tapped: boolean;
  cardName?: string;
};

export type UntapAllPayload = { playerId: string; actorId?: string };

export type TransformPayload = {
  cardId: string;
  zoneId: string;
  actorId?: string;
  toFaceName?: string;
  cardName?: string;
};

export type DuplicatePayload = {
  sourceCardId: string;
  newCardId: string;
  zoneId: string;
  actorId?: string;
  cardName?: string;
};

export type RemoveCardPayload = { cardId: string; zoneId: string; actorId?: string; cardName?: string };

export type PTPayload = {
  cardId: string;
  zoneId: string;
  actorId?: string;
  fromPower?: string;
  fromToughness?: string;
  toPower?: string;
  toToughness?: string;
  cardName?: string;
};

export type TokenCreatePayload = {
  playerId: string;
  actorId?: string;
  tokenName: string;
  count?: number;
};

const formatMove: LogEventDefinition<MovePayload>["format"] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const fromZone = ctx.zones[payload.fromZoneId];
  const toZone = ctx.zones[payload.toZoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, fromZone, toZone, payload.cardName);

  const fromLabel = getZoneLabel(ctx, payload.fromZoneId);
  const toLabel = getZoneLabel(ctx, payload.toZoneId);

  if (payload.gainsControlBy && toZone?.type === "battlefield") {
    const controller = buildPlayerPart(ctx, payload.gainsControlBy);
    return [controller, { kind: "text", text: " gains control of " }, cardPart];
  }

  // Within the same zone: treat as a reorder/move inside the zone
  if (payload.fromZoneId === payload.toZoneId) {
    return [
      actor,
      { kind: "text", text: " moved " },
      cardPart,
      { kind: "text", text: ` within ${toLabel}` },
    ];
  }

  if (toZone?.type === "battlefield") {
    return [actor, { kind: "text", text: " played " }, cardPart, { kind: "text", text: ` from ${fromLabel}` }];
  }

  if (toZone?.type === "exile") {
    return [actor, { kind: "text", text: " exiled " }, cardPart, { kind: "text", text: ` from ${fromLabel}` }];
  }

  if (toZone?.type === "graveyard") {
    return [
      actor,
      { kind: "text", text: " sent " },
      cardPart,
      { kind: "text", text: ` from ${fromLabel} to ${toLabel}` },
    ];
  }

  if (toZone?.type === "commander") {
    return [
      actor,
      { kind: "text", text: " returned commander " },
      cardPart,
      { kind: "text", text: ` from ${fromLabel}` },
    ];
  }

  return [
    actor,
    { kind: "text", text: " moved " },
    cardPart,
    { kind: "text", text: ` from ${fromLabel} to ${toLabel}` },
  ];
};

const formatTap: LogEventDefinition<TapPayload>["format"] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const card = buildCardPart(ctx, payload.cardId, zone, zone, payload.cardName);
  const verb = payload.tapped ? "tapped" : "untapped";
  return [actor, { kind: "text", text: ` ${verb} ` }, card];
};

const formatUntapAll: LogEventDefinition<UntapAllPayload>["format"] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  return [player, { kind: "text", text: " untapped all permanents" }];
};

const formatTransform: LogEventDefinition<TransformPayload>["format"] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone, payload.cardName);
  const includeFace = cardPart.text !== "a card" && payload.toFaceName;
  return [
    actor,
    { kind: "text" as const, text: " transformed " },
    cardPart,
    ...(includeFace ? [{ kind: "text" as const, text: ` to ${payload.toFaceName}` }] : []),
  ];
};

const formatDuplicate: LogEventDefinition<DuplicatePayload>["format"] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.sourceCardId, zone, zone, payload.cardName);
  return [actor, { kind: "text", text: " created a token copy of " }, cardPart];
};

const formatRemove: LogEventDefinition<RemoveCardPayload>["format"] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone, payload.cardName);
  return [actor, { kind: "text", text: " removed " }, cardPart];
};

const formatPT: LogEventDefinition<PTPayload>["format"] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone, payload.cardName);
  const from = `${payload.fromPower ?? "?"} / ${payload.fromToughness ?? "?"}`;
  const to = `${payload.toPower ?? "?"} / ${payload.toToughness ?? "?"}`;
  return [actor, { kind: "text", text: " set " }, cardPart, { kind: "text", text: ` P/T to ${to} (was ${from})` }];
};

const formatTokenCreate: LogEventDefinition<TokenCreatePayload>["format"] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  const count = payload.count ?? 1;
  const tokenName = payload.tokenName?.trim() || "Token";
  const suffix = count === 1 ? "" : "s";
  return [player, { kind: "text", text: ` created ${count} ${tokenName} token${suffix}` }];
};

export const cardEvents = {
  "card.move": {
    format: formatMove,
  },
  "card.tap": {
    format: formatTap,
  },
  "card.untapAll": {
    format: formatUntapAll,
  },
  "card.transform": {
    format: formatTransform,
  },
  "card.duplicate": {
    format: formatDuplicate,
  },
  "card.remove": {
    format: formatRemove,
  },
  "card.pt": {
    format: formatPT,
  },
  "card.tokenCreate": {
    format: formatTokenCreate,
  },
} satisfies Partial<Record<LogEventId, LogEventDefinition<any>>>;
