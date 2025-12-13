import * as Y from 'yjs';
import { Card, Player, Zone } from '../types';
import { enforceZoneCounterRules, mergeCounters } from '../lib/counters';
import {
  bumpPosition,
  clampNormalizedPosition,
  findAvailablePositionNormalized,
  GRID_STEP_Y,
  migratePositionToNormalized,
  positionsRoughlyEqual,
} from '../lib/positions';
import { getCardFaces, getCurrentFaceIndex, isTransformableCard, syncCardStatsToFace } from '../lib/cardDisplay';
import { ZONE } from '../constants/zones';

export type SharedMaps = {
  players: Y.Map<Y.Map<any>>;
  playerOrder: Y.Array<string>;
  zones: Y.Map<Y.Map<any>>;
  cards: Y.Map<Y.Map<any>>;
  zoneCardOrders: Y.Map<Y.Array<string>>;
  globalCounters: Y.Map<any>;
  battlefieldViewScale: Y.Map<any>;
};

type Counter = Card['counters'][number];

const ensureChildMap = (parent: Y.Map<any>, key: string): Y.Map<any> => {
  const existing = parent.get(key);
  if (existing instanceof Y.Map) return existing;
  const next = new Y.Map();
  parent.set(key, next);
  return next;
};

const ensureZoneOrder = (maps: SharedMaps, zoneId: string, seed?: string[]): Y.Array<string> => {
  const existing = maps.zoneCardOrders.get(zoneId);
  if (existing instanceof Y.Array) return existing;
  const next = new Y.Array<string>();
  const initial = seed ? Array.from(new Set(seed.filter((id): id is string => typeof id === 'string'))) : [];
  if (initial.length) next.insert(0, initial);
  maps.zoneCardOrders.set(zoneId, next);
  return next;
};

const removeFromOrder = (order: Y.Array<string>, cardId: string) => {
  for (let i = order.length - 1; i >= 0; i--) {
    if (order.get(i) === cardId) {
      order.delete(i, 1);
    }
  }
};

const syncOrder = (order: Y.Array<string>, ids: string[]) => {
  order.delete(0, order.length);
  if (ids.length) {
    order.insert(0, ids);
  }
};

const writeCounters = (target: Y.Map<any>, counters: Counter[]) => {
  const seen = new Set<string>();
  counters.forEach((c) => {
    seen.add(c.type);
    target.set(c.type, { type: c.type, count: c.count, color: c.color });
  });
  target.forEach((_value, key) => {
    if (!seen.has(key as string)) target.delete(key as string);
  });
};

const readCounters = (target: Y.Map<any> | any): Counter[] => {
  if (target instanceof Y.Map) {
    const result: Counter[] = [];
    target.forEach((value, key) => {
      if (!value) return;
      const count = typeof value.count === 'number' ? value.count : 0;
      const type = typeof value.type === 'string' ? value.type : String(key);
      const next: Counter = { type, count };
      if (typeof value.color === 'string') next.color = value.color;
      result.push(next);
    });
    return result;
  }
  if (Array.isArray(target)) {
    return target
      .map((value) => {
        if (!value || typeof value.type !== 'string') return null;
        const count = typeof value.count === 'number' ? value.count : 0;
        const next: Counter = { type: value.type, count };
        if (typeof value.color === 'string') next.color = value.color;
        return next;
      })
      .filter(Boolean) as Counter[];
  }
  return [];
};

const readCommanderDamage = (source: any): Record<string, number> => {
  const commanderDamage: Record<string, number> = {};
  if (source instanceof Y.Map) {
    source.forEach((value, key) => {
      commanderDamage[key as string] = value;
    });
    return commanderDamage;
  }
  if (source && typeof source === 'object') {
    Object.entries(source).forEach(([pid, dmg]) => {
      if (typeof pid === 'string' && typeof dmg === 'number') {
        commanderDamage[pid] = dmg;
      }
    });
  }
  return commanderDamage;
};

const ensurePlayerInOrder = (maps: SharedMaps, playerId: string) => {
  const order = maps.playerOrder;
  const current = order.toArray();
  if (!current.includes(playerId)) {
    order.push([playerId]);
  }
};

const removePlayerFromOrder = (maps: SharedMaps, playerId: string) => {
  const order = maps.playerOrder;
  for (let i = order.length - 1; i >= 0; i--) {
    if (order.get(i) === playerId) {
      order.delete(i, 1);
    }
  }
};

