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
import type { ScryfallCardLite } from '../types/scryfallLite';
import { isFullScryfallCard, toScryfallCardLite } from '../types/scryfallLite';

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

// Write-time sync limits. These are intentionally conservative to keep
// Yjs updates bounded even if UI accidentally passes large blobs.
const MAX_NAME_LENGTH = 120;
const MAX_TYPE_LINE_LENGTH = 240;
const MAX_ORACLE_TEXT_LENGTH = 2_000;
const MAX_IMAGE_URL_LENGTH = 1_024;
const MAX_SCRYFALL_ID_LENGTH = 64;
const MAX_CUSTOM_TEXT_LENGTH = 280;
const MAX_COUNTER_TYPE_LENGTH = 64;
const MAX_COUNTER_COLOR_LENGTH = 32;
const MAX_COUNTERS = 24;
const MAX_PLAYER_NAME_LENGTH = 120;
const MAX_PLAYER_COLOR_LENGTH = 16;
const MAX_REVEALED_TO = 8;

const clampString = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return value.length > max ? value.slice(0, max) : value;
};

const sanitizeImageUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  // Avoid syncing huge embedded images.
  if (value.startsWith('data:')) return undefined;
  return value.length > MAX_IMAGE_URL_LENGTH ? value.slice(0, MAX_IMAGE_URL_LENGTH) : value;
};

const sanitizeCountersForSync = (value: unknown): Counter[] => {
  if (!Array.isArray(value)) return [];
  const result: Counter[] = [];
  for (const raw of value) {
    if (!raw || typeof raw.type !== 'string') continue;
    const type = raw.type.slice(0, MAX_COUNTER_TYPE_LENGTH);
    if (!type) continue;
    const countRaw = typeof raw.count === 'number' && Number.isFinite(raw.count) ? Math.floor(raw.count) : 0;
    const count = Math.max(0, Math.min(999, countRaw));
    const next: Counter = { type, count };
    if (typeof raw.color === 'string') next.color = raw.color.slice(0, MAX_COUNTER_COLOR_LENGTH);
    result.push(next);
    if (result.length >= MAX_COUNTERS) break;
  }
  return result;
};

