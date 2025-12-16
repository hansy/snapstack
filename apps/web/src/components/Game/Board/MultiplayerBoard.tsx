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
import { getPlayerZones } from '../../../lib/gameSelectors';



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
    const [revealedLibraryZoneId, setRevealedLibraryZoneId] = useState<string | null>(null);

    const isTypingTarget = React.useCallback((target: EventTarget | null) => {
        const el = target as HTMLElement | null;
        if (!el) return false;
        const tag = el.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        return Boolean(el.isContentEditable);
    }, []);

    const closeTopmostUi = React.useCallback(() => {
        if (contextMenu) {
            closeContextMenu();
            return true;
        }
        if (countPrompt) {
            closeCountPrompt();
            return true;
        }
        if (textPrompt) {
            closeTextPrompt();
            return true;
        }
        if (activeModal) {
            setActiveModal(null);
            return true;
        }
        if (isTokenModalOpen) {
            setIsTokenModalOpen(false);
            return true;
        }
        if (isLoadDeckModalOpen) {
            setIsLoadDeckModalOpen(false);
            return true;
        }
        if (zoneViewerState.isOpen) {
            setZoneViewerState((prev) => ({ ...prev, isOpen: false }));
            return true;
        }
        if (revealedLibraryZoneId) {
            setRevealedLibraryZoneId(null);
            return true;
        }
        if (isLogOpen) {
            setIsLogOpen(false);
            return true;
        }
        return false;
    }, [
        contextMenu,
        closeContextMenu,
        countPrompt,
        closeCountPrompt,
        textPrompt,
        closeTextPrompt,
        activeModal,
        setActiveModal,
        isTokenModalOpen,
        isLoadDeckModalOpen,
        zoneViewerState.isOpen,
        revealedLibraryZoneId,
        isLogOpen,
    ]);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented) return;
            if (e.repeat) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            const normalizedKey = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();

            if (normalizedKey === 'escape') {
                const closed = closeTopmostUi();
                if (closed) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                return;
            }

            if (isTypingTarget(e.target)) return;

            const uiBlocksShortcuts =
                Boolean(contextMenu) ||
                Boolean(countPrompt) ||
                Boolean(textPrompt) ||
                Boolean(activeModal) ||
                isTokenModalOpen ||
                isLoadDeckModalOpen ||
                zoneViewerState.isOpen ||
                Boolean(revealedLibraryZoneId);

            if (uiBlocksShortcuts) return;

            const myZones = getPlayerZones(zones, myPlayerId);
            const me = players?.[myPlayerId];
            const hasDeckLoaded = Boolean(me?.deckLoaded);

            const drawOne = () => useGameStore.getState().drawCard(myPlayerId, myPlayerId);
            const shuffle = () => useGameStore.getState().shuffleLibrary(myPlayerId, myPlayerId);
            const resetDeck = () => useGameStore.getState().resetDeck(myPlayerId, myPlayerId);
            const unloadDeck = () => useGameStore.getState().unloadDeck(myPlayerId, myPlayerId);
            const untapAll = () => useGameStore.getState().untapAll(myPlayerId);

            const handle = (fn: () => void) => {
                e.preventDefault();
                e.stopPropagation();
                fn();
            };

            if (normalizedKey === 'l') return handle(() => setIsLogOpen((prev) => !prev));

            if (!hasDeckLoaded) {
                // Non-deck actions still allowed (log).
                return;
            }

            if (normalizedKey === 't') return handle(() => setIsTokenModalOpen(true));
            if (normalizedKey === 'u' && !e.shiftKey) return handle(untapAll);
            if (normalizedKey === 'd') return handle(drawOne);
            if (normalizedKey === 's' && e.shiftKey) return handle(shuffle);

            if (normalizedKey === 'g') {
                const graveyard = myZones.graveyard;
                if (!graveyard) return;
                return handle(() => handleViewZone(graveyard.id));
            }

            if (normalizedKey === 'e') {
                const exile = myZones.exile;
                if (!exile) return;
                return handle(() => handleViewZone(exile.id));
            }

            if (normalizedKey === 'v') {
                const library = myZones.library;
                if (!library) return;
                return handle(() => {
                    openCountPrompt({
                        title: 'View Top',
                        message: 'How many cards from top?',
                        initialValue: 1,
                        onSubmit: (count) => handleViewZone(library.id, count),
                    });
                });
            }

            if (normalizedKey === 'm') {
                const library = myZones.library;
                if (!library) return;
                return handle(() => {
                    openCountPrompt({
                        title: 'Mulligan',
                        message: 'Shuffle library and draw new cards. How many cards to draw?',
                        initialValue: 7,
                        onSubmit: (count) => {
                            shuffle();
                            for (let i = 0; i < count; i++) drawOne();
                        },
                    });
                });
            }

            if (normalizedKey === 'r' && e.shiftKey) {
                return handle(() => {
                    const ok = window.confirm('Reset deck? This will return all owned cards to your library and reshuffle.');
                    if (!ok) return;
                    resetDeck();
                });
            }

            if (normalizedKey === 'u' && e.shiftKey) {
                return handle(() => {
                    const ok = window.confirm('Unload deck? This removes your deck from the game state.');
                    if (!ok) return;
                    unloadDeck();
                });
            }

            if (normalizedKey === 'q' && e.shiftKey) {
                return handle(() => {
                    const ok = window.confirm('Leave room?');
                    if (!ok) return;
                    handleLeave();
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [
        myPlayerId,
        zones,
        players,
        handleLeave,
        handleViewZone,
        openCountPrompt,
        contextMenu,
        countPrompt,
        textPrompt,
        activeModal,
        isTokenModalOpen,
        isLoadDeckModalOpen,
        zoneViewerState.isOpen,
        revealedLibraryZoneId,
        closeTopmostUi,
        isTypingTarget,
    ]);

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