const writePlayer = (maps: SharedMaps, player: Player) => {
  const target = ensureChildMap(maps.players, player.id);
  target.set('id', player.id);
  target.set('name', player.name);
  target.set('life', player.life);
  target.set('color', player.color);
  target.set('cursor', player.cursor);
  target.set('commanderTax', player.commanderTax);
  target.set('deckLoaded', player.deckLoaded);
  target.set('counters', player.counters);
  const commanderDamage = ensureChildMap(target, 'commanderDamage');
  const seen = new Set<string>();
  Object.entries(player.commanderDamage ?? {}).forEach(([pid, dmg]) => {
    commanderDamage.set(pid, dmg);
    seen.add(pid);
  });
  commanderDamage.forEach((_v, key) => {
    if (!seen.has(key as string)) commanderDamage.delete(key as string);
  });
  ensurePlayerInOrder(maps, player.id);
};

const readPlayer = (maps: SharedMaps, playerId: string): Player | null => {
  const target = maps.players.get(playerId);
  if (!target) return null;
  const getVal = (key: string) => (target instanceof Y.Map ? target.get(key) : (target as any)[key]);
  const commanderDamageSource = target instanceof Y.Map ? target.get('commanderDamage') : (target as any)?.commanderDamage;
  const commanderDamage = readCommanderDamage(commanderDamageSource);
  return {
    id: playerId,
    name: getVal('name'),
    life: getVal('life'),
    color: getVal('color'),
    cursor: getVal('cursor'),
    counters: readCounters(getVal('counters')),
    commanderDamage,
    commanderTax: getVal('commanderTax'),
    deckLoaded: getVal('deckLoaded'),
  } as Player;
};

const writeZone = (maps: SharedMaps, zone: Zone) => {
  const target = ensureChildMap(maps.zones, zone.id);
  target.set('id', zone.id);
  target.set('type', zone.type);
  target.set('ownerId', zone.ownerId);
  const order = ensureZoneOrder(maps, zone.id, zone.cardIds);
  if (Array.isArray(zone.cardIds)) {
    const unique = Array.from(new Set(zone.cardIds));
    syncOrder(order, unique);
  }
};

const readZone = (maps: SharedMaps, zoneId: string): Zone | null => {
  const target = maps.zones.get(zoneId);
  if (!target) return null;
  const getVal = (key: string) => (target instanceof Y.Map ? target.get(key) : (target as any)[key]);
  const order = maps.zoneCardOrders.get(zoneId);
  let cardIds: string[] = [];
  if (order instanceof Y.Array) {
    cardIds = order.toArray();
  } else {
    const legacyIds = getVal('cardIds');
    if (Array.isArray(legacyIds)) {
      cardIds = legacyIds.filter((id) => typeof id === 'string');
    }
  }
  return {
    id: zoneId,
    type: getVal('type'),
    ownerId: getVal('ownerId'),
    cardIds: Array.from(new Set(cardIds)),
  } as Zone;
};

const writeCard = (maps: SharedMaps, card: Card) => {
  const target = ensureChildMap(maps.cards, card.id);
  const normalizedPosition =
    card.position && (card.position.x > 1 || card.position.y > 1)
      ? migratePositionToNormalized(card.position)
      : clampNormalizedPosition(card.position || { x: 0.5, y: 0.5 });

  const countersMap = ensureChildMap(target, 'counters');
  writeCounters(countersMap, card.counters);

  target.set('id', card.id);
  target.set('ownerId', card.ownerId);
  target.set('controllerId', card.controllerId);
  target.set('zoneId', card.zoneId);
  target.set('tapped', card.tapped);
  target.set('faceDown', card.faceDown);
  target.set('currentFaceIndex', card.currentFaceIndex ?? 0);
  target.set('position', normalizedPosition);
  target.set('rotation', card.rotation);
  target.set('name', card.name);
  target.set('imageUrl', card.imageUrl);
  target.set('oracleText', card.oracleText);
  target.set('typeLine', card.typeLine);
  target.set('scryfallId', card.scryfallId);
  target.set('scryfall', card.scryfall);
  target.set('isToken', card.isToken);
  target.set('power', card.power);
  target.set('toughness', card.toughness);
  target.set('basePower', card.basePower);
  target.set('baseToughness', card.baseToughness);
  target.set('customText', card.customText);

  const order = ensureZoneOrder(maps, card.zoneId);
  if (!order.toArray().includes(card.id)) {
    order.push([card.id]);
  }
};

