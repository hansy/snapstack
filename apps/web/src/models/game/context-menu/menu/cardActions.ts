import type {
  Card,
  CardId,
  FaceDownMode,
  Player,
  PlayerId,
  ViewerRole,
  ScryfallRelatedCard,
  Zone,
  ZoneId,
} from "@/types";

import { ZONE } from "@/constants/zones";
import { canModifyCardState, canTapCard } from "@/rules/permissions";
import { canViewerSeeCardIdentity } from "@/lib/reveal";
import { canToggleCardPreviewLock } from "@/models/game/card/cardModel";
import {
  getNextTransformFace,
  getTransformVerb,
  isTransformableCard,
} from "@/lib/cardDisplay";

import type { ContextMenuItem } from "./types";
import { buildRevealMenu } from "./reveal";
import { buildCounterMenuItems } from "./cardActions/counterMenu";
import { buildHandZoneMenuItems } from "./cardActions/handZoneMenu";
import { buildMoveToMenuItem } from "./cardActions/moveToMenu";
import { getRelatedParts } from "./cardActions/relatedParts";

interface CardActionBuilderParams {
  card: Card;
  zones: Record<ZoneId, Zone>;
  players?: Record<PlayerId, Player>;
  myPlayerId: PlayerId;
  viewerRole?: ViewerRole;
  moveCard: (
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
  moveCardToBottom?: (cardId: CardId, toZoneId: ZoneId) => void;
  tapCard: (cardId: CardId) => void;
  transformCard: (cardId: CardId, faceIndex?: number) => void;
  duplicateCard: (cardId: CardId) => void;
  createRelatedCard: (card: Card, related: ScryfallRelatedCard) => void;
  addCounter: (
    cardId: CardId,
    counter: { type: string; count: number; color?: string }
  ) => void;
  removeCounter: (cardId: CardId, counterType: string) => void;
  removeCard?: (card: Card) => void;
  openAddCounterModal: (cardIds: CardId[]) => void;
  globalCounters: Record<string, string>;
  updateCard?: (cardId: CardId, updates: Partial<Card>) => void;
  openTextPrompt?: (opts: {
    title: string;
    message?: string;
    initialValue?: string;
    onSubmit: (value: string) => void;
  }) => void;
  setCardReveal?: (
    cardId: CardId,
    reveal: { toAll?: boolean; to?: PlayerId[] } | null
  ) => void;
  lockPreview?: (card: Card, anchorEl: HTMLElement) => void;
  previewAnchorEl?: HTMLElement | null;
  /** Pre-fetched related parts from full Scryfall data (tokens, meld parts, etc.) */
  relatedParts?: ScryfallRelatedCard[];
}

export const buildCardActions = ({
  card,
  zones,
  players,
  myPlayerId,
  viewerRole,
  moveCard,
  moveCardToBottom,
  tapCard,
  transformCard,
  duplicateCard,
  createRelatedCard,
  addCounter,
  removeCounter,
  removeCard,
  openAddCounterModal,
  globalCounters,
  updateCard,
  openTextPrompt,
  setCardReveal,
  lockPreview,
  previewAnchorEl,
  relatedParts: preloadedRelatedParts,
}: CardActionBuilderParams): ContextMenuItem[] => {
  const items: ContextMenuItem[] = [];
  const currentZone = zones[card.zoneId];
  const countersAllowed = currentZone?.type === ZONE.BATTLEFIELD;
  const canModify = canModifyCardState(
    { actorId: myPlayerId, role: viewerRole },
    card,
    currentZone
  );
  const canPeek = canViewerSeeCardIdentity(
    card,
    currentZone?.type,
    myPlayerId,
    viewerRole
  );
  const isNonControllerBattlefield =
    currentZone?.type === ZONE.BATTLEFIELD &&
    card.controllerId !== myPlayerId;
  const addInspectAction = () => {
    if (
      currentZone?.type === ZONE.BATTLEFIELD &&
      lockPreview &&
      previewAnchorEl &&
      canToggleCardPreviewLock({
        zoneType: currentZone?.type,
        canPeek,
        faceDown: card.faceDown,
        isDragging: false,
      })
    ) {
      items.push({
        type: "action",
        label: "Inspect",
        onSelect: () => lockPreview(card, previewAnchorEl),
      });
    }
  };

  if (isNonControllerBattlefield) {
    addInspectAction();
    if (card.ownerId === myPlayerId) {
      const moveToMenu = buildMoveToMenuItem({
        card,
        currentZone,
        zones,
        myPlayerId,
        viewerRole,
        moveCard,
        moveCardToBottom,
      });
      if (moveToMenu) {
        items.push(moveToMenu);
      }
    }
    return items;
  }

  if (
    setCardReveal &&
    currentZone &&
    (currentZone.type === ZONE.HAND || currentZone.type === ZONE.LIBRARY) &&
    myPlayerId === card.ownerId
  ) {
    items.push(
      buildRevealMenu({
        card,
        players,
        actorId: myPlayerId,
        setCardReveal,
      })
    );
  }

  const canTap = canTapCard({ actorId: myPlayerId, role: viewerRole }, card, currentZone);
  if (canTap.allowed) {
    items.push({
      type: "action",
      label: "Tap/Untap",
      onSelect: () => tapCard(card.id),
    });
  }

  addInspectAction();

  if (
    currentZone?.type === ZONE.BATTLEFIELD &&
    canModify.allowed &&
    updateCard &&
    openTextPrompt
  ) {
    items.push({
      type: "action",
      label: card.customText ? "Edit Text" : "Add Text",
      onSelect: () => {
        openTextPrompt({
          title: card.customText ? "Edit Text" : "Add Text",
          initialValue: card.customText,
          onSubmit: (value) => updateCard(card.id, { customText: value }),
        });
      },
    });
  }

  if (
    currentZone?.type === ZONE.BATTLEFIELD &&
    isTransformableCard(card) &&
    canModify.allowed
  ) {
    const nextFace = getNextTransformFace(card);
    if (nextFace) {
      const verb = getTransformVerb(card);
      items.push({
        type: "action",
        label: `${verb}: ${nextFace.face.name}`,
        onSelect: () => transformCard(card.id, nextFace.nextIndex),
      });
    }
  }

  if (currentZone?.type === ZONE.BATTLEFIELD) {
    if (canModify.allowed) {
      items.push({
        type: "action",
        label: "Duplicate",
        onSelect: () => duplicateCard(card.id),
      });
    }

    // Use pre-fetched related parts if available, otherwise try to get from card (may be empty if lite)
    const relatedParts = preloadedRelatedParts ?? getRelatedParts(card);
    if (relatedParts.length > 0) {
      const relatedItems: ContextMenuItem[] = relatedParts.map(
        (part: ScryfallRelatedCard) => {
          const isToken = part.component === "token";
          const label = `Create ${part.name}${isToken ? " token" : ""}`;
          return {
            type: "action",
            label,
            onSelect: () => createRelatedCard(card, part),
          };
        }
      );

      if (relatedItems.length === 1) {
        items.push(relatedItems[0]);
      } else {
        items.push({
          type: "action",
          label: "Create related",
          onSelect: () => {},
          submenu: relatedItems,
        });
      }
    }
  }

  if (countersAllowed && canModify.allowed) {
    items.push(
      ...buildCounterMenuItems({
        cardId: card.id,
        counters: card.counters,
        globalCounters,
        openAddCounterModal,
        addCounter,
        removeCounter,
      })
    );
  }

  if (card.isCommander && updateCard && card.ownerId === myPlayerId) {
    items.push({
      type: "action",
      label: "Remove Commander status",
      onSelect: () => updateCard(card.id, { isCommander: false }),
    });
  }

  if (card.isToken && removeCard) {
    items.push({
      type: "action",
      label: "Remove Card",
      onSelect: () => removeCard(card),
      danger: true,
    });
  }

  items.push(
    ...buildHandZoneMenuItems({
      card,
      currentZone,
      zones,
      myPlayerId,
      viewerRole,
      moveCard,
    })
  );

  const moveToMenu = buildMoveToMenuItem({
    card,
    currentZone,
    zones,
    myPlayerId,
    viewerRole,
    moveCard,
    moveCardToBottom,
  });
  if (moveToMenu) {
    items.push(moveToMenu);
  }

  if (currentZone?.type === ZONE.BATTLEFIELD && card.faceDown) {
    items.push({
      type: "action",
      label: "Flip Face Up",
      onSelect: () => {
        if (updateCard) {
          updateCard(card.id, { faceDown: false, faceDownMode: undefined });
        }
      },
    });
  }

  return items;
};
