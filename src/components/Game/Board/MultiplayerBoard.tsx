import React, { useState } from 'react';
import { toast } from 'sonner';
import { DndContext, DragOverlay, getClientRect, useDndMonitor } from '@dnd-kit/core';
import { useGameStore } from '../../../store/gameStore';
import { useDragStore } from '../../../store/dragStore';
import { Seat } from '../Seat/Seat';
import { CardView } from '../Card/Card';
import { Sidenav } from '../UI/Sidenav';
import { ContextMenu } from '../UI/ContextMenu';
import { LoadDeckModal } from '../UI/LoadDeckModal';
import { TokenCreationModal } from '../UI/TokenCreationModal';
import { AddCounterModal } from '../UI/AddCounterModal';
import { useGameDnD } from '../../../hooks/useGameDnD';
import { usePlayerLayout } from '../../../hooks/usePlayerLayout';
import { ZoneViewerModal } from '../UI/ZoneViewerModal';
import { ZONE } from '../../../constants/zones';
import { CardPreviewProvider } from '../Card/CardPreviewProvider';
import { useGameContextMenu } from '../../../hooks/useGameContextMenu';
import { NumberPromptDialog } from '../UI/NumberPromptDialog';
import { LogDrawer } from '../UI/LogDrawer';
import { useYjsSync } from '../../../hooks/useYjsSync';
import { useNavigate } from '@tanstack/react-router';



const DragMonitor = () => {
    useDndMonitor({
        onDragMove() {
            // Debug logging removed.
        }
    });

    return null;
};



interface MultiplayerBoardProps {
    sessionId: string;
}

