import type {
  Card,
  CardId,
  Player,
  PlayerId,
  ViewerRole,
  Zone,
  ZoneId,
} from "@/types";

import { getPlayerZones } from "@/lib/gameSelectors";
import { ZONE, ZONE_LABEL } from "@/constants/zones";
import { canMoveCard } from "@/rules/permissions";

import type { ContextMenuItem } from "./types";
import { buildRevealMenu } from "./reveal";

export const buildZoneMoveActions = (
  card: Card,
  currentZone: Zone,
  allZones: Record<ZoneId, Zone>,
  actorId: PlayerId,
  moveCard: (
    cardId: CardId,
    toZoneId: ZoneId,
    opts?: { faceDown?: boolean }
  ) => void,
  moveCardToBottom?: (cardId: CardId, toZoneId: ZoneId) => void,
  players?: Record<PlayerId, Player>,
  setCardReveal?: (
    cardId: CardId,
    reveal: { toAll?: boolean; to?: PlayerId[] } | null
  ) => void,
  viewerRole?: ViewerRole
): ContextMenuItem[] => {
  const playerZones = getPlayerZones(allZones, currentZone.ownerId);
  const hand = playerZones.hand;
  const battlefield = playerZones.battlefield;
  const graveyard = playerZones.graveyard;
  const exile = playerZones.exile;
  const library = playerZones.library;
  const sideboard = playerZones.sideboard;

  const items: ContextMenuItem[] = [];

  const addIfAllowed = (
    targetZone: Zone | undefined,
    label: string,
    mover: () => void,
    targetItems: ContextMenuItem[] = items
  ) => {
    if (!targetZone) return;
    const permission = canMoveCard({
      actorId,
      role: viewerRole,
      card,
      fromZone: currentZone,
      toZone: targetZone,
    });
    if (permission.allowed) {
      targetItems.push({ type: "action", label, onSelect: mover });
    }
  };

  if (currentZone.type === ZONE.LIBRARY) {
    if (setCardReveal && actorId === card.ownerId) {
      items.push(buildRevealMenu({ card, players, actorId, setCardReveal }));
    }

    const battlefieldItems: ContextMenuItem[] = [];
    if (battlefield) {
      addIfAllowed(battlefield, "Face up", () => moveCard(card.id, battlefield!.id), battlefieldItems);
      addIfAllowed(
        battlefield,
        "Face down",
        () => moveCard(card.id, battlefield!.id, { faceDown: true }),
        battlefieldItems
      );
    }
    if (battlefieldItems.length > 0) {
      items.push({
        type: "action",
        label: `Move to ${ZONE_LABEL.battlefield} ...`,
        onSelect: () => {},
        submenu: battlefieldItems,
      });
    }

    addIfAllowed(exile, `Move to ${ZONE_LABEL.exile}`, () => moveCard(card.id, exile!.id));
    addIfAllowed(graveyard, `Move to ${ZONE_LABEL.graveyard}`, () => moveCard(card.id, graveyard!.id));

    const libraryItems: ContextMenuItem[] = [];
    if (library) {
      addIfAllowed(library, "Top", () => moveCard(card.id, library.id), libraryItems);
      if (moveCardToBottom) {
        addIfAllowed(library, "Bottom", () => moveCardToBottom(card.id, library.id), libraryItems);
      }
    }
    if (libraryItems.length > 0) {
      items.push({
        type: "action",
        label: `Move to ${ZONE_LABEL.library} ...`,
        onSelect: () => {},
        submenu: libraryItems,
      });
    }

    addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () => moveCard(card.id, hand!.id));
    addIfAllowed(sideboard, `Move to ${ZONE_LABEL.sideboard}`, () =>
      moveCard(card.id, sideboard!.id)
    );
  } else if (currentZone.type === ZONE.EXILE) {
    addIfAllowed(graveyard, `Move to ${ZONE_LABEL.graveyard}`, () =>
      moveCard(card.id, graveyard!.id)
    );
    addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () =>
      moveCard(card.id, hand!.id)
    );
    addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield}`, () =>
      moveCard(card.id, battlefield!.id)
    );
    addIfAllowed(library, `Move to ${ZONE_LABEL.library}`, () =>
      moveCard(card.id, library!.id)
    );
    if (library && moveCardToBottom) {
      addIfAllowed(library, `Move to bottom of ${ZONE_LABEL.library}`, () =>
        moveCardToBottom(card.id, library.id)
      );
    }
    if (library) {
      addIfAllowed(library, `Move to top of ${ZONE_LABEL.library}`, () =>
        moveCard(card.id, library.id)
      );
    }
  } else if (currentZone.type === ZONE.GRAVEYARD) {
    addIfAllowed(exile, `Move to ${ZONE_LABEL.exile}`, () =>
      moveCard(card.id, exile!.id)
    );
    addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () =>
      moveCard(card.id, hand!.id)
    );
    addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield}`, () =>
      moveCard(card.id, battlefield!.id)
    );
    addIfAllowed(library, `Move to ${ZONE_LABEL.library}`, () =>
      moveCard(card.id, library!.id)
    );
    if (library) {
      addIfAllowed(library, `Move to top of ${ZONE_LABEL.library}`, () =>
        moveCard(card.id, library.id)
      );
    }
    if (library && moveCardToBottom) {
      addIfAllowed(library, `Move to bottom of ${ZONE_LABEL.library}`, () =>
        moveCardToBottom(card.id, library.id)
      );
    }
  } else if (currentZone.type === ZONE.SIDEBOARD) {
    addIfAllowed(library, `Move to ${ZONE_LABEL.library}`, () =>
      moveCard(card.id, library!.id)
    );
  }

  return items;
};