const normalizeScryfallLiteForSync = (value: unknown): ScryfallCardLite | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const card = value as any;
  if (isFullScryfallCard(card)) return toScryfallCardLite(card);

  const id = typeof card.id === 'string' ? card.id : undefined;
  const layout = typeof card.layout === 'string' ? card.layout : undefined;
  if (!id || !layout) return undefined;

  // If the object already looks like a safe lite payload, preserve reference to avoid rewrite churn.
  const allowedKeys = new Set(['id', 'layout', 'cmc', 'image_uris', 'card_faces']);
  const topKeys = Object.keys(card);
  const hasExtraTopKeys = topKeys.some((k) => !allowedKeys.has(k));
  if (!hasExtraTopKeys) return card as ScryfallCardLite;

  const lite: ScryfallCardLite = { id, layout };
  if (typeof card.cmc === 'number' && Number.isFinite(card.cmc)) {
    lite.cmc = card.cmc;
  }

  if (card.image_uris && typeof card.image_uris === 'object') {
    const normal = sanitizeImageUrl(card.image_uris.normal);
    const art_crop = sanitizeImageUrl(card.image_uris.art_crop);
    if (normal || art_crop) lite.image_uris = { normal, art_crop };
  }

  if (Array.isArray(card.card_faces)) {
    const faces = card.card_faces
      .filter((face: any) => face && typeof face === 'object' && typeof face.name === 'string')
      .slice(0, 8)
      .map((face: any) => {
        const liteFace: any = { name: face.name.slice(0, MAX_NAME_LENGTH) };
        if (face.image_uris && typeof face.image_uris === 'object') {
          const normal = sanitizeImageUrl(face.image_uris.normal);
          const art_crop = sanitizeImageUrl(face.image_uris.art_crop);
          if (normal || art_crop) liteFace.image_uris = { normal, art_crop };
        }
        if (typeof face.power === 'string') liteFace.power = face.power.slice(0, 16);
        if (typeof face.toughness === 'string') liteFace.toughness = face.toughness.slice(0, 16);
        return liteFace;
      });
    if (faces.length) lite.card_faces = faces;
  }

  return lite;
};

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
    const existing = target.get(c.type);
    const next = { type: c.type, count: c.count, color: c.color };
    const same =
      existing &&
      typeof existing === 'object' &&
      (existing as any).type === next.type &&
      (existing as any).count === next.count &&
      (existing as any).color === next.color;
    if (!same) target.set(c.type, next);
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
  target.set('name', clampString(player.name, MAX_PLAYER_NAME_LENGTH));
  target.set('life', player.life);
  target.set('color', clampString(player.color, MAX_PLAYER_COLOR_LENGTH));
  target.set('cursor', player.cursor);
  target.set('commanderTax', player.commanderTax);
  target.set('deckLoaded', player.deckLoaded);
  target.set('counters', sanitizeCountersForSync(player.counters));
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
  const counters = sanitizeCountersForSync(card.counters);
  writeCounters(countersMap, counters);

  const name = (card.name || 'Card').slice(0, MAX_NAME_LENGTH);
  const imageUrl = sanitizeImageUrl(card.imageUrl);
  const oracleText = clampString(card.oracleText, MAX_ORACLE_TEXT_LENGTH);
  const typeLine = clampString(card.typeLine, MAX_TYPE_LINE_LENGTH);
  const scryfallId = clampString(card.scryfallId, MAX_SCRYFALL_ID_LENGTH);
  const scryfall = normalizeScryfallLiteForSync(card.scryfall);
  const customText = clampString(card.customText, MAX_CUSTOM_TEXT_LENGTH);

  target.set('id', card.id);
  target.set('ownerId', card.ownerId);
  target.set('controllerId', card.controllerId);
  target.set('zoneId', card.zoneId);
  target.set('tapped', card.tapped);
  target.set('faceDown', card.faceDown);
  target.set('knownToAll', Boolean(card.knownToAll));
  target.set('revealedToAll', Boolean(card.revealedToAll));
  const revealedTo = Array.isArray(card.revealedTo)
    ? Array.from(new Set(card.revealedTo.filter((id) => typeof id === 'string'))).slice(0, MAX_REVEALED_TO)
    : undefined;
  if (revealedTo === undefined) target.delete('revealedTo');
  else target.set('revealedTo', revealedTo);
  target.set('currentFaceIndex', card.currentFaceIndex ?? 0);
  target.set('position', normalizedPosition);
  target.set('rotation', card.rotation);
  target.set('name', name);
  target.set('imageUrl', imageUrl);
  target.set('oracleText', oracleText);
  target.set('typeLine', typeLine);
  target.set('scryfallId', scryfallId);
  target.set('scryfall', scryfall);
  target.set('isToken', card.isToken);
  target.set('power', clampString(card.power, 16));
  target.set('toughness', clampString(card.toughness, 16));
  target.set('basePower', clampString(card.basePower, 16));
  target.set('baseToughness', clampString(card.baseToughness, 16));
  target.set('customText', customText);

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
  const rawPosition = getVal('position');
  const normalizedPosition =
    rawPosition && typeof rawPosition.x === 'number' && typeof rawPosition.y === 'number'
      ? rawPosition.x > 1 || rawPosition.y > 1
        ? migratePositionToNormalized(rawPosition)
        : clampNormalizedPosition(rawPosition)
      : { x: 0.5, y: 0.5 };
  return {
    id: cardId,
    ownerId: getVal('ownerId'),
    controllerId: getVal('controllerId'),
    zoneId: getVal('zoneId'),
    tapped: getVal('tapped'),
    faceDown: getVal('faceDown'),
    knownToAll: getVal('knownToAll'),
    revealedToAll: getVal('revealedToAll'),
    revealedTo: getVal('revealedTo'),
    currentFaceIndex: getVal('currentFaceIndex'),
    position: normalizedPosition,
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

export type CardPatch = Partial<
  Pick<
    Card,
    | 'tapped'
    | 'faceDown'
    | 'knownToAll'
    | 'revealedToAll'
    | 'revealedTo'
    | 'controllerId'
    | 'rotation'
    | 'currentFaceIndex'
    | 'position'
    | 'counters'
    | 'power'
    | 'toughness'
    | 'basePower'
    | 'baseToughness'
    | 'customText'
  >
>;

const ensureCardMap = (maps: SharedMaps, cardId: string): Y.Map<any> | null => {
  const existing = maps.cards.get(cardId);
  if (existing instanceof Y.Map) return existing;

  const card = readCard(maps, cardId);
  if (!card) return null;

  // Migrate legacy plain-object card into a Y.Map while preserving fields.
  const next = new Y.Map<any>();
  maps.cards.set(cardId, next);
  writeCard(maps, card);
  return maps.cards.get(cardId) as Y.Map<any>;
};

const setIfChanged = (target: Y.Map<any>, key: string, value: any) => {
  const prev = target.get(key);
  if (value === undefined) {
    if (prev !== undefined) target.delete(key);
    return;
  }
  if (key === 'position' && prev && typeof prev === 'object' && typeof value === 'object') {
    const px = (prev as any).x;
    const py = (prev as any).y;
    const vx = (value as any).x;
    const vy = (value as any).y;
    if (typeof px === 'number' && typeof py === 'number' && typeof vx === 'number' && typeof vy === 'number') {
      if (px === vx && py === vy) return;
    }
  } else if (prev === value) {
    return;
  }
  target.set(key, value);
};

export function patchCard(maps: SharedMaps, cardId: string, updates: CardPatch) {
  const target = ensureCardMap(maps, cardId);
  if (!target) return;

  if ('tapped' in updates) setIfChanged(target, 'tapped', updates.tapped);
  if ('faceDown' in updates) setIfChanged(target, 'faceDown', updates.faceDown);
  if ('knownToAll' in updates) setIfChanged(target, 'knownToAll', updates.knownToAll);
  if ('revealedToAll' in updates) setIfChanged(target, 'revealedToAll', updates.revealedToAll);
  if ('revealedTo' in updates) {
    const next =
      updates.revealedTo === undefined
        ? undefined
        : Array.isArray(updates.revealedTo)
          ? Array.from(new Set(updates.revealedTo.filter((id) => typeof id === 'string'))).slice(0, MAX_REVEALED_TO)
          : [];
    setIfChanged(target, 'revealedTo', next);
  }
  if ('controllerId' in updates) setIfChanged(target, 'controllerId', updates.controllerId);
  if ('rotation' in updates) setIfChanged(target, 'rotation', updates.rotation);
  if ('currentFaceIndex' in updates) setIfChanged(target, 'currentFaceIndex', updates.currentFaceIndex ?? 0);
  if ('customText' in updates) setIfChanged(target, 'customText', clampString(updates.customText, MAX_CUSTOM_TEXT_LENGTH));
  if ('power' in updates) setIfChanged(target, 'power', clampString(updates.power, 16));
  if ('toughness' in updates) setIfChanged(target, 'toughness', clampString(updates.toughness, 16));
  if ('basePower' in updates) setIfChanged(target, 'basePower', clampString(updates.basePower, 16));
  if ('baseToughness' in updates) setIfChanged(target, 'baseToughness', clampString(updates.baseToughness, 16));

  if ('position' in updates && updates.position) {
    const normalized =
      updates.position.x > 1 || updates.position.y > 1
        ? migratePositionToNormalized(updates.position)
        : clampNormalizedPosition(updates.position);
    setIfChanged(target, 'position', normalized);
  }

  if ('counters' in updates) {
    const zoneId = target.get('zoneId') as string | undefined;
    const zone = zoneId ? readZone(maps, zoneId) : null;
    const nextCounters = enforceZoneCounterRules(sanitizeCountersForSync(updates.counters), zone || undefined);
    const countersMap = ensureChildMap(target, 'counters');
    writeCounters(countersMap, nextCounters);
  }
}

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
  const card = readCard(maps, cardId);
  if (!card) return;

  const fromZoneId = card.zoneId;
  const fromZone = readZone(maps, fromZoneId);
  const toZone = readZone(maps, toZoneId);
  if (!fromZone || !toZone) return;

  // Ensure we operate on a Y.Map-backed card (migrates legacy plain objects).
  // Do this before touching zone order so migration doesn't re-add the card after we remove it.
  const target = ensureCardMap(maps, cardId);
  if (!target) return;

  const normalizedInput = position
    ? position.x > 1 || position.y > 1
      ? migratePositionToNormalized(position)
      : clampNormalizedPosition(position)
    : undefined;
  const newPosition = clampNormalizedPosition(normalizedInput ?? card.position);

  const leavingBattlefield = fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;

  // If moving to battlefield with an explicit position, resolve collisions by shifting any exact-overlap cards down.
  if (toZone.type === ZONE.BATTLEFIELD && position) {
    const toOrder = ensureZoneOrder(maps, toZone.id, toZone.cardIds);
    const otherIds = toOrder.toArray().filter((id) => id !== cardId);
    const key = (p: { x: number; y: number }) => `${p.x.toFixed(4)}:${p.y.toFixed(4)}`;
    const occupied = new Set<string>();
    const positions: Record<string, { x: number; y: number }> = {};

    for (const otherId of otherIds) {
      const otherCard = readCard(maps, otherId);
      if (!otherCard) continue;
      positions[otherId] = otherCard.position;
      occupied.add(key(otherCard.position));
    }

    const reserved = key(newPosition);
    occupied.add(reserved);

    const moved: Array<{ id: string; position: { x: number; y: number } }> = [];
    for (const otherId of otherIds) {
      const otherPos = positions[otherId];
      if (!otherPos) continue;
      if (!positionsRoughlyEqual(otherPos, newPosition)) continue;

      const oldKey = key(otherPos);
      let candidate = clampNormalizedPosition({ x: newPosition.x, y: otherPos.y + GRID_STEP_Y });
      let attempts = 0;
      while (occupied.has(key(candidate)) && attempts < 200) {
        candidate = clampNormalizedPosition({ x: candidate.x, y: candidate.y + GRID_STEP_Y });
        attempts += 1;
      }
      if (attempts >= 200) continue;

      if (oldKey !== reserved) occupied.delete(oldKey);
      occupied.add(key(candidate));
      positions[otherId] = candidate;
      moved.push({ id: otherId, position: candidate });
    }

    moved.forEach(({ id, position }) => patchCard(maps, id, { position }));
  }

  // Update zone order first.
  const fromOrder = ensureZoneOrder(maps, fromZoneId, fromZone.cardIds);
  removeFromOrder(fromOrder, cardId);
  const toOrder = ensureZoneOrder(maps, toZoneId, toZone.cardIds);
  removeFromOrder(toOrder, cardId);
  toOrder.push([cardId]);

  // Patch card state without rewriting identity fields.
  setIfChanged(target, 'zoneId', toZoneId);

  const nextCounters = enforceZoneCounterRules(card.counters, toZone);
  const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;

  if (leavingBattlefield) {
    const resetToFront = syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0);
    patchCard(maps, cardId, {
      position: newPosition,
      tapped: nextTapped,
      counters: nextCounters,
      currentFaceIndex: 0,
      power: resetToFront.power,
      toughness: resetToFront.toughness,
      basePower: resetToFront.basePower,
      baseToughness: resetToFront.baseToughness,
    });
    return;
  }

  patchCard(maps, cardId, { position: newPosition, tapped: nextTapped, counters: nextCounters });
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

  const next = syncCardStatsToFace(card, targetIndex);
  patchCard(maps, cardId, {
    currentFaceIndex: next.currentFaceIndex,
    power: next.power,
    toughness: next.toughness,
    basePower: next.basePower,
    baseToughness: next.baseToughness,
  });
}

export function addCounterToCard(maps: SharedMaps, cardId: string, counter: { type: string; count: number; color?: string }) {
  const card = readCard(maps, cardId);
  if (!card) return;
  const zone = readZone(maps, card.zoneId);
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  const merged = mergeCounters(card.counters, counter);
  patchCard(maps, cardId, { counters: merged });
}

export function removeCounterFromCard(maps: SharedMaps, cardId: string, counterType: string) {
  const card = readCard(maps, cardId);
  if (!card) return;
  const zone = readZone(maps, card.zoneId);
  if (!zone || zone.type !== ZONE.BATTLEFIELD) return;
  const next = card.counters.map((c) => (c.type === counterType ? { ...c, count: c.count - 1 } : c)).filter((c) => c.count > 0);
  patchCard(maps, cardId, { counters: next });
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
