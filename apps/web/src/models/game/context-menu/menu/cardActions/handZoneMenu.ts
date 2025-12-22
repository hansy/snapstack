import type { Card, CardId, PlayerId, Zone, ZoneId } from "@/types";

import { getPlayerZones } from "@/lib/gameSelectors";
import { ZONE } from "@/constants/zones";
import { canMoveCard } from "@/rules/permissions";

import type { ContextMenuItem } from "../types";

type MoveCardFn = (
  cardId: CardId,
  toZoneId: ZoneId,
  position?: { x: number; y: number },
  actorId?: PlayerId,
  isRemote?: boolean,
  opts?: { suppressLog?: boolean; faceDown?: boolean; skipCollision?: boolean }
) => void;

type BuildHandZoneMenuItemsParams = {
  card: Card;
  currentZone: Zone | undefined;
  zones: Record<ZoneId, Zone>;
  myPlayerId: PlayerId;
  moveCard: MoveCardFn;
};

export const buildHandZoneMenuItems = ({
  card,
  currentZone,
  zones,
  myPlayerId,
  moveCard,
}: BuildHandZoneMenuItemsParams): ContextMenuItem[] => {
  if (currentZone?.type !== ZONE.HAND) return [];

  const items: ContextMenuItem[] = [];
  const playerZones = getPlayerZones(zones, myPlayerId);

  if (playerZones.battlefield) {
    const permission = canMoveCard({
      actorId: myPlayerId,
      card,
      fromZone: currentZone,
      toZone: playerZones.battlefield,
    });
    if (permission.allowed) {
      items.push({
        type: "action",
        label: "Play",
        onSelect: () => moveCard(card.id, playerZones.battlefield!.id),
      });
      items.push({
        type: "action",
        label: "Play facedown",
        onSelect: () =>
          moveCard(card.id, playerZones.battlefield!.id, undefined, undefined, undefined, {
            faceDown: true,
          }),
      });
    }
  }

  if (playerZones.graveyard) {
    const permission = canMoveCard({
      actorId: myPlayerId,
      card,
      fromZone: currentZone,
      toZone: playerZones.graveyard,
    });
    if (permission.allowed) {
      items.push({
        type: "action",
        label: "Discard",
        onSelect: () => moveCard(card.id, playerZones.graveyard!.id),
        danger: true,
      });
    }
  }

  return items;
};
