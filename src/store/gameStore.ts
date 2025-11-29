import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { GameState, Zone } from '../types';
import { peerService } from '../services/peerService';
import { getSnappedPosition, SNAP_GRID_SIZE } from '../lib/snapping';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../lib/constants';
import { getZoneByType } from '../lib/gameSelectors';
import { ZONE } from '../constants/zones';
import { canMoveCard, canTapCard, canUpdatePlayer, canViewZone } from '../rules/permissions';
import { logPermission } from '../rules/logger';

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
            globalCounters: {},
            activeModal: null,

            setHasHydrated: (state) => {
                set({ hasHydrated: state });
            },

            addPlayer: (player, isRemote) => {
                set((state) => ({
                    players: { ...state.players, [player.id]: { ...player, deckLoaded: false } },
                }));
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addPlayer', args: [player] } });
            },

            updatePlayer: (id, updates, actorId, isRemote) => {
                const actor = actorId ?? get().myPlayerId;
                const player = get().players[id];
                if (!player) return;

                const permission = canUpdatePlayer({ actorId: actor }, player, updates);
                if (!permission.allowed) {
                    logPermission({ action: 'updatePlayer', actorId: actor, allowed: false, reason: permission.reason, details: { playerId: id, updates } });
                    return;
                }
                logPermission({ action: 'updatePlayer', actorId: actor, allowed: true, details: { playerId: id, updates } });

                set((state) => ({
                    players: {
                        ...state.players,
                        [id]: { ...state.players[id], ...updates },
                    },
                }));
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'updatePlayer', args: [id, updates], actorId: actor } });
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
                // Initialize P/T from Scryfall if not already set
                const initializedCard = { ...card };
                if (card.scryfall && !card.power && !card.toughness) {
                    initializedCard.power = card.scryfall.power;
                    initializedCard.toughness = card.scryfall.toughness;
                    initializedCard.basePower = card.scryfall.power;
                    initializedCard.baseToughness = card.scryfall.toughness;
                }

                set((state) => ({
                    cards: { ...state.cards, [initializedCard.id]: initializedCard },
                    zones: {
                        ...state.zones,
                        [initializedCard.zoneId]: {
                            ...state.zones[initializedCard.zoneId],
                            cardIds: [...state.zones[initializedCard.zoneId].cardIds, initializedCard.id],
                        },
                    },
                }));
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addCard', args: [initializedCard] } });
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

            moveCard: (cardId, toZoneId, position, actorId, isRemote) => {
                const actor = actorId ?? get().myPlayerId;
                const snapshot = get();
                const card = snapshot.cards[cardId];
                if (!card) return;

                const fromZoneId = card.zoneId;
                const fromZone = snapshot.zones[fromZoneId];
                const toZone = snapshot.zones[toZoneId];

                if (!fromZone || !toZone) return;

                const permission = canMoveCard({ actorId: actor, card, fromZone, toZone });
                if (!permission.allowed) {
                    logPermission({
                        action: 'moveCard',
                        actorId: actor,
                        allowed: false,
                        reason: permission.reason,
                        details: { cardId, fromZoneId, toZoneId }
                    });
                    return;
                }
                logPermission({ action: 'moveCard', actorId: actor, allowed: true, details: { cardId, fromZoneId, toZoneId } });

                const tokenLeavingBattlefield = card.isToken && toZone.type !== ZONE.BATTLEFIELD;
                if (tokenLeavingBattlefield) {
                    set((state) => {
                        const nextCards = { ...state.cards };
                        delete nextCards[cardId];

                        const nextZones = { ...state.zones };
                        const currentFrom = state.zones[fromZoneId];
                        if (currentFrom) {
                            nextZones[fromZoneId] = {
                                ...currentFrom,
                                cardIds: currentFrom.cardIds.filter(id => id !== cardId),
                            };
                        }
                        const currentTo = state.zones[toZoneId];
                        if (currentTo) {
                            nextZones[toZoneId] = {
                                ...currentTo,
                                cardIds: currentTo.cardIds.filter(id => id !== cardId),
                            };
                        }

                        return { cards: nextCards, zones: nextZones };
                    });
                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'moveCard', args: [cardId, toZoneId, position], actorId: actor } });
                    return;
                }

                set((state) => {
                    // Calculate new position with snapping and collision handling
                    let newPosition = position || { x: 0, y: 0 };
                    const cardsCopy = { ...state.cards };
                    const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;

                    // Only apply snapping/collision if moving to a battlefield (which is free-form)
                    if (toZone.type === ZONE.BATTLEFIELD && position) {
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
                            tapped: nextTapped,
                        };
                        return {
                            cards: cardsCopy,
                            zones: {
                                ...state.zones,
                                [fromZoneId]: {
                                    ...state.zones[fromZoneId],
                                    cardIds: [...state.zones[fromZoneId].cardIds.filter(id => id !== cardId), cardId]
                                }
                            }
                        };
                    }

                    // Remove from old zone
                    const newFromZoneCardIds = state.zones[fromZoneId].cardIds.filter((id) => id !== cardId);

                    // Add to new zone
                    const newToZoneCardIds = [...state.zones[toZoneId].cardIds, cardId];

                    cardsCopy[cardId] = {
                        ...card,
                        zoneId: toZoneId,
                        position: newPosition,
                        tapped: nextTapped,
                    };

                    return {
                        cards: cardsCopy,
                        zones: {
                            ...state.zones,
                            [fromZoneId]: { ...state.zones[fromZoneId], cardIds: newFromZoneCardIds },
                            [toZoneId]: { ...state.zones[toZoneId], cardIds: newToZoneCardIds },
                        },
                    };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'moveCard', args: [cardId, toZoneId, position], actorId: actor } });
            },

            moveCardToBottom: (cardId, toZoneId, actorId, isRemote) => {
                const actor = actorId ?? get().myPlayerId;
                const snapshot = get();
                const card = snapshot.cards[cardId];
                if (!card) return;

                const fromZoneId = card.zoneId;
                const fromZone = snapshot.zones[fromZoneId];
                const toZone = snapshot.zones[toZoneId];
                if (!fromZone || !toZone) return;

                const permission = canMoveCard({ actorId: actor, card, fromZone, toZone });
                if (!permission.allowed) {
                    logPermission({
                        action: 'moveCardToBottom',
                        actorId: actor,
                        allowed: false,
                        reason: permission.reason,
                        details: { cardId, fromZoneId, toZoneId }
                    });
                    return;
                }
                logPermission({ action: 'moveCardToBottom', actorId: actor, allowed: true, details: { cardId, fromZoneId, toZoneId } });

                const tokenLeavingBattlefield = card.isToken && toZone.type !== ZONE.BATTLEFIELD;
                if (tokenLeavingBattlefield) {
                    set((state) => {
                        const nextCards = { ...state.cards };
                        delete nextCards[cardId];

                        const nextZones = { ...state.zones };
                        const currentFrom = state.zones[fromZoneId];
                        if (currentFrom) {
                            nextZones[fromZoneId] = {
                                ...currentFrom,
                                cardIds: currentFrom.cardIds.filter(id => id !== cardId),
                            };
                        }
                        const currentTo = state.zones[toZoneId];
                        if (currentTo) {
                            nextZones[toZoneId] = {
                                ...currentTo,
                                cardIds: currentTo.cardIds.filter(id => id !== cardId),
                            };
                        }

                        return { cards: nextCards, zones: nextZones };
                    });
                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'moveCardToBottom', args: [cardId, toZoneId], actorId: actor } });
                    return;
                }

                set((state) => {
                    const cardsCopy = { ...state.cards };

                    // Remove from old zone
                    const newFromZoneCardIds = state.zones[fromZoneId].cardIds.filter((id) => id !== cardId);

                    // Add to new zone (at the beginning/bottom)
                    // If moving within same zone, we still filter out and then unshift
                    let newToZoneCardIds;
                    if (fromZoneId === toZoneId) {
                        newToZoneCardIds = [cardId, ...newFromZoneCardIds];
                    } else {
                        newToZoneCardIds = [cardId, ...state.zones[toZoneId].cardIds];
                    }

                    const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;

                    cardsCopy[cardId] = {
                        ...card,
                        zoneId: toZoneId,
                        tapped: nextTapped,
                    };

                    return {
                        cards: cardsCopy,
                        zones: {
                            ...state.zones,
                            [fromZoneId]: { ...state.zones[fromZoneId], cardIds: newFromZoneCardIds },
                            [toZoneId]: { ...state.zones[toZoneId], cardIds: newToZoneCardIds },
                        },
                    };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'moveCardToBottom', args: [cardId, toZoneId], actorId: actor } });
            },

            removeCard: (cardId, actorId, isRemote) => {
                const actor = actorId ?? get().myPlayerId;
                const snapshot = get();
                const card = snapshot.cards[cardId];
                if (!card) return;

                const zone = snapshot.zones[card.zoneId];
                if (!zone) return;

                if (!card.isToken) {
                    logPermission({ action: 'removeCard', actorId: actor, allowed: false, reason: 'Direct remove is allowed only for tokens', details: { cardId } });
                    return;
                }

                const actorIsOwner = actor === card.ownerId;
                const actorIsZoneHost = actor === zone.ownerId;
                if (!actorIsOwner && !actorIsZoneHost) {
                    logPermission({ action: 'removeCard', actorId: actor, allowed: false, reason: 'Only owner or zone host may remove this token', details: { cardId } });
                    return;
                }

                set((state) => {
                    const nextCards = { ...state.cards };
                    delete nextCards[cardId];

                    const nextZones = {
                        ...state.zones,
                        [zone.id]: { ...zone, cardIds: zone.cardIds.filter(id => id !== cardId) }
                    };

                    return { cards: nextCards, zones: nextZones };
                });

                logPermission({ action: 'removeCard', actorId: actor, allowed: true, details: { cardId } });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'removeCard', args: [cardId], actorId: actor } });
            },

            reorderZoneCards: (zoneId, orderedCardIds, actorId, isRemote) => {
                const actor = actorId ?? get().myPlayerId;
                const zone = get().zones[zoneId];
                if (!zone) return;

                if (zone.ownerId !== actor) {
                    logPermission({
                        action: 'reorderZoneCards',
                        actorId: actor,
                        allowed: false,
                        reason: 'Only zone owner may reorder cards',
                        details: { zoneId }
                    });
                    return;
                }

                const currentIds = zone.cardIds;
                if (currentIds.length !== orderedCardIds.length) return;

                const currentSet = new Set(currentIds);
                const containsSameCards = orderedCardIds.every(id => currentSet.has(id)) && currentIds.every(id => orderedCardIds.includes(id));
                if (!containsSameCards) return;

                set((state) => ({
                    zones: {
                        ...state.zones,
                        [zoneId]: {
                            ...state.zones[zoneId],
                            cardIds: orderedCardIds
                        }
                    }
                }));

                logPermission({ action: 'reorderZoneCards', actorId: actor, allowed: true, details: { zoneId } });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'reorderZoneCards', args: [zoneId, orderedCardIds], actorId: actor } });
            },

            tapCard: (cardId, actorId, isRemote) => {
                const actor = actorId ?? get().myPlayerId;
                const card = get().cards[cardId];
                if (!card) return;

                const zone = get().zones[card.zoneId];
                const permission = canTapCard({ actorId: actor }, card, zone);
                if (!permission.allowed) {
                    logPermission({
                        action: 'tapCard',
                        actorId: actor,
                        allowed: false,
                        reason: permission.reason,
                        details: { cardId, zoneType: zone?.type }
                    });
                    return;
                }
                logPermission({ action: 'tapCard', actorId: actor, allowed: true, details: { cardId } });

                set((state) => {
                    const next = state.cards[cardId];
                    if (!next) return state;
                    return {
                        cards: {
                            ...state.cards,
                            [cardId]: { ...next, tapped: !next.tapped },
                        },
                    };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'tapCard', args: [cardId], actorId: actor } });
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

            drawCard: (playerId, actorId, _isRemote) => {
                const actor = actorId ?? playerId;
                const state = get();
                const libraryZone = getZoneByType(state.zones, playerId, ZONE.LIBRARY);
                const handZone = getZoneByType(state.zones, playerId, ZONE.HAND);

                if (!libraryZone || !handZone || libraryZone.cardIds.length === 0) return;

                const cardId = libraryZone.cardIds[libraryZone.cardIds.length - 1];
                const card = state.cards[cardId];
                if (!card) return;

                const permission = canMoveCard({ actorId: actor, card, fromZone: libraryZone, toZone: handZone });
                if (!permission.allowed) {
                    logPermission({
                        action: 'drawCard',
                        actorId: actor,
                        allowed: false,
                        reason: permission.reason,
                        details: { playerId, cardId }
                    });
                    return;
                }

                logPermission({ action: 'drawCard', actorId: actor, allowed: true, details: { playerId, cardId } });
                state.moveCard(cardId, handZone.id, undefined, actor);
            },

            shuffleLibrary: (playerId, actorId, isRemote) => {
                const actor = actorId ?? playerId;
                const state = get();
                const libraryZone = Object.values(state.zones).find(z => z.ownerId === playerId && z.type === ZONE.LIBRARY);
                if (!libraryZone) return;

                const viewPermission = canViewZone({ actorId: actor }, libraryZone, { viewAll: true });
                if (!viewPermission.allowed) {
                    logPermission({
                        action: 'shuffleLibrary',
                        actorId: actor,
                        allowed: false,
                        reason: viewPermission.reason,
                        details: { playerId }
                    });
                    return;
                }

                set((state) => {
                    const shuffledIds = [...(state.zones[libraryZone.id]?.cardIds || [])].sort(() => Math.random() - 0.5);

                    return {
                        zones: {
                            ...state.zones,
                            [libraryZone.id]: { ...state.zones[libraryZone.id], cardIds: shuffledIds },
                        },
                    };
                });
                logPermission({ action: 'shuffleLibrary', actorId: actor, allowed: true, details: { playerId } });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'shuffleLibrary', args: [playerId], actorId: actor } });
            },

            resetDeck: (playerId, actorId, isRemote) => {
                const actor = actorId ?? playerId;
                const state = get();
                const libraryZone = getZoneByType(state.zones, playerId, ZONE.LIBRARY);
                if (!libraryZone) return;

                const viewPermission = canViewZone({ actorId: actor }, libraryZone, { viewAll: true });
                if (!viewPermission.allowed) {
                    logPermission({
                        action: 'resetDeck',
                        actorId: actor,
                        allowed: false,
                        reason: viewPermission.reason,
                        details: { playerId }
                    });
                    return;
                }

                set((current) => {
                    const nextCards = { ...current.cards };
                    const nextZones = { ...current.zones };

                    const ownedCards = Object.values(current.cards).filter(card => card.ownerId === playerId);
                    const libraryKeeps = nextZones[libraryZone.id]?.cardIds.filter(id => {
                        const card = nextCards[id];
                        return card && card.ownerId !== playerId;
                    }) ?? [];

                    const toLibrary: string[] = [];

                    ownedCards.forEach(card => {
                        const fromZone = nextZones[card.zoneId];
                        if (fromZone) {
                            nextZones[card.zoneId] = {
                                ...fromZone,
                                cardIds: fromZone.cardIds.filter(id => id !== card.id),
                            };
                        }

                        if (card.isToken) {
                            delete nextCards[card.id];
                            return;
                        }

                        nextCards[card.id] = {
                            ...card,
                            zoneId: libraryZone.id,
                            tapped: false,
                            faceDown: false,
                            position: { x: 0, y: 0 },
                        };
                        toLibrary.push(card.id);
                    });

                    const shuffled = [...libraryKeeps, ...toLibrary].sort(() => Math.random() - 0.5);
                    nextZones[libraryZone.id] = { ...nextZones[libraryZone.id], cardIds: shuffled };

                    return { cards: nextCards, zones: nextZones };
                });

                logPermission({ action: 'resetDeck', actorId: actor, allowed: true, details: { playerId } });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'resetDeck', args: [playerId], actorId: actor } });
            },

            unloadDeck: (playerId, actorId, isRemote) => {
                const actor = actorId ?? playerId;
                const state = get();
                const libraryZone = getZoneByType(state.zones, playerId, ZONE.LIBRARY);
                if (!libraryZone) return;

                const viewPermission = canViewZone({ actorId: actor }, libraryZone, { viewAll: true });
                if (!viewPermission.allowed) {
                    logPermission({
                        action: 'unloadDeck',
                        actorId: actor,
                        allowed: false,
                        reason: viewPermission.reason,
                        details: { playerId }
                    });
                    return;
                }

                set((current) => {
                    const nextCards = { ...current.cards };
                    const nextZones: typeof current.zones = {};

                    const removeIds = new Set(Object.values(current.cards).filter(card => card.ownerId === playerId).map(card => card.id));

                    Object.values(current.zones).forEach(zone => {
                        const filteredIds = zone.cardIds.filter(id => !removeIds.has(id));
                        nextZones[zone.id] = { ...zone, cardIds: filteredIds };
                    });

                    removeIds.forEach(id => { delete nextCards[id]; });

                    const nextPlayers = current.players[playerId]
                        ? {
                            ...current.players,
                            [playerId]: { ...current.players[playerId], deckLoaded: false }
                        }
                        : current.players;

                    return { cards: nextCards, zones: nextZones, players: nextPlayers };
                });

                logPermission({ action: 'unloadDeck', actorId: actor, allowed: true, details: { playerId } });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'unloadDeck', args: [playerId], actorId: actor } });
            },

            addGlobalCounter: (name: string, color?: string, isRemote?: boolean) => {
                set((state) => {
                    if (state.globalCounters[name]) return state;
                    return { globalCounters: { ...state.globalCounters, [name]: color || '#6366f1' } };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addGlobalCounter', args: [name, color] } });
            },

            addCounterToCard: (cardId, counter, isRemote) => {
                set((state) => {
                    const card = state.cards[cardId];
                    if (!card) return state;

                    const existingCounterIndex = card.counters.findIndex(c => c.type === counter.type);
                    let newCounters = [...card.counters];

                    if (existingCounterIndex >= 0) {
                        newCounters[existingCounterIndex] = {
                            ...newCounters[existingCounterIndex],
                            count: newCounters[existingCounterIndex].count + counter.count
                        };
                    } else {
                        newCounters.push(counter);
                    }

                    // Update P/T if applicable - REMOVED per user request
                    // Counters no longer affect P/T automatically.
                    const newPower = card.power;
                    const newToughness = card.toughness;

                    return {
                        cards: {
                            ...state.cards,
                            [cardId]: {
                                ...card,
                                counters: newCounters,
                                power: newPower,
                                toughness: newToughness
                            }
                        }
                    };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addCounterToCard', args: [cardId, counter] } });
            },

            removeCounterFromCard: (cardId, counterType, isRemote) => {
                set((state) => {
                    const card = state.cards[cardId];
                    if (!card) return state;

                    const existingCounterIndex = card.counters.findIndex(c => c.type === counterType);
                    if (existingCounterIndex === -1) return state;

                    let newCounters = [...card.counters];
                    const currentCount = newCounters[existingCounterIndex].count;

                    if (currentCount > 1) {
                        newCounters[existingCounterIndex] = {
                            ...newCounters[existingCounterIndex],
                            count: currentCount - 1
                        };
                    } else {
                        newCounters.splice(existingCounterIndex, 1);
                    }

                    // Update P/T logic (reverse of add) - REMOVED per user request
                    const newPower = card.power;
                    const newToughness = card.toughness;

                    return {
                        cards: {
                            ...state.cards,
                            [cardId]: {
                                ...card,
                                counters: newCounters,
                                power: newPower,
                                toughness: newToughness
                            }
                        }
                    };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'removeCounterFromCard', args: [cardId, counterType] } });
            },

            setActiveModal: (modal) => {
                set({ activeModal: modal });
            },
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
                // Migrate legacy commander zone type from 'command' -> 'commander'
                if (state?.zones) {
                    const migratedZones: typeof state.zones = {};
                    Object.values(state.zones).forEach(zone => {
                        const isLegacyCommander = (zone as any).type === 'command';
                        if (isLegacyCommander) {
                            migratedZones[zone.id] = { ...zone, type: ZONE.COMMANDER };
                        } else {
                            migratedZones[zone.id] = zone;
                        }
                    });
                    state.zones = migratedZones;
                }
                state?.setHasHydrated(true);
            },
        }
    )
);
