import React, { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { useGameStore } from "../../../store/gameStore";
import { CardView } from "../Card/Card";
import { Card } from "../../../types";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import { actionRegistry } from "../context/actionsRegistry";
import { ZONE } from "../../../constants/zones";
import { canViewZone } from "../../../rules/permissions";
import { cn } from "../../../lib/utils";
import { getDisplayName } from "../../../lib/cardDisplay";

interface ZoneViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    zoneId: string | null;
    count?: number; // If set, only show top X cards
}

export const ZoneViewerModal: React.FC<ZoneViewerModalProps> = ({
    isOpen,
    onClose,
    zoneId,
    count,
}) => {
    const [filterText, setFilterText] = useState("");
    const zones = useGameStore((state) => state.zones);
    const cards = useGameStore((state) => state.cards);
    const moveCard = useGameStore((state) => state.moveCard);
    const moveCardToBottom = useGameStore((state) => state.moveCardToBottom);
    const reorderZoneCards = useGameStore((state) => state.reorderZoneCards);
    const shuffleLibrary = useGameStore((state) => state.shuffleLibrary);
    const myPlayerId = useGameStore((state) => state.myPlayerId);

    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        items: ContextMenuItem[];
        title?: string;
        cardId: string;
    } | null>(null);

    const containerRef = React.useRef<HTMLDivElement>(null);
    const [orderedCardIds, setOrderedCardIds] = useState<string[]>([]);
    const [draggingId, setDraggingId] = useState<string | null>(null);

    const zone = zoneId ? zones[zoneId] : null;
    const canView = zone ? canViewZone({ actorId: myPlayerId }, zone, { viewAll: !count }) : null;

    const viewAllLibraryOwnerRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (isOpen && zone?.type === ZONE.LIBRARY && !count) {
            viewAllLibraryOwnerRef.current = zone.ownerId;
        } else if (isOpen) {
            viewAllLibraryOwnerRef.current = null;
        }
    }, [isOpen, zone, count]);

    React.useEffect(() => {
        if (!isOpen && viewAllLibraryOwnerRef.current) {
            shuffleLibrary(viewAllLibraryOwnerRef.current, myPlayerId);
            viewAllLibraryOwnerRef.current = null;
        }
    }, [isOpen, shuffleLibrary, myPlayerId]);

    const viewMode = useMemo(() => {
        if (zone?.type === ZONE.LIBRARY && !count) return "grouped";
        return "linear";
    }, [zone, count]);

    const displayCards = useMemo(() => {
        if (!zone) return [];

        let cardIds = [...zone.cardIds];

        // If count is specified, take from the END (top of library)
        if (count && count > 0) {
            cardIds = cardIds.slice(-count);
        }

        // Map to card objects
        let currentCards = cardIds.map((id) => cards[id]).filter(Boolean);

        // For grouped view (Library View All), we usually want to see sorted by something or just all of them.
        // For linear view (Graveyard/Exile/Top X), user wants "left-most is deepest".
        // zone.cardIds is [bottom, ..., top].
        // So currentCards is already [deepest, ..., newest].
        // We ONLY reverse if we want "newest first" (which was the previous default).
        // User explicitly asked for "left-most is deepest" for linear view.
        // For grouped view, order within groups is determined by insertion order.

        // Filter
        if (filterText.trim()) {
            const lowerFilter = filterText.toLowerCase();
            currentCards = currentCards.filter((card) => {
                const nameMatch = card.name.toLowerCase().includes(lowerFilter);
                const typeMatch = card.typeLine?.toLowerCase().includes(lowerFilter);
                const oracleMatch = card.oracleText
                    ?.toLowerCase()
                    .includes(lowerFilter);
                return nameMatch || typeMatch || oracleMatch;
            });
        }

        return currentCards;
    }, [zone, cards, count, filterText]);

    React.useEffect(() => {
        setOrderedCardIds(displayCards.map((card) => card.id));
        setDraggingId(null);
    }, [zoneId, displayCards]);

    // Group by CMC, but separate Lands (Only used for 'grouped' mode)
    const groupedCards = useMemo(() => {
        if (viewMode !== "grouped") return {};

        const groups: Record<string, Card[]> = {};

        displayCards.forEach((card) => {
            if (card.typeLine?.toLowerCase().includes("land")) {
                if (!groups["Lands"]) groups["Lands"] = [];
                groups["Lands"].push(card);
            } else {
                const cmc = card.scryfall?.cmc ?? 0;
                const key = `Cost ${cmc}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(card);
            }
        });
        return groups;
    }, [displayCards, viewMode]);

    // Sort keys: Lands first, then Cost 0, Cost 1, etc.
    const sortedKeys = useMemo(() => {
        if (viewMode !== "grouped") return [];
        return Object.keys(groupedCards).sort((a, b) => {
            if (a === "Lands") return -1;
            if (b === "Lands") return 1;

            const costA = parseInt(a.replace("Cost ", ""));
            const costB = parseInt(b.replace("Cost ", ""));
            return costA - costB;
        });
    }, [groupedCards, viewMode]);

    const canReorder = viewMode === "linear" && zone?.ownerId === myPlayerId && !filterText.trim();
    const visibleCardIds = orderedCardIds.length ? orderedCardIds : displayCards.map((card) => card.id);
    const orderedCards = useMemo(() => visibleCardIds.map((id) => cards[id]).filter(Boolean), [cards, visibleCardIds]);

    const reorderList = (ids: string[], fromId: string, toId: string) => {
        if (fromId === toId) return ids;
        const next = [...ids];
        const fromIndex = next.indexOf(fromId);
        const toIndex = next.indexOf(toId);
        if (fromIndex === -1 || toIndex === -1) return ids;
        next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]);
        return next;
    };

    const commitReorder = (newOrder: string[]) => {
        if (!zone || !newOrder.length) return;
        const remainderStart = zone.cardIds.length - displayCards.length;
        const prefix = remainderStart > 0 ? zone.cardIds.slice(0, remainderStart) : [];
        const mergedOrder = prefix.length ? [...prefix, ...newOrder] : newOrder;
        reorderZoneCards(zone.id, mergedOrder, myPlayerId);
    };

    const handleContextMenu = (e: React.MouseEvent, card: Card) => {
        e.preventDefault();
        if (!zone) return;

        const items: ContextMenuItem[] = zone
            ? actionRegistry.buildZoneMoveActions(
                card,
                zone,
                zones,
                myPlayerId,
                (cardId, toZoneId, opts) => moveCard(cardId, toZoneId, undefined, myPlayerId, undefined, opts),
                (cardId, toZoneId) => moveCardToBottom(cardId, toZoneId, myPlayerId)
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
    };

    const interactionsDisabled = Boolean(contextMenu);
    const pinnedCardId = contextMenu?.cardId;

    if (!zone || (canView && !canView.allowed)) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[90vw] h-[80vh] bg-zinc-950 border-zinc-800 text-zinc-100 flex flex-col p-0 gap-0">
                <div ref={containerRef} className="w-full h-full flex flex-col relative pr-6">
                    <div className="p-6 border-b border-zinc-800">
                        <DialogHeader>
                            <DialogTitle className="text-xl capitalize flex items-center gap-2">
                                <span>{zone.type} Viewer</span>
                                <span className="text-zinc-500 text-sm font-normal">
                                    ({displayCards.length} cards)
                                </span>
                            </DialogTitle>
                            <DialogDescription className="text-zinc-400">
                                Viewing {count ? `top ${count}` : "all"} cards in {zone.type}.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="mt-4">
                            <Input
                                placeholder="Search by name, type, or text..."
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                className="bg-zinc-900 border-zinc-800 focus:ring-indigo-500"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-zinc-950/50">
                        {displayCards.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-zinc-500">
                                No cards found matching your filter.
                            </div>
                        ) : viewMode === "grouped" ? (
                            <div className="flex gap-8 h-full">
                                {sortedKeys.map((key) => {
                                    const cardsInGroup = groupedCards[key];
                                    const STACK_OFFSET = 50;
                                    const CARD_HEIGHT = 252; // Based on w-[180px] and aspect ratio
                                    const OVERLAP = CARD_HEIGHT - STACK_OFFSET; // 202px

                                    return (
                                        <div key={key} className="shrink-0 w-[200px] flex flex-col">
                                            <h3 className="text-sm font-medium text-zinc-400 border-b border-zinc-800/50 pb-2 mb-4 text-center sticky top-0 bg-zinc-950/50 backdrop-blur-sm z-10">
                                                {key} ({cardsInGroup.length})
                                            </h3>
                                            <div
                                                className="relative flex-1 overflow-y-auto overflow-x-hidden flex flex-col pb-[250px]"
                                                style={{ pointerEvents: interactionsDisabled ? 'none' : 'auto' }}
                                            >
                                                {cardsInGroup.map((card, index) => {
                                                    const isPinned = pinnedCardId === card.id;
                                                    return (
                                                        <div
                                                            key={card.id}
                                                            className={cn(
                                                                "w-[180px] mx-auto transition-all duration-200",
                                                                !interactionsDisabled && "hover:z-[100] hover:scale-110 hover:!mb-4",
                                                                isPinned && "scale-110 shadow-xl"
                                                            )}
                                                            style={{
                                                                height: `${CARD_HEIGHT}px`,
                                                                marginBottom: isPinned ? '16px' : `-${OVERLAP}px`,
                                                                zIndex: isPinned ? 200 : index,
                                                            }}
                                                        >
                                                            <CardView
                                                                card={card}
                                                                faceDown={false}
                                                                className="w-full shadow-lg h-full"
                                                                imageClassName="object-top"
                                                                preferArtCrop={false}
                                                                onContextMenu={(e) => handleContextMenu(e, card)}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            // Linear View
                            <div
                                className="flex h-full items-center overflow-x-auto px-4 pb-4 pr-[220px]"
                                style={{ pointerEvents: interactionsDisabled ? 'none' : 'auto' }}
                            >
                                {orderedCards.map((card, index) => {
                                    const isPinned = pinnedCardId === card.id;
                                    const isDragging = draggingId === card.id;
                                    return (
                                        <div
                                            key={card.id}
                                            draggable={canReorder}
                                            onDragStart={() => canReorder && setDraggingId(card.id)}
                                            onDragEnter={(e) => {
                                                if (!canReorder || !draggingId) return;
                                                e.preventDefault();
                                                setOrderedCardIds((ids) => reorderList(ids, draggingId, card.id));
                                            }}
                                            onDragOver={canReorder ? (e) => e.preventDefault() : undefined}
                                            onDragEnd={() => {
                                                if (!canReorder || !draggingId) return;
                                                commitReorder(orderedCardIds.length ? orderedCardIds : displayCards.map((c) => c.id));
                                                setDraggingId(null);
                                            }}
                                            onDrop={(e) => {
                                                if (!canReorder) return;
                                                e.preventDefault();
                                            }}
                                            className={cn(
                                                "shrink-0 w-[50px] transition-all duration-200 relative group",
                                                !interactionsDisabled && "hover:scale-110 hover:z-[100] hover:w-[200px]",
                                                isPinned && "scale-110 w-[200px]"
                                            )}
                                            style={{ zIndex: isPinned ? 200 : index, opacity: isDragging ? 0.5 : 1 }}
                                        >
                                            {index === orderedCards.length - 1 && (
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md z-[101]">
                                                    Top card
                                                </div>
                                            )}
                                            <CardView
                                                card={card}
                                                faceDown={false}
                                                className="w-[200px] shadow-lg h-auto aspect-[2.5/3.5]"
                                                imageClassName="object-top"
                                                preferArtCrop={false}
                                                onContextMenu={(e) => handleContextMenu(e, card)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {contextMenu && (
                        <ContextMenu
                            x={contextMenu.x}
                            y={contextMenu.y}
                            items={contextMenu.items}
                            onClose={() => setContextMenu(null)}
                            className="z-[100]"
                            title={contextMenu.title}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog >
    );
};
