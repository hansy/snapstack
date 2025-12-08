import * as Y from 'yjs';

// Shared Yjs document factory.
// We keep this minimal: maps for players, zones, cards, globalCounters, and a generic metadata map
// in case we need versioning or session info later.
export type YDocHandles = {
  doc: Y.Doc;
  players: Y.Map<any>;
  zones: Y.Map<any>;
  cards: Y.Map<any>;
  zoneCardOrders: Y.Map<Y.Array<string>>;
  globalCounters: Y.Map<any>;
  battlefieldViewScale: Y.Map<any>;
  logs: Y.Array<any>;
  meta: Y.Map<any>;
};

export function createGameYDoc(): YDocHandles {
  const doc = new Y.Doc();
  return {
    doc,
    players: doc.getMap('players'),
    zones: doc.getMap('zones'),
    cards: doc.getMap('cards'),
    zoneCardOrders: doc.getMap('zoneCardOrders'),
    globalCounters: doc.getMap('globalCounters'),
    battlefieldViewScale: doc.getMap('battlefieldViewScale'),
    logs: doc.getArray('logs'),
    meta: doc.getMap('meta'),
  };
}
