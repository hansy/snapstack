import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { GameState, Zone } from '../types';
import { peerService } from '../services/peerService';
import { getSnappedPosition, SNAP_GRID_SIZE } from '../lib/snapping';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../lib/constants';

interface GameStore extends GameState {
    // Additional actions or computed properties can go here
}

export const useGameStore = create<GameStore>()(
    persist(
        (set, get) => ({
            players: {},
            cards: {},
            zones: {},
            sessionId: uuidv4(), // Generate a new session ID by default
            myPlayerId: uuidv4(), // Generate a temporary ID for the local player
            hasHydrated: false,
            positionFormat: 'center',

            setHasHydrated: (state) => {
                set({ hasHydrated: state });
            },

            addPlayer: (player, isRemote) => {
                set((state) => ({
                    players: { ...state.players, [player.id]: { ...player, deckLoaded: false } },
                }));
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addPlayer', args: [player] } });
            },

            updatePlayer: (id, updates, isRemote) => {
                set((state) => ({
                    players: {
                        ...state.players,
                        [id]: { ...state.players[id], ...updates },
                    },
                }));
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'updatePlayer', args: [id, updates] } });
            },

            setDeckLoaded: (playerId, loaded, isRemote) => {
                set((state) => ({
                    players: {
                        ...state.players,
                        [playerId]: { ...state.players[playerId], deckLoaded: loaded }
                    }
                }));
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'setDeckLoaded', args: [playerId, loaded] } });
            },

            addZone: (zone: Zone, isRemote?: boolean) => {
                set((state) => ({
                    zones: { ...state.zones, [zone.id]: zone },
                }));
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addZone', args: [zone] } });
            },

            addCard: (card, isRemote) => {
                set((state) => ({
                    cards: { ...state.cards, [card.id]: card },
                    zones: {
                        ...state.zones,
                        [card.zoneId]: {
                            ...state.zones[card.zoneId],
                            cardIds: [...state.zones[card.zoneId].cardIds, card.id],
                        },
                    },
                }));
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addCard', args: [card] } });
            },

            updateCard: (id, updates, isRemote) => {
                set((state) => ({
                    cards: {
                        ...state.cards,
                        [id]: { ...state.cards[id], ...updates },
                    },
                }));
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'updateCard', args: [id, updates] } });
            },

            moveCard: (cardId, toZoneId, position, isRemote) => {
                set((state) => {
                    const card = state.cards[cardId];
                    if (!card) return state;

                    const fromZoneId = card.zoneId;
                    const fromZone = state.zones[fromZoneId];
                    const toZone = state.zones[toZoneId];

                    if (!fromZone || !toZone) return state;

                    // Calculate new position with snapping and collision handling
                    let newPosition = position || { x: 0, y: 0 };
                    const cardsCopy = { ...state.cards };

                    // Only apply snapping/collision if moving to a battlefield (which is free-form)
                    // We assume 'battlefield' type zones are free-form.
                    if (toZone.type === 'battlefield' && position) {
                        // Snap center to grid (edge-aligned)
                        newPosition = getSnappedPosition(position.x, position.y);

                        // Collision detection: treat collision only when centers match exactly
                        // (i.e., same snapped grid cell). For any such overlapping card,
                        // shift it down by one grid step, cascading if needed.
                        const otherCardIds = toZone.cardIds.filter(id => id !== cardId);
                        for (const otherId of otherCardIds) {
                            const otherCard = cardsCopy[otherId];
                            if (!otherCard) continue;

                            // Collision only when centers match exactly
                            if (
                                otherCard.position.x === newPosition.x &&
                                otherCard.position.y === newPosition.y
                            ) {
                                let candidateY = otherCard.position.y + SNAP_GRID_SIZE;
                                const candidateX = newPosition.x;

                                // Cascade down until this spot is free in the target zone
                                let occupied = true;
                                while (occupied) {
                                    occupied = false;
                                    for (const checkId of otherCardIds) {
                                        if (checkId === otherId) continue;
                                        const checkCard = cardsCopy[checkId];
                                        if (!checkCard) continue;
                                        if (
                                            checkCard.position.x === candidateX &&
                                            checkCard.position.y === candidateY
                                        ) {
                                            candidateY += SNAP_GRID_SIZE;
                                            occupied = true;
                                            break;
                                        }
                                    }
                                }

                                cardsCopy[otherId] = {
                                    ...otherCard,
                                    position: {
                                        ...otherCard.position,
                                        x: candidateX,
                                        y: candidateY,
                                    },
                                };
                            }
                        }
                    }

                    // If moving within the same zone
                    if (fromZoneId === toZoneId) {
                        cardsCopy[cardId] = {
                            ...card,
                            position: newPosition,
                        };
                        return {
                            cards: cardsCopy,
                            // No change to zones needed if order doesn't matter or is handled elsewhere
                            // If we want to move to end of array (reorder):
                            zones: {
                                ...state.zones,
                                [fromZoneId]: {
                                    ...fromZone,
                                    cardIds: [...fromZone.cardIds.filter(id => id !== cardId), cardId]
                                }
                            }
                        };
                    }

                    // Remove from old zone
                    const newFromZoneCardIds = fromZone.cardIds.filter((id) => id !== cardId);

                    // Add to new zone
                    const newToZoneCardIds = [...toZone.cardIds, cardId];

                    cardsCopy[cardId] = {
                        ...card,
                        zoneId: toZoneId,
                        position: newPosition,
                    };

                    return {
                        cards: cardsCopy,
                        zones: {
                            ...state.zones,
                            [fromZoneId]: { ...fromZone, cardIds: newFromZoneCardIds },
                            [toZoneId]: { ...toZone, cardIds: newToZoneCardIds },
                        },
                    };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'moveCard', args: [cardId, toZoneId, position] } });
            },

            tapCard: (cardId, isRemote) => {
                set((state) => {
                    const card = state.cards[cardId];
                    if (!card) return state;
                    return {
                        cards: {
                            ...state.cards,
                            [cardId]: { ...card, tapped: !card.tapped },
                        },
                    };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'tapCard', args: [cardId] } });
            },

            untapAll: (playerId, isRemote) => {
                set((state) => {
                    const newCards = { ...state.cards };
                    Object.values(newCards).forEach(card => {
                        if (card.controllerId === playerId && card.tapped) {
                            newCards[card.id] = { ...card, tapped: false };
                        }
                    });
                    return { cards: newCards };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'untapAll', args: [playerId] } });
            },

            drawCard: (playerId, _isRemote) => {
                const state = get();
                const libraryZone = Object.values(state.zones).find(z => z.ownerId === playerId && z.type === 'library');
                const handZone = Object.values(state.zones).find(z => z.ownerId === playerId && z.type === 'hand');

                if (!libraryZone || !handZone || libraryZone.cardIds.length === 0) return;

                const cardId = libraryZone.cardIds[libraryZone.cardIds.length - 1];
                state.moveCard(cardId, handZone.id);
            },

            shuffleLibrary: (playerId, isRemote) => {
                set((state) => {
                    const libraryZone = Object.values(state.zones).find(z => z.ownerId === playerId && z.type === 'library');
                    if (!libraryZone) return state;

                    const shuffledIds = [...libraryZone.cardIds].sort(() => Math.random() - 0.5);

                    return {
                        zones: {
                            ...state.zones,
                            [libraryZone.id]: { ...libraryZone, cardIds: shuffledIds },
                        },
                    };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'shuffleLibrary', args: [playerId] } });
            }
        }),
        {
            name: 'snapstack-storage',
            storage: createJSONStorage(() => localStorage),
            onRehydrateStorage: () => (state) => {
                // Migrate legacy top-left positions to center-based storage
                if (state && state.cards && state.positionFormat !== 'center') {
                    const migratedCards: typeof state.cards = {};
                    Object.values(state.cards).forEach(card => {
                        migratedCards[card.id] = {
                            ...card,
                            position: {
                                x: card.position.x + CARD_WIDTH_PX / 2,
                                y: card.position.y + CARD_HEIGHT_PX / 2
                            }
                        };
                    });
                    state.cards = migratedCards;
                    state.positionFormat = 'center';
                }
                state?.setHasHydrated(true);
            },
        }
    )
);
