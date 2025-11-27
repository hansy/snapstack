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
import { buildZoneMoveActions } from "../context/menu";
import { ZONE } from "../../../constants/zones";

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

    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        items: ContextMenuItem[];
        title?: string;
    } | null>(null);

    const containerRef = React.useRef<HTMLDivElement>(null);

    const zone = zoneId ? zones[zoneId] : null;

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

    const handleContextMenu = (e: React.MouseEvent, card: Card) => {
        e.preventDefault();
        if (!zone) return;

        const items: ContextMenuItem[] = zone
            ? buildZoneMoveActions(card, zone, zones, moveCard, moveCardToBottom)
            : [];

        if (items.length > 0 && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setContextMenu({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                items,
                title: card.name
            });
        }
    };

    if (!zone) return null;

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
                                            <div className="relative flex-1 overflow-y-auto overflow-x-hidden flex flex-col pb-[250px]">
                                                {cardsInGroup.map((card, index) => (
                                                    <div
                                                        key={card.id}
                                                        className="w-[180px] mx-auto transition-all duration-200 hover:z-[100] hover:scale-110 hover:!mb-4"
                                                        style={{
                                                            height: `${CARD_HEIGHT}px`,
                                                            marginBottom: `-${OVERLAP}px`,
                                                            zIndex: index,
                                                        }}
                                                    >
                                                        <CardView
                                                            card={card}
                                                            faceDown={false}
                                                            className="w-full shadow-lg h-full"
                                                            imageClassName="object-top"
                                                            onContextMenu={(e) => handleContextMenu(e, card)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            // Linear View
                            <div className="flex h-full items-center overflow-x-auto px-4 pb-4 pr-[220px]">
                                {displayCards.map((card, index) => (
                                    <div
                                        key={card.id}
                                        className="shrink-0 w-[50px] transition-all duration-200 hover:scale-110 hover:z-[100] hover:w-[200px]"
                                        style={{ zIndex: index }}
                                    >
                                        <CardView
                                            card={card}
                                            faceDown={false}
                                            className="w-[200px] shadow-lg h-auto aspect-[2.5/3.5]"
                                            imageClassName="object-top"
                                            onContextMenu={(e) => handleContextMenu(e, card)}
                                        />
                                    </div>
                                ))}
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
