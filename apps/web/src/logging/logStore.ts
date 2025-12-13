import { create } from 'zustand';
import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import { getYDocHandles } from '../yjs/docManager';
import { logEventRegistry } from './eventRegistry';
import { LogContext, LogEventDefinition, LogEventId, LogMessage } from './types';

const MAX_LOG_ENTRIES = 200;
const DEFAULT_AGGREGATE_WINDOW_MS = 2000;

interface LogStoreState {
  entries: LogMessage[];
  emitLog: (eventId: LogEventId, payload: any, ctx: LogContext) => void;
  clear: () => void;
  setEntries: (entries: LogMessage[]) => void;
}

const buildEntry = (
  eventId: LogEventId,
  payload: any,
  ctx: LogContext,
  aggregateKey?: string,
  existingId?: string,
  timestamp = Date.now(),
  sourceClientId?: number,
): LogMessage => {
  const def = logEventRegistry[eventId];
  const parts = def.format(payload, ctx);

  return {
    id: existingId ?? uuidv4(),
    ts: timestamp,
    eventId,
    actorId: payload?.actorId,
    visibility: 'public',
    parts,
    payload,
    aggregateKey,
    sourceClientId,
  };
};

const normalizeSharedEntry = (value: any): LogMessage | undefined => {
  if (!value) return undefined;
  if (typeof value.toJSON === 'function') return value.toJSON() as LogMessage;
  return value as LogMessage;
};

const trimSharedLogs = (logs: Y.Array<any>) => {
  const overflow = logs.length - MAX_LOG_ENTRIES;
  if (overflow > 0) {
    logs.delete(0, overflow);
  }
};

const writeSharedLog = (
  eventId: LogEventId,
  def: LogEventDefinition<any>,
  payload: any,
  ctx: LogContext,
  aggregateKey?: string,
): boolean => {
  const handles = getYDocHandles();
  const logs = handles?.logs;
  if (!handles || !logs) return false;
  const sourceClientId = handles.doc.clientID;

  const now = Date.now();
  handles.doc.transact(() => {
    const lastValue = logs.length > 0 ? logs.get(logs.length - 1) : undefined;
    const lastEntry = normalizeSharedEntry(lastValue);
    const windowMs = def.aggregate?.windowMs ?? DEFAULT_AGGREGATE_WINDOW_MS;

    if (
      aggregateKey &&
      def.aggregate &&
      lastEntry &&
      lastEntry.aggregateKey === aggregateKey &&
      now - lastEntry.ts <= windowMs
    ) {
      const mergedPayload = def.aggregate.mergePayload(lastEntry.payload, payload);
      const mergedEntry = buildEntry(eventId, mergedPayload, ctx, aggregateKey, lastEntry.id, now, sourceClientId);
      logs.delete(logs.length - 1, 1);
      logs.push([mergedEntry]);
      trimSharedLogs(logs);
      return;
    }

    const entry = buildEntry(eventId, payload, ctx, aggregateKey, undefined, now, sourceClientId);
    logs.push([entry]);
    trimSharedLogs(logs);
  });

  return true;
};

const clearSharedLogs = () => {
  const handles = getYDocHandles();
  const logs = handles?.logs;
  if (!handles || !logs) return false;
  handles.doc.transact(() => {
    if (logs.length > 0) logs.delete(0, logs.length);
  });
  return true;
};

