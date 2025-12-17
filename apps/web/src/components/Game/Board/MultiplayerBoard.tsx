import React, { useState } from 'react';
import { toast } from 'sonner';
import { DndContext, DragOverlay, getClientRect, useDndMonitor, pointerWithin } from '@dnd-kit/core';
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
import { TextPromptDialog } from '../UI/TextPromptDialog';
import { LogDrawer } from '../UI/LogDrawer';
import { useMultiplayerSync } from '../../../hooks/useMultiplayerSync';
import { useNavigate } from '@tanstack/react-router';
import { computePlayerColors, resolveOrderedPlayerIds } from '../../../lib/playerColors';
import { OpponentLibraryRevealsModal } from '../UI/OpponentLibraryRevealsModal';
import { useGameShortcuts } from '../../../hooks/useGameShortcuts';
import { ShortcutsDrawer } from '../UI/ShortcutsDrawer';
import { EditUsernameDialog } from '../../Username/EditUsernameDialog';
import { useClientPrefsStore } from '../../../store/clientPrefsStore';



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
    const players = useGameStore((state) => state.players);
    const playerOrder = useGameStore((state) => state.playerOrder);
    const battlefieldViewScale = useGameStore((state) => state.battlefieldViewScale);
    const activeModal = useGameStore((state) => state.activeModal);
    const setActiveModal = useGameStore((state) => state.setActiveModal);
    const overCardScale = useDragStore((state) => state.overCardScale);
    const activeCardId = useDragStore((state) => state.activeCardId);
    const { sensors, handleDragStart, handleDragMove, handleDragEnd } = useGameDnD();

    const { slots, layoutMode, myPlayerId } = usePlayerLayout();


    const { status: syncStatus, peers } = useMultiplayerSync(sessionId);

    const [zoneViewerState, setZoneViewerState] = useState<{ isOpen: boolean; zoneId: string | null; count?: number }>({
        isOpen: false,
        zoneId: null
    });

    const handleViewZone = (zoneId: string, count?: number) => {
        setZoneViewerState({ isOpen: true, zoneId, count });
    };

    const handleLeave = () => {
        useGameStore.getState().leaveGame();
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
    const { contextMenu, handleCardContextMenu, handleZoneContextMenu, handleBattlefieldContextMenu, closeContextMenu, countPrompt, openCountPrompt, closeCountPrompt, textPrompt, closeTextPrompt } = useGameContextMenu(myPlayerId, handleViewZone);

    const [isLoadDeckModalOpen, setIsLoadDeckModalOpen] = useState(false);
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
    const [isLogOpen, setIsLogOpen] = useState(false);
    const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
    const [isEditUsernameOpen, setIsEditUsernameOpen] = useState(false);
    const [revealedLibraryZoneId, setRevealedLibraryZoneId] = useState<string | null>(null);
    const preferredUsername = useClientPrefsStore((state) => state.username);

    useGameShortcuts({
        myPlayerId,
        zones,
        players,
        contextMenuOpen: Boolean(contextMenu),
        closeContextMenu,
        countPromptOpen: Boolean(countPrompt),
        closeCountPrompt,
        textPromptOpen: Boolean(textPrompt),
        closeTextPrompt,
        activeModalOpen: Boolean(activeModal),
        closeActiveModal: () => setActiveModal(null),
        tokenModalOpen: isTokenModalOpen,
        setTokenModalOpen: setIsTokenModalOpen,
        loadDeckModalOpen: isLoadDeckModalOpen,
        setLoadDeckModalOpen: setIsLoadDeckModalOpen,
        zoneViewerOpen: zoneViewerState.isOpen,
        closeZoneViewer: () => setZoneViewerState((prev) => ({ ...prev, isOpen: false })),
        opponentRevealsOpen: Boolean(revealedLibraryZoneId),
        closeOpponentReveals: () => setRevealedLibraryZoneId(null),
        logOpen: isLogOpen,
        setLogOpen: setIsLogOpen,
        shortcutsOpen: isShortcutsOpen,
        setShortcutsOpen: setIsShortcutsOpen,
        openCountPrompt,
        handleViewZone,
        handleLeave,
    });

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
        const orderedIds = resolveOrderedPlayerIds(players as any, playerOrder ?? []);
        const canonical = computePlayerColors(orderedIds);
        const colors: Record<string, string> = { ...canonical };
        Object.entries(players).forEach(([id, player]) => {
            if (player?.color) colors[id] = player.color;
        });
        return colors;
    }, [players, playerOrder]);

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

    // Drag-to-Zoom Logic
    const zoomEdge = useDragStore((state) => state.zoomEdge);
    const setBattlefieldViewScale = useGameStore((state) => state.setBattlefieldViewScale);

    React.useEffect(() => {
        if (!zoomEdge) return;

        let interval: NodeJS.Timeout;

        // Wait 2 seconds before starting the zoom
        const timer = setTimeout(() => {
            interval = setInterval(() => {
                const currentScale = useGameStore.getState().battlefieldViewScale[myPlayerId] ?? 1;
                let newScale = currentScale;
                const ZOOM_STEP = 0.02;

                if (zoomEdge === 'top' || zoomEdge === 'left') {
                    newScale += ZOOM_STEP;
                } else {
                    newScale -= ZOOM_STEP;
                }

                // Clamp between 50% and 100%
                newScale = Math.max(0.5, Math.min(1, newScale));

                if (newScale !== currentScale) {
                    setBattlefieldViewScale(myPlayerId, newScale);
                }
            }, 50);
        }, 1000);

        return () => {
            clearTimeout(timer);
            if (interval) clearInterval(interval);
        };
    }, [zoomEdge, myPlayerId, setBattlefieldViewScale]);

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
                collisionDetection={pointerWithin}
            >
                <div className="relative h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden flex font-sans selection:bg-indigo-500/30" onContextMenu={(e) => e.preventDefault()}>
                    <Sidenav
                        onCreateToken={() => setIsTokenModalOpen(true)}
                        onToggleLog={() => setIsLogOpen(!isLogOpen)}
                        onCopyLink={handleCopyLink}
                        onLeaveGame={handleLeave}
                        onOpenShortcuts={() => setIsShortcutsOpen(true)}
                        syncStatus={syncStatus}
                        peerCount={peers}
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
                                        onEditUsername={slot.player.id === myPlayerId ? () => setIsEditUsernameOpen(true) : undefined}
                                        opponentColors={playerColors}
                                        scale={scale}
                                        battlefieldScale={battlefieldViewScale[slot.player.id] ?? 1}
                                        onViewZone={handleViewZone}
                                        onDrawCard={(playerId) => useGameStore.getState().drawCard(playerId, myPlayerId)}
                                        onOpponentLibraryReveals={(zoneId) => setRevealedLibraryZoneId(zoneId)}
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
                    initialValue={countPrompt?.initialValue ?? 1}
                />
                <TextPromptDialog
                    open={Boolean(textPrompt)}
                    title={textPrompt?.title || ''}
                    message={textPrompt?.message}
                    initialValue={textPrompt?.initialValue}
                    onSubmit={(value) => textPrompt?.onSubmit(value)}
                    onClose={closeTextPrompt}
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
                <OpponentLibraryRevealsModal
                    isOpen={Boolean(revealedLibraryZoneId)}
                    onClose={() => setRevealedLibraryZoneId(null)}
                    zoneId={revealedLibraryZoneId}
                />
                <ShortcutsDrawer
                    isOpen={isShortcutsOpen}
                    onClose={() => setIsShortcutsOpen(false)}
                />
                <EditUsernameDialog
                    open={isEditUsernameOpen}
                    onClose={() => setIsEditUsernameOpen(false)}
                    initialValue={players[myPlayerId]?.name ?? preferredUsername ?? ''}
                    onSubmit={(username) => {
                        useClientPrefsStore.getState().setUsername(username);
                        useGameStore.getState().updatePlayer(myPlayerId, { name: username }, myPlayerId);
                        setIsEditUsernameOpen(false);
                    }}
                />
                <DragMonitor />
                <DragOverlay dropAnimation={null}>
                    {activeCardId && cards[activeCardId] ? (() => {
                        const overlayCard = cards[activeCardId];
                        const overlayZone = zones[overlayCard.zoneId];
                        const overlayPreferArtCrop = false;
                        const viewScale = overlayZone?.type === ZONE.BATTLEFIELD
                            ? (battlefieldViewScale[overlayZone.ownerId] ?? 1)
                            : 1;
                        const targetScale = overCardScale || viewScale;
                        return (
                            <div style={{ transform: `scale(${scale * targetScale})`, transformOrigin: 'top left' }}>
                                <CardView
                                    card={overlayCard}
                                    isDragging
                                    preferArtCrop={overlayPreferArtCrop}
                                    faceDown={overlayCard.faceDown}
                                />
                            </div>
                        );
                    })() : null}
                </DragOverlay>
            </DndContext>
        </CardPreviewProvider>
    );
};
