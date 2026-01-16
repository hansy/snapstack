/**
 * Legacy Yjs mutation helpers.
 *
 * These are kept for tests and migration-era utilities only.
 * Runtime code should not import from this module.
 */
export type { SharedMaps } from './mutations/shared';
export type { CardPatch } from './mutations/cards';

export { sharedSnapshot } from './mutations/snapshot';

export { removePlayer, patchPlayer, setBattlefieldViewScale, upsertPlayer } from './mutations/players';
export { removeZone, reorderZoneCards, upsertZone } from './mutations/zones';
export {
  addCounterToCard,
  duplicateCard,
  moveCard,
  patchCard,
  removeCard,
  removeCounterFromCard,
  transformCard,
  upsertCard,
} from './mutations/cards';
export { resetDeck, unloadDeck } from './mutations/deck';
export { patchRoomMeta, type RoomMetaPatch } from './mutations/meta';
