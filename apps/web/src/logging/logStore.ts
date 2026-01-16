import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { logEventRegistry } from './eventRegistry';
import {
  LogContext,
  LogEventDefinition,
  LogEventId,
  LogEventPayloadMap,
  LogMessage,
} from './types';
import { computeAggregatedLogEntryUpdate } from './logEntryModel';

const MAX_LOG_ENTRIES = 200;

interface LogStoreState {
  entries: LogMessage[];
  emitLog: <K extends LogEventId>(
    eventId: K,
    payload: LogEventPayloadMap[K],
    ctx: LogContext
  ) => void;
  clear: () => void;
}

export const useLogStore = create<LogStoreState>((set) => {
  const appendLocal = <K extends LogEventId>(
    def: LogEventDefinition<LogEventPayloadMap[K]>,
    eventId: K,
    payload: LogEventPayloadMap[K],
    ctx: LogContext,
    aggregateKey?: string
  ) => {
    const now = Date.now();
    set((state) => {
      const entries = [...state.entries];

      const update = computeAggregatedLogEntryUpdate({
        eventId,
        def,
        payload,
        ctx,
        aggregateKey,
        lastEntry: entries[entries.length - 1] as LogMessage<K> | undefined,
        timestamp: now,
        createId: uuidv4,
      });

      if (update.kind === 'replaceLast') {
        entries[entries.length - 1] = update.entry;
      } else {
        entries.push(update.entry);
      }

      if (entries.length > MAX_LOG_ENTRIES) {
        entries.splice(0, entries.length - MAX_LOG_ENTRIES);
      }

      return { entries };
    });
  };

  return {
    entries: [],

    emitLog: (eventId, payload, ctx) => {
      const def = logEventRegistry[eventId] as LogEventDefinition<
        LogEventPayloadMap[typeof eventId]
      >;
      if (!def) return;

      const redactedPayload = def.redact ? def.redact(payload, ctx) : payload;
      const aggregateKey = def.aggregate?.key ? def.aggregate.key(redactedPayload) : undefined;

      appendLocal(def, eventId, redactedPayload, ctx, aggregateKey);
    },

    clear: () => {
      set({ entries: [] });
    },
  };
});

export const emitLog = <K extends LogEventId>(
  eventId: K,
  payload: LogEventPayloadMap[K],
  ctx: LogContext
) => useLogStore.getState().emitLog(eventId, payload, ctx);

export const clearLogs = () => useLogStore.getState().clear();
