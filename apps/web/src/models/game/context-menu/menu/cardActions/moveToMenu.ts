import type { Card, CardId, FaceDownMode, PlayerId, ViewerRole, Zone, ZoneId } from "@/types";

import { ZONE, ZONE_LABEL } from "@/constants/zones";
import { getPlayerZones } from "@/lib/gameSelectors";
import { canMoveCard } from "@/rules/permissions";

import type { ContextMenuItem } from "../types";

type MoveCardFn = (
  cardId: CardId,
  toZoneId: ZoneId,
  position?: { x: number; y: number },
  actorId?: PlayerId,
  isRemote?: boolean,
  opts?: {
    suppressLog?: boolean;
    faceDown?: boolean;
    faceDownMode?: FaceDownMode;
    skipCollision?: boolean;
  }
) => void;

type BuildMoveToMenuParams = {
  card: Card;
  currentZone: Zone | undefined;
  zones: Record<ZoneId, Zone>;
  myPlayerId: PlayerId;
  viewerRole?: ViewerRole;
  moveCard: MoveCardFn;
  moveCardToBottom?: (cardId: CardId, toZoneId: ZoneId) => void;
};

export const buildMoveToMenuItem = ({
  card,
  currentZone,
  zones,
  myPlayerId,
  viewerRole,
  moveCard,
  moveCardToBottom,
}: BuildMoveToMenuParams): ContextMenuItem | null => {
  if (!currentZone) return null;
  if (currentZone.type !== ZONE.HAND && currentZone.type !== ZONE.BATTLEFIELD) return null;

  const playerZones = getPlayerZones(zones, card.ownerId);
  const submenu: ContextMenuItem[] = [];

  const addIfAllowed = (targetZone: Zone | undefined, label: string, mover: () => void) => {
    if (!targetZone) return;
    const permission = canMoveCard({
      actorId: myPlayerId,
      role: viewerRole,
      card,
      fromZone: currentZone,
      toZone: targetZone,
    });
    if (permission.allowed) {
      submenu.push({ type: "action", label, onSelect: mover });
    }
  };

  if (currentZone.type !== ZONE.HAND) {
    addIfAllowed(playerZones.graveyard, ZONE_LABEL.graveyard, () =>
      moveCard(card.id, playerZones.graveyard!.id)
    );
  }
  addIfAllowed(playerZones.exile, ZONE_LABEL.exile, () =>
    moveCard(card.id, playerZones.exile!.id)
  );

  if (playerZones.library && moveCardToBottom) {
    addIfAllowed(playerZones.library, `Bottom of ${ZONE_LABEL.library}`, () =>
      moveCardToBottom(card.id, playerZones.library!.id)
    );
  }

  if (currentZone.type === ZONE.BATTLEFIELD) {
    addIfAllowed(playerZones.hand, ZONE_LABEL.hand, () =>
      moveCard(card.id, playerZones.hand!.id)
    );
  }

  if (submenu.length === 0) return null;

  return {
    type: "action",
    label: "Move to...",
    onSelect: () => {},
    submenu,
  };
};
