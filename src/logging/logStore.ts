import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { logEventRegistry } from './eventRegistry';
import { LogContext, LogEventId, LogMessage } from './types';

const MAX_LOG_ENTRIES = 200;
const DEFAULT_AGGREGATE_WINDOW_MS = 2000;

interface LogStoreState {
  entries: LogMessage[];
  emitLog: (eventId: LogEventId, payload: any, ctx: LogContext) => void;
  clear: () => void;
}

const buildEntry = (
  eventId: LogEventId,
  payload: any,
  ctx: LogContext,
  aggregateKey?: string,
  existingId?: string,
): LogMessage => {
  const def = logEventRegistry[eventId];
  const parts = def.format(payload, ctx);

  return {
    id: existingId ?? uuidv4(),
    ts: Date.now(),
    eventId,
    actorId: payload?.actorId,
    visibility: 'public',
    parts,
    payload,
    aggregateKey,
  };
};

export const useLogStore = create<LogStoreState>((set) => ({
  entries: [],

  emitLog: (eventId, payload, ctx) => {
    const def = logEventRegistry[eventId];
    if (!def) return;

    const redactedPayload = def.redact ? def.redact(payload, ctx) : payload;
    const aggregateKey = def.aggregate?.key ? def.aggregate.key(redactedPayload) : undefined;
    const now = Date.now();

    set((state) => {
      const entries = [...state.entries];

      if (aggregateKey && def.aggregate && entries.length > 0) {
        const last = entries[entries.length - 1];
        const windowMs = def.aggregate.windowMs ?? DEFAULT_AGGREGATE_WINDOW_MS;

        if (last.aggregateKey === aggregateKey && now - last.ts <= windowMs) {
          const mergedPayload = def.aggregate.mergePayload(last.payload, redactedPayload);
          const mergedEntry = buildEntry(eventId, mergedPayload, ctx, aggregateKey, last.id);
          mergedEntry.ts = now;
          entries[entries.length - 1] = mergedEntry;
          return { entries };
        }
      }

      const entry = buildEntry(eventId, redactedPayload, ctx, aggregateKey);
      entries.push(entry);
      if (entries.length > MAX_LOG_ENTRIES) {
        entries.splice(0, entries.length - MAX_LOG_ENTRIES);
      }

      return { entries };
    });
  },

  clear: () => set({ entries: [] }),
}));

export const emitLog = (eventId: LogEventId, payload: any, ctx: LogContext) =>
  useLogStore.getState().emitLog(eventId, payload, ctx);