export const useLogStore = create<LogStoreState>((set) => {
  const areEntriesEqual = (prev: LogMessage[], next: LogMessage[]) => {
    if (prev === next) return true;
    if (prev.length !== next.length) return false;
    const prevLast = prev[prev.length - 1];
    const nextLast = next[next.length - 1];
    return prevLast?.id === nextLast?.id && prevLast?.ts === nextLast?.ts;
  };

  const appendLocal = (
    def: LogEventDefinition<any>,
    eventId: LogEventId,
    payload: any,
    ctx: LogContext,
    aggregateKey?: string,
  ) => {
    const now = Date.now();
    set((state) => {
      const entries = [...state.entries];

      if (aggregateKey && def.aggregate && entries.length > 0) {
        const last = entries[entries.length - 1];
        const windowMs = def.aggregate.windowMs ?? DEFAULT_AGGREGATE_WINDOW_MS;

        if (last.aggregateKey === aggregateKey && now - last.ts <= windowMs) {
          const mergedPayload = def.aggregate.mergePayload(last.payload, payload);
          const mergedEntry = buildEntry(eventId, mergedPayload, ctx, aggregateKey, last.id, now);
          entries[entries.length - 1] = mergedEntry;
          return { entries };
        }
      }

      const entry = buildEntry(eventId, payload, ctx, aggregateKey, undefined, now);
      entries.push(entry);
      if (entries.length > MAX_LOG_ENTRIES) {
        entries.splice(0, entries.length - MAX_LOG_ENTRIES);
      }

      return { entries };
    });
  };

  return {
    entries: [],

    emitLog: (eventId, payload, ctx) => {
      const def = logEventRegistry[eventId];
      if (!def) return;

      const redactedPayload = def.redact ? def.redact(payload, ctx) : payload;
      const aggregateKey = def.aggregate?.key ? def.aggregate.key(redactedPayload) : undefined;

      if (writeSharedLog(eventId, def, redactedPayload, ctx, aggregateKey)) return;
      appendLocal(def, eventId, redactedPayload, ctx, aggregateKey);
    },

    clear: () => {
      clearSharedLogs();
      set({ entries: [] });
    },

    setEntries: (entries) => set((state) => (areEntriesEqual(state.entries, entries) ? state : { entries })),
  };
});

let sharedLogs: Y.Array<any> | null = null;
let lastEntriesKey: string | null = null;

const computeEntriesKey = (entries: LogMessage[]) => {
  const last = entries[entries.length - 1];
  return `${entries.length}:${last?.id ?? ''}:${last?.ts ?? ''}`;
};

const syncSharedLogsToStore = () => {
  if (!sharedLogs) {
    lastEntriesKey = null;
    useLogStore.getState().setEntries([]);
    return;
  }
  const current = useLogStore.getState().entries;
  const shared = sharedLogs.toArray().map(normalizeSharedEntry).filter(Boolean) as LogMessage[];
  if (shared.length < current.length) return; // ignore shrinks/clears from peers

  let next = current;
  if (current.length === 0) {
    next = shared.slice(-MAX_LOG_ENTRIES);
  } else {
    const lastId = current[current.length - 1]?.id;
    const anchorIndex = shared.findIndex((e) => e?.id === lastId);
    if (anchorIndex >= 0) {
      const appended = shared.slice(anchorIndex + 1);
      if (appended.length > 0) {
        next = [...current, ...appended].slice(-MAX_LOG_ENTRIES);
      }
    }
    // if no anchor found, ignore to avoid accepting rewrites
  }

  const key = computeEntriesKey(next);
  if (key === lastEntriesKey) return;
  lastEntriesKey = key;
  useLogStore.getState().setEntries(next);
};

const sharedLogsObserver = () => {
  syncSharedLogsToStore();
};

export const bindSharedLogStore = (logs: Y.Array<any> | null) => {
  if (sharedLogs === logs) {
    if (logs) {
      lastEntriesKey = null;
      syncSharedLogsToStore();
    } else {
      lastEntriesKey = null;
      useLogStore.getState().setEntries([]);
    }
    return;
  }

  if (sharedLogs) {
    sharedLogs.unobserve(sharedLogsObserver);
  }

  sharedLogs = logs;

  if (sharedLogs) {
    lastEntriesKey = null;
    sharedLogs.observe(sharedLogsObserver);
    syncSharedLogsToStore();
  } else {
    lastEntriesKey = null;
    useLogStore.getState().setEntries([]);
  }
};

export const emitLog = (eventId: LogEventId, payload: any, ctx: LogContext) =>
  useLogStore.getState().emitLog(eventId, payload, ctx);

export const clearLogs = () => useLogStore.getState().clear();
