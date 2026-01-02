import { Card, CardId, Player, PlayerId, Zone, ZoneId } from '@/types';

export type LogEventId =
  | 'player.life'
  | 'player.commanderTax'
  | 'dice.roll'
  | 'card.draw'
  | 'card.discard'
  | 'library.shuffle'
  | 'deck.reset'
  | 'deck.unload'
  | 'card.move'
  | 'card.tap'
  | 'card.untapAll'
  | 'card.transform'
  | 'card.duplicate'
  | 'card.remove'
  | 'card.pt'
  | 'card.tokenCreate'
  | 'counter.add'
  | 'counter.remove'
  | 'counter.global.add';

export type LogMessagePartKind = 'text' | 'player' | 'card' | 'zone' | 'value';

export interface LogMessagePart {
  kind: LogMessagePartKind;
  text: string;
  playerId?: PlayerId;
  cardId?: CardId;
  zoneId?: ZoneId;
}

export interface LogContext {
  players: Record<PlayerId, Player>;
  cards: Record<CardId, Card>;
  zones: Record<ZoneId, Zone>;
}

export interface LogMessage {
  id: string;
  ts: number;
  eventId: LogEventId;
  actorId?: PlayerId;
  visibility: 'public';
  parts: LogMessagePart[];
  payload?: any;
  aggregateKey?: string;
  sourceClientId?: number;
}

export interface LogEventAggregateConfig<P = any> {
  key: (payload: P) => string | undefined;
  mergePayload: (existing: P, incoming: P) => P;
  windowMs?: number;
}

export interface LogEventDefinition<P = any> {
  format: (payload: P, ctx: LogContext) => LogMessagePart[];
  redact?: (payload: P, ctx: LogContext) => P;
  aggregate?: LogEventAggregateConfig<P>;
}
