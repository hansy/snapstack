import * as Y from 'yjs';

// Shared Yjs document factory.
// We keep this minimal: maps for players, zones, cards, globalCounters, and a generic metadata map
// in case we need versioning or session info later.
export type YDocHandles = {
  doc: Y.Doc;
  players: Y.Map<any>;
  playerOrder: Y.Array<string>;
  zones: Y.Map<any>;
  cards: Y.Map<any>;
  zoneCardOrders: Y.Map<Y.Array<string>>;
  globalCounters: Y.Map<any>;
  battlefieldViewScale: Y.Map<any>;
  meta: Y.Map<any>;
  handRevealsToAll: Y.Map<any>;
  libraryRevealsToAll: Y.Map<any>;
  faceDownRevealsToAll: Y.Map<any>;
};

export function createGameYDoc(): YDocHandles {
  const doc = new Y.Doc();
  return {
    doc,
    players: doc.getMap('players'),
    playerOrder: doc.getArray('playerOrder'),
    zones: doc.getMap('zones'),
    cards: doc.getMap('cards'),
    zoneCardOrders: doc.getMap('zoneCardOrders'),
    globalCounters: doc.getMap('globalCounters'),
    battlefieldViewScale: doc.getMap('battlefieldViewScale'),
    meta: doc.getMap('meta'),
    handRevealsToAll: doc.getMap('handRevealsToAll'),
    libraryRevealsToAll: doc.getMap('libraryRevealsToAll'),
    faceDownRevealsToAll: doc.getMap('faceDownRevealsToAll'),
  };
}
