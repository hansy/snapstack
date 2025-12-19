import { ZONE_LABEL } from '@/constants/zones';
import { Card, CardId, PlayerId, Zone } from '@/types';
import { LogContext, LogMessagePart } from './types';

const HIDDEN_ZONE_TYPES: Zone['type'][] = ['library', 'hand'];

const isHiddenZone = (zone?: Zone) => zone ? HIDDEN_ZONE_TYPES.includes(zone.type) : false;
const isPublicZone = (zone?: Zone) => (zone ? !isHiddenZone(zone) : false);

const isFaceDownInBattlefield = (card?: Card, zone?: Zone) => zone?.type === 'battlefield' && card?.faceDown;

const shouldHideCardName = (card: Card | undefined, fromZone?: Zone, toZone?: Zone) => {
  if (!card) return true;

  const faceDown = isFaceDownInBattlefield(card, fromZone) || isFaceDownInBattlefield(card, toZone);
  if (faceDown) return true;

  const fromPublic = isPublicZone(fromZone);
  const toPublic = isPublicZone(toZone);

  // If the card is or will be in a public zone, it's safe to show its name.
  if (fromPublic || toPublic) return false;

  // Moving between hidden zones keeps the card name hidden.
  return true;
};

const resolveCardName = (card: Card) =>
  card.name ||
  card.scryfall?.card_faces?.[card.currentFaceIndex ?? 0]?.name ||
  card.scryfall?.card_faces?.[0]?.name ||
  'Card';

export const getPlayerName = (ctx: LogContext, playerId?: PlayerId) => {
  if (!playerId) return 'Unknown player';
  return ctx.players[playerId]?.name || 'Player';
};

export const getZoneLabel = (ctx: LogContext, zoneId?: string) => {
  if (!zoneId) return 'Unknown zone';
  const zone = ctx.zones[zoneId];
  if (!zone) return 'Unknown zone';
  return ZONE_LABEL[zone.type] || zone.type;
};

export const getCardDisplayName = (
  ctx: LogContext,
  cardId?: string,
  fromZone?: Zone,
  toZone?: Zone,
  fallbackName?: string,
) => {
  const card = cardId ? ctx.cards[cardId] : undefined;

  if (!card) {
    const fromPublic = isPublicZone(fromZone);
    const toPublic = isPublicZone(toZone);
    if (fromPublic || toPublic) {
      return fallbackName || 'a card';
    }
    return 'a card';
  }

  const hideName = shouldHideCardName(card, fromZone, toZone);
  if (hideName) return 'a card';

  return resolveCardName(card);
};

export const buildPlayerPart = (ctx: LogContext, playerId?: PlayerId): LogMessagePart => ({
  kind: 'player',
  text: getPlayerName(ctx, playerId),
  playerId,
});

export const buildCardPart = (
  ctx: LogContext,
  cardId?: CardId,
  fromZone?: Zone,
  toZone?: Zone,
  fallbackName?: string,
): LogMessagePart => ({
  kind: 'card',
  text: getCardDisplayName(ctx, cardId, fromZone, toZone, fallbackName),
  cardId,
});
