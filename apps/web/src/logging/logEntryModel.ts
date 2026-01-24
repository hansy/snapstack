import type {
  LogContext,
  LogEventDefinition,
  LogEventId,
  LogEventPayloadMap,
  LogMessage,
} from "./types";

import { DEFAULT_AGGREGATE_WINDOW_MS } from "./eventRegistry/constants";

export const buildLogEntry = <K extends LogEventId>(params: {
  eventId: K;
  def: LogEventDefinition<LogEventPayloadMap[K]>;
  payload: LogEventPayloadMap[K];
  ctx: LogContext;
  aggregateKey?: string;
  existingId?: string;
  timestamp: number;
  sourceClientId?: number;
  createId: () => string;
}): LogMessage<K> => {
  const parts = params.def.format(params.payload, params.ctx);
  const actorId =
    params.payload && "actorId" in params.payload
      ? (params.payload as { actorId?: string }).actorId
      : undefined;

  return {
    id: params.existingId ?? params.createId(),
    ts: params.timestamp,
    eventId: params.eventId,
    actorId,
    visibility: "public",
    parts,
    payload: params.payload,
    aggregateKey: params.aggregateKey,
    sourceClientId: params.sourceClientId,
  };
};

export const computeAggregatedLogEntryUpdate = <K extends LogEventId>(params: {
  eventId: K;
  def: LogEventDefinition<LogEventPayloadMap[K]>;
  payload: LogEventPayloadMap[K];
  ctx: LogContext;
  aggregateKey?: string;
  lastEntry?: LogMessage<K>;
  timestamp: number;
  sourceClientId?: number;
  createId: () => string;
}): { kind: "append" | "replaceLast"; entry: LogMessage<K> } => {
  const aggregate = params.def.aggregate;
  const canAggregate = Boolean(params.aggregateKey && aggregate);

  const lastPayload = params.lastEntry?.payload;
  if (
    canAggregate &&
    params.lastEntry &&
    params.lastEntry.aggregateKey === params.aggregateKey &&
    lastPayload
  ) {
    const windowMs = aggregate?.windowMs ?? DEFAULT_AGGREGATE_WINDOW_MS;
    if (params.timestamp - params.lastEntry.ts <= windowMs) {
      const mergedPayload = aggregate!.mergePayload(lastPayload, params.payload);
      return {
        kind: "replaceLast",
        entry: buildLogEntry({
          eventId: params.eventId,
          def: params.def,
          payload: mergedPayload,
          ctx: params.ctx,
          aggregateKey: params.aggregateKey,
          existingId: params.lastEntry.id,
          timestamp: params.timestamp,
          sourceClientId: params.sourceClientId,
          createId: params.createId,
        }),
      };
    }
  }

  return {
    kind: "append",
    entry: buildLogEntry({
      eventId: params.eventId,
      def: params.def,
      payload: params.payload,
      ctx: params.ctx,
      aggregateKey: params.aggregateKey,
      timestamp: params.timestamp,
      sourceClientId: params.sourceClientId,
      createId: params.createId,
    }),
  };
};
