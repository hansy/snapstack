import * as Y from 'yjs';

import type { Counter } from '@/types';
import type { ScryfallCardFaceLite, ScryfallCardLite } from '@/types/scryfallLite';
import { isFullScryfallCard, toScryfallCardLite } from '@/types/scryfallLite';
import {
  MAX_COUNTERS,
  MAX_COUNTER_COLOR_LENGTH,
  MAX_COUNTER_TYPE_LENGTH,
  MAX_IMAGE_URL_LENGTH,
  MAX_NAME_LENGTH,
} from '../sanitizeLimits';

export type SharedMaps = {
  players: Y.Map<unknown>;
  playerOrder: Y.Array<string>;
  zones: Y.Map<unknown>;
  cards: Y.Map<unknown>;
  zoneCardOrders: Y.Map<Y.Array<string>>;
  globalCounters: Y.Map<unknown>;
  battlefieldViewScale: Y.Map<unknown>;
  meta: Y.Map<unknown>;
  handRevealsToAll: Y.Map<unknown>;
  libraryRevealsToAll: Y.Map<unknown>;
  faceDownRevealsToAll: Y.Map<unknown>;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const readValue = (source: unknown, key: string): unknown => {
  if (source instanceof Y.Map) return source.get(key);
  if (isRecord(source)) return source[key];
  return undefined;
};

export const clampString = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return value.length > max ? value.slice(0, max) : value;
};

export const sanitizeImageUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  // Avoid syncing huge embedded images.
  if (value.startsWith('data:')) return undefined;
  return value.length > MAX_IMAGE_URL_LENGTH ? value.slice(0, MAX_IMAGE_URL_LENGTH) : value;
};

export const sanitizeCountersForSync = (value: unknown): Counter[] => {
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

export const normalizeScryfallLiteForSync = (value: unknown): ScryfallCardLite | undefined => {
  if (!isRecord(value)) return undefined;
  const card = value;
  if (isFullScryfallCard(card)) return toScryfallCardLite(card);

  const id = typeof card.id === 'string' ? card.id : undefined;
  const layout = typeof card.layout === 'string' ? card.layout : undefined;
  if (!id || !layout) return undefined;

  // If the object already looks like a safe lite payload, preserve reference to avoid rewrite churn.
  const allowedKeys = new Set(['id', 'layout', 'cmc', 'image_uris', 'card_faces']);
  const topKeys = Object.keys(card);
  const hasExtraTopKeys = topKeys.some((k) => !allowedKeys.has(k));
  if (!hasExtraTopKeys) return card as unknown as ScryfallCardLite;

  const lite: ScryfallCardLite = { id, layout };
  if (typeof card.cmc === 'number' && Number.isFinite(card.cmc)) {
    lite.cmc = card.cmc;
  }

  if (isRecord(card.image_uris)) {
    const normal = sanitizeImageUrl(card.image_uris.normal);
    const art_crop = sanitizeImageUrl(card.image_uris.art_crop);
    if (normal || art_crop) lite.image_uris = { normal, art_crop };
  }

  if (Array.isArray(card.card_faces)) {
    const faces = card.card_faces
      .filter((face): face is Record<string, unknown> & { name: string } => isRecord(face) && typeof face.name === 'string')
      .slice(0, 8)
      .map((face): ScryfallCardFaceLite => {
        const liteFace: ScryfallCardFaceLite = { name: face.name.slice(0, MAX_NAME_LENGTH) };
        if (isRecord(face.image_uris)) {
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

export const ensureChildMap = (parent: Y.Map<unknown>, key: string): Y.Map<any> => {
  const existing = parent.get(key);
  if (existing instanceof Y.Map) return existing;
  const next = new Y.Map();
  parent.set(key, next);
  return next;
};

export const ensureZoneOrder = (maps: SharedMaps, zoneId: string, seed?: string[]): Y.Array<string> => {
  const existing = maps.zoneCardOrders.get(zoneId);
  if (existing instanceof Y.Array) return existing;
  const next = new Y.Array<string>();
  const initial = seed ? Array.from(new Set(seed.filter((id): id is string => typeof id === 'string'))) : [];
  if (initial.length) next.insert(0, initial);
  maps.zoneCardOrders.set(zoneId, next);
  return next;
};

export const removeFromOrder = (order: Y.Array<string>, cardId: string) => {
  for (let i = order.length - 1; i >= 0; i--) {
    if (order.get(i) === cardId) {
      order.delete(i, 1);
    }
  }
};

export const syncOrder = (order: Y.Array<string>, ids: string[]) => {
  order.delete(0, order.length);
  if (ids.length) {
    order.insert(0, ids);
  }
};

export const writeCounters = (target: Y.Map<any>, counters: Counter[]) => {
  const seen = new Set<string>();
  counters.forEach((c) => {
    seen.add(c.type);
    const existing = target.get(c.type);
    const next = { type: c.type, count: c.count, color: c.color };
    const same =
      isRecord(existing) && existing.type === next.type && existing.count === next.count && existing.color === next.color;
    if (!same) target.set(c.type, next);
  });
  target.forEach((_value, key) => {
    if (!seen.has(key as string)) target.delete(key as string);
  });
};

export const readCounters = (target: unknown): Counter[] => {
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

export const readCommanderDamage = (source: unknown): Record<string, number> => {
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
