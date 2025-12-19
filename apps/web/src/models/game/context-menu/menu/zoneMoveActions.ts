import type {
  Card,
  CardId,
  Player,
  PlayerId,
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
  moveCard: (cardId: CardId, toZoneId: ZoneId, opts?: { faceDown?: boolean }) => void,
  moveCardToBottom?: (cardId: CardId, toZoneId: ZoneId) => void,
  players?: Record<PlayerId, Player>,
  setCardReveal?: (cardId: CardId, reveal: { toAll?: boolean; to?: PlayerId[] } | null) => void
): ContextMenuItem[] => {
  const playerZones = getPlayerZones(allZones, currentZone.ownerId);
  const hand = playerZones.hand;
  const battlefield = playerZones.battlefield;
  const graveyard = playerZones.graveyard;
  const exile = playerZones.exile;
  const library = playerZones.library;

  const items: ContextMenuItem[] = [];

  const addIfAllowed = (targetZone: Zone | undefined, label: string, mover: () => void) => {
    if (!targetZone) return;
    const permission = canMoveCard({
      actorId,
      card,
      fromZone: currentZone,
      toZone: targetZone,
    });
    if (permission.allowed) {
      items.push({ type: "action", label, onSelect: mover });
    }
  };

  if (currentZone.type === ZONE.LIBRARY) {
    if (setCardReveal && actorId === card.ownerId) {
      items.push(buildRevealMenu({ card, players, actorId, setCardReveal }));
    }

    if (library && moveCardToBottom) {
      addIfAllowed(library, `Move to Bottom of ${ZONE_LABEL.library}`, () =>
        moveCardToBottom(card.id, library.id)
      );
    }
    addIfAllowed(graveyard, `Move to ${ZONE_LABEL.graveyard}`, () =>
      moveCard(card.id, graveyard!.id)
    );
    addIfAllowed(exile, `Move to ${ZONE_LABEL.exile}`, () => moveCard(card.id, exile!.id));
    addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () => moveCard(card.id, hand!.id));
    if (battlefield) {
      addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield} (face-up)`, () =>
        moveCard(card.id, battlefield!.id)
      );
      addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield} (face-down)`, () =>
        moveCard(card.id, battlefield!.id, { faceDown: true })
      );
    }
  } else if (currentZone.type === ZONE.EXILE) {
    addIfAllowed(graveyard, `Move to ${ZONE_LABEL.graveyard}`, () =>
      moveCard(card.id, graveyard!.id)
    );
    addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () => moveCard(card.id, hand!.id));
    addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield}`, () =>
      moveCard(card.id, battlefield!.id)
    );
  } else if (currentZone.type === ZONE.GRAVEYARD) {
    addIfAllowed(exile, `Move to ${ZONE_LABEL.exile}`, () => moveCard(card.id, exile!.id));
    addIfAllowed(hand, `Move to ${ZONE_LABEL.hand}`, () => moveCard(card.id, hand!.id));
    addIfAllowed(battlefield, `Move to ${ZONE_LABEL.battlefield}`, () =>
      moveCard(card.id, battlefield!.id)
    );
  }

  return items;
};

