import * as React from "react";

import type { Card } from "@/types";

import { ZONE } from "@/constants/zones";
import { useGameStore } from "@/store/gameStore";
import { canViewZone } from "@/rules/permissions";
import { actionRegistry } from "@/models/game/context-menu/actionsRegistry";
import { getDisplayName } from "@/lib/cardDisplay";
import type { ContextMenuItem } from "@/models/game/context-menu/menu";
import {
  computeZoneViewerCards,
  getZoneViewerMode,
  groupZoneViewerCards,
  sortZoneViewerGroupKeys,
} from "@/models/game/zone-viewer/zoneViewerModel";
import { mergeZoneCardOrder, reorderZoneViewerList } from "@/models/game/zone-viewer/zoneViewerReorder";

export type ZoneViewerControllerInput = {
  isOpen: boolean;
  onClose: () => void;
  zoneId: string | null;
  count?: number;
};

type ZoneViewerContextMenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  title?: string;
  cardId: string;
} | null;

export const useZoneViewerController = ({
  isOpen,
  onClose,
  zoneId,
  count,
}: ZoneViewerControllerInput) => {
  const [filterText, setFilterText] = React.useState("");
  const zones = useGameStore((state) => state.zones);
  const cards = useGameStore((state) => state.cards);
  const players = useGameStore((state) => state.players);
  const moveCard = useGameStore((state) => state.moveCard);
  const moveCardToBottom = useGameStore((state) => state.moveCardToBottom);
  const reorderZoneCards = useGameStore((state) => state.reorderZoneCards);
  const setCardReveal = useGameStore((state) => state.setCardReveal);
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const viewerRole = useGameStore((state) => state.viewerRole);

  const [contextMenu, setContextMenu] = React.useState<ZoneViewerContextMenuState>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [orderedCardIds, setOrderedCardIds] = React.useState<string[]>([]);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [frozenCardIds, setFrozenCardIds] = React.useState<string[] | null>(null);

  const zone = zoneId ? zones[zoneId] : null;
  const canView = zone
    ? canViewZone({ actorId: myPlayerId, role: viewerRole }, zone, {
        viewAll: !count,
      })
    : null;

  React.useEffect(() => {
    if (!isOpen) {
      setFilterText("");
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (!zone || zone.type !== ZONE.LIBRARY || !count || count <= 0) {
      setFrozenCardIds(null);
      return;
    }
    setFrozenCardIds(zone.cardIds.slice(-count));
  }, [isOpen, zoneId, count]);

  const viewMode = React.useMemo(() => getZoneViewerMode(zone, count), [zone, count]);

  const displayCards = React.useMemo(() => {
    if (!zone) return [];
    return computeZoneViewerCards({
      zone,
      cardsById: cards,
      count,
      frozenCardIds,
      filterText,
    });
  }, [zone, cards, count, filterText, frozenCardIds]);

  React.useEffect(() => {
    setOrderedCardIds(displayCards.map((card) => card.id));
    setDraggingId(null);
  }, [zoneId, displayCards]);

  // Group by CMC, but separate Lands (Only used for 'grouped' mode)
  const groupedCards = React.useMemo<Record<string, Card[]>>(() => {
    if (viewMode !== "grouped") return {};
    return groupZoneViewerCards(displayCards);
  }, [displayCards, viewMode]);

  // Sort keys: Lands first, then Cost 0, Cost 1, etc.
  const sortedKeys = React.useMemo<string[]>(() => {
    if (viewMode !== "grouped") return [];
    return sortZoneViewerGroupKeys(Object.keys(groupedCards));
  }, [groupedCards, viewMode]);

  const canReorder =
    viewMode === "linear" && zone?.ownerId === myPlayerId && !filterText.trim();

  const visibleCardIds = orderedCardIds.length
    ? orderedCardIds
    : displayCards.map((card) => card.id);

  const orderedCards = React.useMemo(
    () => visibleCardIds.map((id) => cards[id]).filter((card): card is Card => Boolean(card)),
    [cards, visibleCardIds]
  );

  const reorderList = React.useCallback(reorderZoneViewerList, []);

  const handleMoveCardToBottom = React.useCallback(
    (cardId: string, toZoneId: string) => {
      moveCardToBottom(cardId, toZoneId, myPlayerId);

      const scrollToBottom = () => {
        requestAnimationFrame(() => {
          const target = listRef.current;
          if (!target) return;
          if (typeof target.scrollTo === "function") {
            target.scrollTo({ left: 0, behavior: "smooth" });
            return;
          }
          target.scrollLeft = 0;
        });
      };

      if (zone?.type === ZONE.LIBRARY && count && count > 0) {
        setFrozenCardIds((ids) => (ids ? ids.filter((id) => id !== cardId) : ids));
        setOrderedCardIds((ids) => ids.filter((id) => id !== cardId));
        scrollToBottom();
        return;
      }

      if (zone?.type !== ZONE.LIBRARY || viewMode !== "linear") return;

      setOrderedCardIds((ids) => {
        const source = ids.length ? ids : displayCards.map((card) => card.id);
        if (!source.includes(cardId)) return ids;
        return [cardId, ...source.filter((id) => id !== cardId)];
      });

      scrollToBottom();
    },
    [
      count,
      displayCards,
      moveCardToBottom,
      myPlayerId,
      setFrozenCardIds,
      setOrderedCardIds,
      viewMode,
      zone?.type,
    ]
  );

  const commitReorder = React.useCallback(
    (newOrder: string[]) => {
      if (!zone || !newOrder.length) return;
      const mergedOrder = mergeZoneCardOrder({
        zoneCardIds: zone.cardIds,
        reorderedIds: newOrder,
      });
      reorderZoneCards(zone.id, mergedOrder, myPlayerId);
    },
    [myPlayerId, reorderZoneCards, zone]
  );

  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent, card: Card) => {
      e.preventDefault();
      if (!zone) return;

      const items: ContextMenuItem[] = zone
        ? actionRegistry.buildZoneMoveActions(
            card,
            zone,
            zones,
            myPlayerId,
            (cardId, toZoneId, opts) =>
              moveCard(cardId, toZoneId, undefined, myPlayerId, undefined, opts),
            handleMoveCardToBottom,
            players,
            (cardId, reveal) => setCardReveal(cardId, reveal, myPlayerId),
            viewerRole
          )
        : [];

      if (items.length > 0 && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContextMenu({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          items,
          title: getDisplayName(card),
          cardId: card.id,
        });
      }
    },
    [
      moveCard,
      moveCardToBottom,
      myPlayerId,
      players,
      setCardReveal,
      viewerRole,
      zone,
      zones,
      handleMoveCardToBottom,
    ]
  );

  const closeContextMenu = React.useCallback(() => setContextMenu(null), []);

  const interactionsDisabled = Boolean(contextMenu);
  const pinnedCardId = contextMenu?.cardId;

  if (!zone || (canView && !canView.allowed)) return null;

  return {
    isOpen,
    onClose,
    count,
    zone,
    filterText,
    setFilterText,
    containerRef,
    listRef,
    displayCards,
    viewMode,
    groupedCards,
    sortedKeys,
    canReorder,
    orderedCards,
    orderedCardIds,
    setOrderedCardIds,
    draggingId,
    setDraggingId,
    reorderList,
    commitReorder,
    handleContextMenu,
    contextMenu,
    closeContextMenu,
    interactionsDisabled,
    pinnedCardId,
  };
};

export type ZoneViewerController = NonNullable<ReturnType<typeof useZoneViewerController>>;