const readCard = (maps: SharedMaps, cardId: string): Card | null => {
  const target = maps.cards.get(cardId);
  if (!target) return null;
  const getVal = (key: string) => (target instanceof Y.Map ? target.get(key) : (target as any)[key]);
  const counters = readCounters(getVal('counters'));
  return {
    id: cardId,
    ownerId: getVal('ownerId'),
    controllerId: getVal('controllerId'),
    zoneId: getVal('zoneId'),
    tapped: getVal('tapped'),
    faceDown: getVal('faceDown'),
    currentFaceIndex: getVal('currentFaceIndex'),
    position: getVal('position') || { x: 0.5, y: 0.5 },
    rotation: getVal('rotation'),
    counters,
    name: getVal('name'),
    imageUrl: getVal('imageUrl'),
    oracleText: getVal('oracleText'),
    typeLine: getVal('typeLine'),
    scryfallId: getVal('scryfallId'),
    scryfall: getVal('scryfall'),
    isToken: getVal('isToken'),
    power: getVal('power'),
    toughness: getVal('toughness'),
    basePower: getVal('basePower'),
    baseToughness: getVal('baseToughness'),
    customText: getVal('customText'),
  } as Card;
};

const getCardsSnapshot = (maps: SharedMaps): Record<string, Card> => {
  const result: Record<string, Card> = {};
  maps.cards.forEach((_value, key) => {
    const card = readCard(maps, key as string);
    if (card) result[key as string] = card;
  });
  return result;
};

export function removePlayer(maps: SharedMaps, playerId: string) {
  maps.players.delete(playerId);
  maps.battlefieldViewScale.delete(playerId);
  removePlayerFromOrder(maps, playerId);

  // Remove owned zones and their cards
  maps.zones.forEach((_zoneValue, zoneId) => {
    const zone = readZone(maps, zoneId as string);
    if (!zone || zone.ownerId !== playerId) return;
    zone.cardIds.forEach((cardId) => {
      maps.cards.delete(cardId);
    });
    maps.zoneCardOrders.delete(zoneId as string);
    maps.zones.delete(zoneId as string);
  });

  // Remove any remaining cards owned by the player (in other zones)
  maps.cards.forEach((_cardValue, cardId) => {
    const card = readCard(maps, cardId as string);
    if (card?.ownerId === playerId) {
      const zone = readZone(maps, card.zoneId);
      removeFromOrder(ensureZoneOrder(maps, card.zoneId, zone?.cardIds), cardId as string);
      maps.cards.delete(cardId as string);
    }
  });
}

export function upsertPlayer(maps: SharedMaps, player: Player) {
  writePlayer(maps, player);
}

export function patchPlayer(maps: SharedMaps, playerId: string, updates: Partial<Player>) {
  const current = readPlayer(maps, playerId);
  if (!current) return;
  writePlayer(maps, { ...current, ...updates, id: playerId });
}

export function upsertZone(maps: SharedMaps, zone: Zone) {
  writeZone(maps, zone);
}

export function removeZone(maps: SharedMaps, zoneId: string) {
  const zone = readZone(maps, zoneId);
  if (zone) {
    zone.cardIds.forEach((cardId) => maps.cards.delete(cardId));
  }
  maps.zoneCardOrders.delete(zoneId);
  maps.zones.delete(zoneId);
}

export function upsertCard(maps: SharedMaps, card: Card) {
  const zone = readZone(maps, card.zoneId);
  const nextCounters = enforceZoneCounterRules(card.counters, zone || undefined);
  writeCard(maps, { ...card, counters: nextCounters });
}

export function setBattlefieldViewScale(maps: SharedMaps, playerId: string, scale: number) {
  const clamped = Math.max(0.5, Math.min(1, scale));
  maps.battlefieldViewScale.set(playerId, clamped);
}

export function removeCard(maps: SharedMaps, cardId: string) {
  const card = readCard(maps, cardId);
  if (card) {
    const fromZone = readZone(maps, card.zoneId);
    const order = ensureZoneOrder(maps, card.zoneId, fromZone?.cardIds);
    removeFromOrder(order, cardId);
  }
  maps.cards.delete(cardId);
}