export const MultiplayerBoard: React.FC<MultiplayerBoardProps> = ({ sessionId }) => {
    const navigate = useNavigate();
    const zones = useGameStore((state) => state.zones);
    const cards = useGameStore((state) => state.cards);
    const activeModal = useGameStore((state) => state.activeModal);
    const setActiveModal = useGameStore((state) => state.setActiveModal);
    const activeCardId = useDragStore((state) => state.activeCardId);
    const { sensors, handleDragStart, handleDragMove, handleDragEnd } = useGameDnD();

    const { slots, layoutMode, myPlayerId } = usePlayerLayout();


    useYjsSync(sessionId);
    const seededRef = React.useRef(false);

    const [zoneViewerState, setZoneViewerState] = useState<{ isOpen: boolean; zoneId: string | null; count?: number }>({
        isOpen: false,
        zoneId: null
    });

    const handleViewZone = (zoneId: string, count?: number) => {
        setZoneViewerState({ isOpen: true, zoneId, count });
    };

    const handleLeave = () => {
        useGameStore.getState().resetSession();
        navigate({ to: '/' });
    };

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            toast.success('Link copied to clipboard');
        } catch (err) {
            console.error('Failed to copy link', err);
            toast.error('Failed to copy link');
        }
    };

    // Debugging moved to DragMonitor component
    const { contextMenu, handleCardContextMenu, handleZoneContextMenu, handleBattlefieldContextMenu, closeContextMenu, countPrompt, closeCountPrompt } = useGameContextMenu(myPlayerId, handleViewZone);
    const hasHydrated = useGameStore((state) => state.hasHydrated);

    const [isLoadDeckModalOpen, setIsLoadDeckModalOpen] = useState(false);
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
    const [isLogOpen, setIsLogOpen] = useState(false);

    // Auto-initialize if player is missing (e.g. after reset)
    React.useEffect(() => {
        if (!hasHydrated) return;
        if (seededRef.current) return;

        const state = useGameStore.getState();
        const players = state.players;

        // Seed when our player is missing. If already present (local or remote), do nothing.
        if (players[myPlayerId]) {
            seededRef.current = true;
            return;
        }

        const { addPlayer, addZone } = state;
        const label = `Player ${myPlayerId.slice(0, 4).toUpperCase()}`;
        addPlayer({
            id: myPlayerId,
            name: label,
            life: 40,
            counters: [],
            commanderDamage: {},
            commanderTax: 0,
        });

        const zoneTypes = [ZONE.LIBRARY, ZONE.HAND, ZONE.BATTLEFIELD, ZONE.GRAVEYARD, ZONE.EXILE, ZONE.COMMANDER] as const;
        zoneTypes.forEach(type => {
            addZone({
                id: `${myPlayerId}-${type}`,
                type,
                ownerId: myPlayerId,
                cardIds: []
            });
        });

        seededRef.current = true;
    }, [myPlayerId, hasHydrated]);

    const getGridClass = () => {
        switch (layoutMode) {
            case 'single': return 'grid-cols-1 grid-rows-1';
            case 'split': return 'grid-cols-1 grid-rows-2';
            case 'quadrant': return 'grid-cols-2 grid-rows-2';
            default: return 'grid-cols-1 grid-rows-1';
        }
    };

    // Create a map of player ID -> Color for the LifeBox
    const playerColors = React.useMemo(() => {
        const colors: Record<string, string> = {};
        slots.forEach(slot => {
            if (slot.player) {
                colors[slot.player.id] = slot.color;
            }
        });
        return colors;
    }, [slots]);

    // Dynamic Scaling Logic
    const [scale, setScale] = useState(1);

    React.useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            // Determine slot size based on layoutMode
            let slotWidth = width;
            let slotHeight = height;

            if (layoutMode === 'split') {
                slotHeight = height / 2;
            } else if (layoutMode === 'quadrant') {
                slotWidth = width / 2;
                slotHeight = height / 2;
            }

            // Base dimensions that "fit" the UI comfortably
            // Sidebar needs ~500px height (LifeBox + 3 Zones + Gaps)
            // Width needs ~900px for Sidebar + Battlefield
            const BASE_WIDTH = 1000;
            const BASE_HEIGHT = 600;

            const scaleX = slotWidth / BASE_WIDTH;
            const scaleY = slotHeight / BASE_HEIGHT;

            // Calculate scale to fit the content
            // We cap at 1.0 to prevent the UI from becoming too large on big screens
            // We set a floor of 0.5 to prevent it from becoming unreadable
            let newScale = Math.min(scaleX, scaleY);
            newScale = Math.min(newScale, 1);
            newScale = Math.max(newScale, 0.5);

            setScale(newScale);
        };

        window.addEventListener('resize', handleResize);
        handleResize(); // Initial calculation

        return () => window.removeEventListener('resize', handleResize);
    }, [layoutMode]);

    return (
        <CardPreviewProvider>
            <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                measuring={{
                    draggable: { measure: getClientRect },
                    dragOverlay: { measure: getClientRect },
                }}
            >
                <div className="relative h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden flex font-sans selection:bg-indigo-500/30" onContextMenu={(e) => e.preventDefault()}>
                    <Sidenav
                        onCreateToken={() => setIsTokenModalOpen(true)}
                        onToggleLog={() => setIsLogOpen(!isLogOpen)}
                        onCopyLink={handleCopyLink}
                        onLeaveGame={handleLeave}
                    />

                    <div className={`w-full h-full grid ${getGridClass()} pl-12`}>
                        {slots.map((slot, index) => (
                            <div
                                key={index}
                                className="relative border-zinc-800/50"
                            >
                                {slot.player ? (
                                    <Seat
                                        player={slot.player}
                                        position={slot.position as any}
                                        color={slot.color as any}
                                        zones={zones}
                                        cards={cards}
                                        isMe={slot.player.id === myPlayerId}
                                        onCardContextMenu={handleCardContextMenu}
                                        onZoneContextMenu={handleZoneContextMenu}
                                        onBattlefieldContextMenu={(e) => handleBattlefieldContextMenu(e, () => setIsTokenModalOpen(true))}
                                        onLoadDeck={() => setIsLoadDeckModalOpen(true)}
                                        opponentColors={playerColors}
                                        scale={scale}
                                        onViewZone={handleViewZone}
                                        onDrawCard={(playerId) => useGameStore.getState().drawCard(playerId, myPlayerId)}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-800 font-bold text-2xl uppercase tracking-widest select-none">
                                        Empty Seat
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                {contextMenu && (
                    <ContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        items={contextMenu.items}
                        onClose={closeContextMenu}
                        title={contextMenu.title}
                    />
                )}
                <NumberPromptDialog
                    open={Boolean(countPrompt)}
                    title={countPrompt?.title || ''}
                    message={countPrompt?.message}
                    onSubmit={(value) => countPrompt?.onSubmit(value)}
                    onClose={closeCountPrompt}
                    initialValue={1}
                />

                <LoadDeckModal
                    isOpen={isLoadDeckModalOpen}
                    onClose={() => setIsLoadDeckModalOpen(false)}
                    playerId={myPlayerId}
                />
                <TokenCreationModal
                    isOpen={isTokenModalOpen}
                    onClose={() => setIsTokenModalOpen(false)}
                    playerId={myPlayerId}
                />
                <AddCounterModal
                    isOpen={activeModal?.type === 'ADD_COUNTER'}
                    onClose={() => setActiveModal(null)}
                    cardId={activeModal?.type === 'ADD_COUNTER' ? activeModal.cardId : ''}
                />
                <ZoneViewerModal
                    isOpen={zoneViewerState.isOpen}
                    onClose={() => setZoneViewerState(prev => ({ ...prev, isOpen: false }))}
                    zoneId={zoneViewerState.zoneId}
                    count={zoneViewerState.count}
                />
                <LogDrawer
                    isOpen={isLogOpen}
                    onClose={() => setIsLogOpen(false)}
                    playerColors={playerColors}
                />
                <DragMonitor />
                <DragOverlay dropAnimation={null}>
                    {activeCardId && cards[activeCardId] ? (() => {
                        const overlayCard = cards[activeCardId];
                        const overlayZone = zones[overlayCard.zoneId];
                        const overlayTypeLine = overlayCard.typeLine || overlayCard.scryfall?.type_line || '';
                        const overlayPreferArtCrop = overlayZone?.type === ZONE.BATTLEFIELD && !/land/i.test(overlayTypeLine);
                        return (
                            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                                <CardView
                                    card={overlayCard}
                                    isDragging
                                    preferArtCrop={overlayPreferArtCrop}
                                />
                            </div>
                        );
                    })() : null}
                </DragOverlay>
            </DndContext>
        </CardPreviewProvider>
    );
};
