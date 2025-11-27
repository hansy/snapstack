import React, { useState } from 'react';
import { DndContext, DragOverlay, getClientRect, useDndMonitor } from '@dnd-kit/core';
import { useGameStore } from '../../../store/gameStore';
import { useDragStore } from '../../../store/dragStore';
import { Seat } from '../Seat/Seat';
import { CardView } from '../Card/Card';
import { Sidenav } from '../UI/Sidenav';
import { ContextMenu } from '../UI/ContextMenu';
import { LoadDeckModal } from '../UI/LoadDeckModal';
import { useGameDnD } from '../../../hooks/useGameDnD';
import { useGameContextMenu } from '../../../hooks/useGameContextMenu';

import { usePlayerLayout } from '../../../hooks/usePlayerLayout';
import { BattlefieldGridOverlay } from './BattlefieldGridOverlay';
import { ZoneViewerModal } from '../UI/ZoneViewerModal';
import { ZONE } from '../../../constants/zones';
import { CardPreviewProvider } from '../Card/CardPreviewProvider';



const DragMonitor = () => {
    useDndMonitor({
        onDragMove() {
            // Debug logging removed.
        }
    });

    return null;
};



export const MultiplayerBoard: React.FC = () => {
    const zones = useGameStore((state) => state.zones);
    const cards = useGameStore((state) => state.cards);
    const activeCardId = useDragStore((state) => state.activeCardId);
    const { sensors, handleDragStart, handleDragMove, handleDragEnd } = useGameDnD();

    const { slots, layoutMode, myPlayerId } = usePlayerLayout();



    const [zoneViewerState, setZoneViewerState] = useState<{ isOpen: boolean; zoneId: string | null; count?: number }>({
        isOpen: false,
        zoneId: null
    });

    const handleViewZone = (zoneId: string, count?: number) => {
        setZoneViewerState({ isOpen: true, zoneId, count });
    };

    // Debugging moved to DragMonitor component
    const { contextMenu, handleCardContextMenu, handleZoneContextMenu, closeContextMenu } = useGameContextMenu(myPlayerId, handleViewZone);
    const hasHydrated = useGameStore((state) => state.hasHydrated);

    const [isLoadDeckModalOpen, setIsLoadDeckModalOpen] = useState(false);

    // Auto-initialize if player is missing (e.g. after reset)
    React.useEffect(() => {
        if (!hasHydrated) return;

        const players = useGameStore.getState().players;
        // We check if the *current* myPlayerId (which should be the persisted one now) exists
        if (!players[myPlayerId]) {
            const { addPlayer, addZone } = useGameStore.getState();

            // Add Player
            addPlayer({
                id: myPlayerId,
                name: 'Me',
                life: 40,
                counters: [],
                commanderDamage: {}
            });

            // Add Zones
            const zoneTypes = [ZONE.LIBRARY, ZONE.HAND, ZONE.BATTLEFIELD, ZONE.GRAVEYARD, ZONE.EXILE, ZONE.COMMANDER] as const;
            zoneTypes.forEach(type => {
                addZone({
                    id: `${myPlayerId}-${type}`,
                    type,
                    ownerId: myPlayerId,
                    cardIds: []
                });
            });
        }
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
                <div className="h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden flex font-sans selection:bg-indigo-500/30" onContextMenu={(e) => e.preventDefault()}>
                    <Sidenav />

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
                                        onLoadDeck={() => setIsLoadDeckModalOpen(true)}
                                        opponentColors={playerColors}
                                        scale={scale}
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

                <LoadDeckModal
                    isOpen={isLoadDeckModalOpen}
                    onClose={() => setIsLoadDeckModalOpen(false)}
                    playerId={myPlayerId}
                />
                <ZoneViewerModal
                    isOpen={zoneViewerState.isOpen}
                    onClose={() => setZoneViewerState(prev => ({ ...prev, isOpen: false }))}
                    zoneId={zoneViewerState.zoneId}
                    count={zoneViewerState.count}
                />
                <DragMonitor />
                <DragOverlay dropAnimation={null}>
                    {activeCardId && cards[activeCardId] ? (
                        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                            <CardView
                                card={cards[activeCardId]}
                                isDragging
                            />
                        </div>
                    ) : null}
                </DragOverlay>
                <BattlefieldGridOverlay />
            </DndContext>
        </CardPreviewProvider>
    );
};
