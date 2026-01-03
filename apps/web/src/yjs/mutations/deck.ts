import { enforceZoneCounterRules } from '@/lib/counters';
import { resetCardToFrontFace } from '@/lib/cardDisplay';
import { ZONE } from '@/constants/zones';

import type { SharedMaps } from './shared';
import { ensureZoneOrder, removeFromOrder } from './shared';
import { patchCard, removeCard, upsertCard } from './cards';
import { patchPlayer } from './players';
import { reorderZoneCards } from './zones';
import { sharedSnapshot } from './snapshot';

export function resetDeck(maps: SharedMaps, playerId: string) {
  const snapshot = sharedSnapshot(maps);

  const libraryZone = Object.values(snapshot.zones).find(
    (z) => z.ownerId === playerId && z.type === ZONE.LIBRARY
  );
  const commanderZone = Object.values(snapshot.zones).find(
    (z) => z.ownerId === playerId && z.type === ZONE.COMMANDER
  );
  if (!libraryZone) return;

  const isCommanderZoneType = (type: unknown) =>
    type === ZONE.COMMANDER || type === "command";
  const isSideboardZoneType = (type: unknown) => type === ZONE.SIDEBOARD;

  const libraryKeeps = (snapshot.zones[libraryZone.id]?.cardIds ?? []).filter((id) => {
    const card = snapshot.cards[id];
    return card && card.ownerId !== playerId;
  });
  // Reset shuffling visibility: libraries should not retain known/revealed metadata.
  libraryKeeps.forEach((id) => {
    patchCard(maps, id, { knownToAll: false, revealedToAll: false, revealedTo: [] });
  });

  const toLibrary: string[] = [];

  const ownedCards = Object.values(snapshot.cards).filter((card) => card.ownerId === playerId);
  ownedCards.forEach((card) => {
    const fromZone = snapshot.zones[card.zoneId];
    if (fromZone && fromZone.ownerId === playerId && isCommanderZoneType(fromZone.type)) {
      return;
    }
    if (
      fromZone &&
      fromZone.ownerId === playerId &&
      isSideboardZoneType(fromZone.type) &&
      !card.isCommander
    ) {
      return;
    }

    if (snapshot.cards[card.id]?.isToken) {
      removeCard(maps, card.id);
      return;
    }

    if (fromZone) {
      const fromOrder = ensureZoneOrder(maps, card.zoneId, fromZone.cardIds);
      removeFromOrder(fromOrder, card.id);
    }

    if (card.isCommander && commanderZone) {
      const resetCard = resetCardToFrontFace(card);
      const counters = enforceZoneCounterRules(resetCard.counters, commanderZone);
      upsertCard(maps, {
        ...resetCard,
        zoneId: commanderZone.id,
        tapped: false,
        faceDown: false,
        controllerId: card.ownerId,
        knownToAll: true,
        revealedToAll: false,
        revealedTo: [],
        position: { x: 0, y: 0 },
        rotation: 0,
        customText: undefined,
        counters,
        isCommander: true,
      });
      return;
    }

    const resetCard = resetCardToFrontFace(card);
    const counters = enforceZoneCounterRules(resetCard.counters, libraryZone);
    upsertCard(maps, {
      ...resetCard,
      zoneId: libraryZone.id,
      tapped: false,
      faceDown: false,
      controllerId: card.ownerId,
      knownToAll: false,
      revealedToAll: false,
      revealedTo: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      customText: undefined,
      counters,
    });
    toLibrary.push(card.id);
  });

  const shuffled = [...libraryKeeps, ...toLibrary].sort(() => Math.random() - 0.5);
  reorderZoneCards(maps, libraryZone.id, shuffled);
}

export function unloadDeck(maps: SharedMaps, playerId: string) {
  const snapshot = sharedSnapshot(maps);
  const ownedIds = Object.values(snapshot.cards)
    .filter((card) => card.ownerId === playerId)
    .map((card) => card.id);

  ownedIds.forEach((id) => removeCard(maps, id));
  patchPlayer(maps, playerId, { deckLoaded: false });
}
