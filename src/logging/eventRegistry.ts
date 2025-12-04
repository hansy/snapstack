import { buildCardPart, buildPlayerPart, getZoneLabel } from './helpers';
import { LogEventDefinition, LogEventId } from './types';

const DEFAULT_AGGREGATE_WINDOW_MS = 2000;

type LifePayload = { playerId: string; actorId?: string; from: number; to: number; delta?: number };
type CommanderTaxPayload = { playerId: string; actorId?: string; from: number; to: number; delta?: number };
type DrawPayload = { playerId: string; actorId?: string; count?: number };
type ShufflePayload = { playerId: string; actorId?: string };
type DeckPayload = { playerId: string; actorId?: string };
type MovePayload = {
  cardId: string;
  fromZoneId: string;
  toZoneId: string;
  actorId?: string;
  gainsControlBy?: string;
  cardName?: string;
  fromZoneType?: string;
  toZoneType?: string;
};
type TapPayload = { cardId: string; zoneId: string; actorId?: string; tapped: boolean };
type UntapAllPayload = { playerId: string; actorId?: string };
type TransformPayload = { cardId: string; zoneId: string; actorId?: string; toFaceName?: string };
type DuplicatePayload = { sourceCardId: string; newCardId: string; zoneId: string; actorId?: string };
type RemoveCardPayload = { cardId: string; zoneId: string; actorId?: string };
type PTPayload = { cardId: string; zoneId: string; actorId?: string; fromPower?: string; fromToughness?: string; toPower?: string; toToughness?: string };
type CounterPayload = { cardId: string; zoneId: string; actorId?: string; counterType: string; delta: number; newTotal: number };
type GlobalCounterPayload = { counterType: string; color?: string; actorId?: string };

const formatLife: LogEventDefinition<LifePayload>['format'] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  const delta = typeof payload.delta === 'number' ? payload.delta : payload.to - payload.from;
  const signed = delta >= 0 ? `+${delta}` : `${delta}`;
  return [
    player,
    { kind: 'text', text: ` life ${signed} (${payload.from} -> ${payload.to})` },
  ];
};

const formatCommanderTax: LogEventDefinition<CommanderTaxPayload>['format'] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  const delta = typeof payload.delta === 'number' ? payload.delta : payload.to - payload.from;
  const signed = delta >= 0 ? `+${delta}` : `${delta}`;
  return [
    player,
    { kind: 'text', text: ` commander tax ${signed} (${payload.from} -> ${payload.to})` },
  ];
};

const formatDraw: LogEventDefinition<DrawPayload>['format'] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  const count = payload.count || 1;
  const cardText = count === 1 ? 'drew a card' : `drew ${count} cards`;
  return [
    player,
    { kind: 'text', text: ` ${cardText}` },
  ];
};

const formatShuffle: LogEventDefinition<ShufflePayload>['format'] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  return [
    player,
    { kind: 'text', text: ' shuffled library' },
  ];
};

const formatMove: LogEventDefinition<MovePayload>['format'] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const fromZone = ctx.zones[payload.fromZoneId];
  const toZone = ctx.zones[payload.toZoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, fromZone, toZone, payload.cardName);

  const fromLabel = getZoneLabel(ctx, payload.fromZoneId);
  const toLabel = getZoneLabel(ctx, payload.toZoneId);

  if (payload.gainsControlBy && toZone?.type === 'battlefield') {
    const controller = buildPlayerPart(ctx, payload.gainsControlBy);
    return [
      controller,
      { kind: 'text', text: ' gains control of ' },
      cardPart,
    ];
  }

  // Within the same zone: treat as a reorder/move inside the zone
  if (payload.fromZoneId === payload.toZoneId) {
    return [
      actor,
      { kind: 'text', text: ' moved ' },
      cardPart,
      { kind: 'text', text: ` within ${toLabel}` },
    ];
  }

  if (toZone?.type === 'battlefield') {
    return [
      actor,
      { kind: 'text', text: ' played ' },
      cardPart,
      { kind: 'text', text: ` from ${fromLabel}` },
    ];
  }

  if (toZone?.type === 'exile') {
    return [
      actor,
      { kind: 'text', text: ' exiled ' },
      cardPart,
      { kind: 'text', text: ` from ${fromLabel}` },
    ];
  }

  if (toZone?.type === 'graveyard') {
    return [
      actor,
      { kind: 'text', text: ' sent ' },
      cardPart,
      { kind: 'text', text: ` from ${fromLabel} to ${toLabel}` },
    ];
  }

  if (toZone?.type === 'commander') {
    return [
      actor,
      { kind: 'text', text: ' returned commander ' },
      cardPart,
      { kind: 'text', text: ` from ${fromLabel}` },
    ];
  }

  return [
    actor,
    { kind: 'text', text: ' moved ' },
    cardPart,
    { kind: 'text', text: ` from ${fromLabel} to ${toLabel}` },
  ];
};