export function moveCard(maps: SharedMaps, cardId: string, toZoneId: string, position?: { x: number; y: number }) {
  const currentCard = readCard(maps, cardId);
  if (!currentCard) return;

  const card =
    currentCard.position.x > 1 || currentCard.position.y > 1
      ? { ...currentCard, position: migratePositionToNormalized(currentCard.position) }
      : currentCard;
  if (card !== currentCard) {
    writeCard(maps, card);
  }

  const fromZoneId = card.zoneId;
  const fromZone = readZone(maps, fromZoneId);
  const toZone = readZone(maps, toZoneId);
  if (!fromZone || !toZone) return;

  const normalizedInput = position && (position.x > 1 || position.y > 1) ? migratePositionToNormalized(position) : position;
  let newPosition = clampNormalizedPosition(normalizedInput || card.position);
  const cardsCopy = getCardsSnapshot(maps);
  Object.entries(cardsCopy).forEach(([id, c]) => {
    if (c.position.x > 1 || c.position.y > 1) {
      const normalized = { ...c, position: migratePositionToNormalized(c.position) };
      cardsCopy[id] = normalized;
      writeCard(maps, normalized);
    }
  });
  const leavingBattlefield = fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
  const resetToFront = leavingBattlefield ? syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0) : card;

  // If moving to battlefield, snap and resolve collisions
  if (toZone.type === ZONE.BATTLEFIELD && position) {
    const otherIds = ensureZoneOrder(maps, toZone.id, toZone.cardIds).toArray().filter((id) => id !== cardId);
    for (const otherId of otherIds) {
      const otherCard = cardsCopy[otherId];
      if (!otherCard) continue;

      if (positionsRoughlyEqual(otherCard.position, newPosition)) {
        let candidateY = otherCard.position.y + GRID_STEP_Y;
        const candidateX = newPosition.x;
        let occupied = true;
        while (occupied) {
          occupied = false;
          for (const checkId of otherIds) {
            if (checkId === otherId) continue;
            const checkCard = cardsCopy[checkId];
            if (!checkCard) continue;
            if (positionsRoughlyEqual(checkCard.position, { x: candidateX, y: candidateY })) {
              candidateY += GRID_STEP_Y;
              occupied = true;
              break;
            }
          }
        }
        cardsCopy[otherId] = { ...otherCard, position: clampNormalizedPosition({ ...otherCard.position, x: candidateX, y: candidateY }) };
      }
    }
  }

  // Apply collision adjustments back
  Object.entries(cardsCopy).forEach(([id, c]) => {
    if (maps.cards.get(id)) {
      writeCard(maps, c);
    }
  });

  // Remove from old zone
  const fromOrder = ensureZoneOrder(maps, fromZoneId, fromZone.cardIds);
  removeFromOrder(fromOrder, cardId);
  const nextCounters = enforceZoneCounterRules(card.counters, toZone);
  const nextCard = leavingBattlefield ? resetToFront : card;
  const movingWithinSameZone = fromZoneId === toZoneId;
  const nextCardState = {
    ...nextCard,
    zoneId: toZoneId,
    position: newPosition,
    tapped: toZone.type === ZONE.BATTLEFIELD ? card.tapped : false,
    counters: nextCounters,
  };

  // If we're staying in the same zone, just move and ensure the id isn't duplicated
  const toOrder = ensureZoneOrder(maps, toZoneId, toZone.cardIds);
  if (movingWithinSameZone) {
    toOrder.push([cardId]);
    writeCard(maps, nextCardState);
    return;
  }

  // Add to new zone
  toOrder.push([cardId]);
  writeCard(maps, nextCardState);
}

export function transformCard(maps: SharedMaps, cardId: string, faceIndex?: number) {
  const card = readCard(maps, cardId);
  if (!card) return;
  const zone = readZone(maps, card.zoneId);
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  if (!isTransformableCard(card)) return;

  const faces = getCardFaces(card);
  const targetIndex = faces.length
    ? typeof faceIndex === 'number'
      ? Math.min(Math.max(faceIndex, 0), faces.length - 1)
      : (getCurrentFaceIndex(card) + 1) % faces.length
    : 0;

  writeCard(maps, syncCardStatsToFace(card, targetIndex));
}

export function addCounterToCard(maps: SharedMaps, cardId: string, counter: { type: string; count: number; color?: string }) {
  const card = readCard(maps, cardId);
  if (!card) return;
  const zone = readZone(maps, card.zoneId);
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  const merged = mergeCounters(card.counters, counter);
  writeCard(maps, { ...card, counters: merged });
}

