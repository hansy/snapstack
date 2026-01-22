import { ZONE } from "@/constants/zones";
import type { Card, GameState, Zone } from "@/types";
import type { PrivateOverlayPayload } from "@/partykit/messages";

const isHiddenZoneType = (zoneType: string | undefined) =>
  zoneType === ZONE.HAND || zoneType === ZONE.LIBRARY || zoneType === ZONE.SIDEBOARD;

const preservePublicZoneState = (existing: Card, merged: Card): Card => {
  return {
    ...merged,
    zoneId: existing.zoneId,
    position: existing.position,
    tapped: existing.tapped,
    counters: existing.counters,
    faceDown: existing.faceDown,
    faceDownMode: existing.faceDownMode,
    controllerId: existing.controllerId,
    rotation: existing.rotation,
    currentFaceIndex: existing.currentFaceIndex,
    isCommander: existing.isCommander,
    commanderTax: existing.commanderTax,
    knownToAll: existing.knownToAll,
    revealedToAll: existing.revealedToAll,
    revealedTo: existing.revealedTo,
  };
};

const createPlaceholderCard = (params: {
  id: string;
  ownerId: string;
  zoneId: string;
}): Card => ({
  id: params.id,
  name: "Card",
  ownerId: params.ownerId,
  controllerId: params.ownerId,
  zoneId: params.zoneId,
  tapped: false,
  faceDown: false,
  position: { x: 0.5, y: 0.5 },
  rotation: 0,
  counters: [],
  knownToAll: false,
  revealedToAll: false,
  revealedTo: [],
});

const buildHandCardZones = (zones: Record<string, Zone>) => {
  const byCardId = new Map<string, { ownerId: string; zoneId: string }>();
  Object.values(zones).forEach((zone) => {
    if (zone.type !== ZONE.HAND) return;
    zone.cardIds.forEach((cardId) => {
      if (typeof cardId !== "string") return;
      byCardId.set(cardId, { ownerId: zone.ownerId, zoneId: zone.id });
    });
  });
  return byCardId;
};

const ensureHiddenZonePlaceholders = (
  zones: Record<string, Zone>,
  cards: Record<string, Card>
) => {
  Object.values(zones).forEach((zone) => {
    if (zone.type !== ZONE.HAND && zone.type !== ZONE.LIBRARY && zone.type !== ZONE.SIDEBOARD) {
      return;
    }
    zone.cardIds.forEach((cardId) => {
      if (typeof cardId !== "string") return;
      if (!cards[cardId]) {
        cards[cardId] = createPlaceholderCard({
          id: cardId,
          ownerId: zone.ownerId,
          zoneId: zone.id,
        });
      }
    });
  });
};

export const mergePrivateOverlay = (
  base: GameState,
  overlay?: PrivateOverlayPayload | null
): GameState => {
  const nextCards: Record<string, Card> = { ...base.cards };
  const nextZones: Record<string, Zone> = { ...base.zones };
  const handCardZones = buildHandCardZones(base.zones);

  handCardZones.forEach(({ ownerId, zoneId }, cardId) => {
    if (!nextCards[cardId]) {
      nextCards[cardId] = createPlaceholderCard({ id: cardId, ownerId, zoneId });
    }
  });

  Object.entries(base.handRevealsToAll).forEach(([cardId, identity]) => {
    const zoneInfo = handCardZones.get(cardId);
    if (!nextCards[cardId] && zoneInfo) {
      nextCards[cardId] = createPlaceholderCard({
        id: cardId,
        ownerId: zoneInfo.ownerId,
        zoneId: zoneInfo.zoneId,
      });
    }
    const existing = nextCards[cardId];
    if (!existing) return;
    nextCards[cardId] = {
      ...existing,
      ...identity,
      revealedToAll: true,
    };
  });

  Object.entries(base.faceDownRevealsToAll).forEach(([cardId, identity]) => {
    const existing = nextCards[cardId];
    if (!existing) return;
    nextCards[cardId] = {
      ...existing,
      ...identity,
      revealedToAll: true,
    };
  });

  if (overlay) {
    overlay.cards.forEach((card) => {
      const existing = nextCards[card.id];
      if (!existing) {
        nextCards[card.id] = card;
        return;
      }
      const merged = { ...existing, ...card };
      const zone = nextZones[existing.zoneId];
      if (zone && !isHiddenZoneType(zone.type)) {
        nextCards[card.id] = preservePublicZoneState(existing, merged);
        return;
      }
      nextCards[card.id] = merged;
    });

    if (overlay.zoneCardOrders) {
      Object.entries(overlay.zoneCardOrders).forEach(([zoneId, cardIds]) => {
        const zone = nextZones[zoneId];
        if (!zone || !Array.isArray(cardIds)) return;
        nextZones[zoneId] = {
          ...zone,
          cardIds: cardIds.filter((id): id is string => typeof id === "string"),
        };
      });
    }
  }

  ensureHiddenZonePlaceholders(nextZones, nextCards);

  const libraryZoneByOwner = new Map<string, string>();
  Object.values(nextZones).forEach((zone) => {
    if (zone.type === ZONE.LIBRARY) {
      libraryZoneByOwner.set(zone.ownerId, zone.id);
    }
  });

  Object.entries(base.libraryRevealsToAll).forEach(([cardId, entry]) => {
    const ownerId = entry.ownerId ?? nextCards[cardId]?.ownerId;
    const zoneId = nextCards[cardId]?.zoneId ?? (ownerId ? libraryZoneByOwner.get(ownerId) : undefined);
    if (!nextCards[cardId] && ownerId && zoneId) {
      nextCards[cardId] = createPlaceholderCard({
        id: cardId,
        ownerId,
        zoneId,
      });
    }
    const existing = nextCards[cardId];
    if (!existing) return;
    nextCards[cardId] = {
      ...existing,
      ...entry.card,
      revealedToAll: true,
    };
  });

  return { ...base, cards: nextCards, zones: nextZones };
};