const formatTap: LogEventDefinition<TapPayload>['format'] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const card = buildCardPart(ctx, payload.cardId, zone, zone);
  const verb = payload.tapped ? 'tapped' : 'untapped';
  return [
    actor,
    { kind: 'text', text: ` ${verb} ` },
    card,
  ];
};

const formatUntapAll: LogEventDefinition<UntapAllPayload>['format'] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  return [
    player,
    { kind: 'text', text: ' untapped all permanents' },
  ];
};

const formatTransform: LogEventDefinition<TransformPayload>['format'] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone);
  const includeFace = cardPart.text !== 'a card' && payload.toFaceName;
  return [
    actor,
    { kind: 'text' as const, text: ' transformed ' },
    cardPart,
    ...(includeFace ? [{ kind: 'text' as const, text: ` to ${payload.toFaceName}` }] : []),
  ];
};

const formatDuplicate: LogEventDefinition<DuplicatePayload>['format'] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.sourceCardId, zone, zone);
  return [
    actor,
    { kind: 'text', text: ' created a token copy of ' },
    cardPart,
  ];
};

const formatRemove: LogEventDefinition<RemoveCardPayload>['format'] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone);
  return [
    actor,
    { kind: 'text', text: ' removed ' },
    cardPart,
  ];
};

const formatPT: LogEventDefinition<PTPayload>['format'] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone);
  const from = `${payload.fromPower ?? '?'} / ${payload.fromToughness ?? '?'}`;
  const to = `${payload.toPower ?? '?'} / ${payload.toToughness ?? '?'}`;
  return [
    actor,
    { kind: 'text', text: ' set ' },
    cardPart,
    { kind: 'text', text: ` P/T to ${to} (was ${from})` },
  ];
};

const formatCounterAdd: LogEventDefinition<CounterPayload>['format'] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone);
  return [
    actor,
    { kind: 'text', text: ` added ${payload.delta} ${payload.counterType} counter${payload.delta === 1 ? '' : 's'} to ` },
    cardPart,
    { kind: 'text', text: ` (now ${payload.newTotal})` },
  ];
};

const formatCounterRemove: LogEventDefinition<CounterPayload>['format'] = (payload, ctx) => {
  const actor = buildPlayerPart(ctx, payload.actorId);
  const zone = ctx.zones[payload.zoneId];
  const cardPart = buildCardPart(ctx, payload.cardId, zone, zone);
  const absDelta = Math.abs(payload.delta);
  return [
    actor,
    { kind: 'text', text: ` removed ${absDelta} ${payload.counterType} counter${absDelta === 1 ? '' : 's'} from ` },
    cardPart,
    { kind: 'text', text: ` (now ${payload.newTotal})` },
  ];
};

const formatGlobalCounterAdd: LogEventDefinition<GlobalCounterPayload>['format'] = (payload, _ctx) => {
  const colorSuffix = payload.color ? ` (${payload.color})` : '';
  return [
    { kind: 'text', text: `Added global counter type ${payload.counterType}${colorSuffix}` },
  ];
};

const formatDeckReset: LogEventDefinition<DeckPayload>['format'] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  return [
    player,
    { kind: 'text', text: ' reset their deck' },
  ];
};

const formatDeckUnload: LogEventDefinition<DeckPayload>['format'] = (payload, ctx) => {
  const player = buildPlayerPart(ctx, payload.playerId);
  return [
    player,
    { kind: 'text', text: ' unloaded their deck' },
  ];
};

export const logEventRegistry: Record<LogEventId, LogEventDefinition<any>> = {
  'player.life': {
    format: formatLife,
    aggregate: {
      key: (payload: LifePayload) => `life:${payload.playerId}`,
      mergePayload: (existing: LifePayload, incoming: LifePayload) => {
        const existingDelta = typeof existing.delta === 'number' ? existing.delta : existing.to - existing.from;
        const nextDelta = typeof incoming.delta === 'number' ? incoming.delta : incoming.to - incoming.from;
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
  'player.commanderTax': {
    format: formatCommanderTax,
  },
  'card.draw': {
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
  'library.shuffle': {
    format: formatShuffle,
  },
  'deck.reset': {
    format: formatDeckReset,
  },
  'deck.unload': {
    format: formatDeckUnload,
  },
  'card.move': {
    format: formatMove,
  },
  'card.tap': {
    format: formatTap,
  },
  'card.untapAll': {
    format: formatUntapAll,
  },
  'card.transform': {
    format: formatTransform,
  },
  'card.duplicate': {
    format: formatDuplicate,
  },
  'card.remove': {
    format: formatRemove,
  },
  'card.pt': {
    format: formatPT,
  },
  'counter.add': {
    format: formatCounterAdd,
  },
  'counter.remove': {
    format: formatCounterRemove,
  },
  'counter.global.add': {
    format: formatGlobalCounterAdd,
  },
};