export function removeCounterFromCard(maps: SharedMaps, cardId: string, counterType: string) {
  const card = readCard(maps, cardId);
  if (!card) return;
  const zone = readZone(maps, card.zoneId);
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  const next = card.counters.map((c) => (c.type === counterType ? { ...c, count: c.count - 1 } : c)).filter((c) => c.count > 0);
  writeCard(maps, { ...card, counters: next });
}

export function reorderZoneCards(maps: SharedMaps, zoneId: string, orderedCardIds: string[]) {
  const zone = readZone(maps, zoneId);
  if (!zone) return;
  const unique = Array.from(new Set(orderedCardIds));
  const order = ensureZoneOrder(maps, zoneId, zone.cardIds);
  syncOrder(order, unique);
}

export function duplicateCard(maps: SharedMaps, cardId: string, newId: string) {
  const existing = readCard(maps, cardId);
  if (!existing) return;
  const zone = readZone(maps, existing.zoneId);
  if (!zone) return;
  const positionSource =
    existing.position.x > 1 || existing.position.y > 1 ? migratePositionToNormalized(existing.position) : existing.position;
  const card = { ...existing, position: positionSource };
  if (card !== existing) writeCard(maps, card);

  const basePosition = bumpPosition(clampNormalizedPosition(card.position));
  const position = findAvailablePositionNormalized(basePosition, zone.cardIds, getCardsSnapshot(maps));
  const cloned: Card = {
    ...card,
    id: newId,
    isToken: true,
    position,
    counters: card.counters.map((c) => ({ ...c })),
  };
  writeCard(maps, cloned);
  ensureZoneOrder(maps, zone.id, zone.cardIds).push([newId]);
}

export function resetDeck(maps: SharedMaps, playerId: string) {
  const snapshot = sharedSnapshot(maps);

  const libraryZone = Object.values(snapshot.zones).find(
    (z) => z.ownerId === playerId && z.type === ZONE.LIBRARY
  );
  if (!libraryZone) return;

  const isCommanderZoneType = (type: unknown) => type === ZONE.COMMANDER || type === "command";

  const libraryKeeps = (snapshot.zones[libraryZone.id]?.cardIds ?? []).filter((id) => {
    const card = snapshot.cards[id];
    return card && card.ownerId !== playerId;
  });

  const toLibrary: string[] = [];

  const ownedCards = Object.values(snapshot.cards).filter((card) => card.ownerId === playerId);
  ownedCards.forEach((card) => {
    const fromZone = snapshot.zones[card.zoneId];
    if (fromZone && fromZone.ownerId === playerId && isCommanderZoneType(fromZone.type)) {
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

    const resetCard = syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0);
    const counters = enforceZoneCounterRules(resetCard.counters, libraryZone);
    writeCard(maps, {
      ...resetCard,
      zoneId: libraryZone.id,
      tapped: false,
      faceDown: false,
      position: { x: 0, y: 0 },
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
  patchPlayer(maps, playerId, { deckLoaded: false } as any);
}

export const sharedSnapshot = (maps: SharedMaps) => {
  const players: Record<string, Player> = {};
  const zones: Record<string, Zone> = {};
  const cards: Record<string, Card> = {};
  const globalCounters: Record<string, string> = {};
  const battlefieldViewScale: Record<string, number> = {};
  const playerOrder: string[] = [];

  maps.players.forEach((_value, key) => {
    const p = readPlayer(maps, key as string);
    if (p) players[key as string] = p;
  });
  maps.zones.forEach((_value, key) => {
    const z = readZone(maps, key as string);
    if (z) zones[key as string] = z;
  });
  maps.cards.forEach((_value, key) => {
    const c = readCard(maps, key as string);
    if (c) cards[key as string] = c;
  });
  maps.globalCounters.forEach((value, key) => {
    if (typeof value === 'string') {
      globalCounters[key as string] = value;
    }
  });

  maps.battlefieldViewScale.forEach((value, key) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      battlefieldViewScale[key as string] = value;
    }
  });

  maps.playerOrder.forEach((id) => {
    if (typeof id === 'string') {
      playerOrder.push(id);
    }
  });

  return { players, zones, cards, globalCounters, battlefieldViewScale, playerOrder };
};
