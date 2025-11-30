import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Card, GameState, Zone } from '../types';
import { peerService } from '../services/peerService';
import { findAvailablePosition, getSnappedPosition, SNAP_GRID_SIZE } from '../lib/snapping';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../lib/constants';
import { getZoneByType } from '../lib/gameSelectors';
import { ZONE } from '../constants/zones';
import { canCreateToken, canMoveCard, canTapCard, canUpdatePlayer, canViewZone } from '../rules/permissions';
import { logPermission } from '../rules/logger';
import { getCardFaces, getCurrentFaceIndex, isTransformableCard, syncCardStatsToFace } from '../lib/cardDisplay';
import { decrementCounter, enforceZoneCounterRules, isBattlefieldZone, mergeCounters, resolveCounterColor } from '../lib/counters';
import { emitLog } from '../logging/logStore';

interface GameStore extends GameState {
    // Additional actions or computed properties can go here
}

export const useGameStore = create<GameStore>()(
    persist(
        (set, get) => {
            const buildLogContext = () => {
                const snapshot = get();
                return {
                    players: snapshot.players,
                    cards: snapshot.cards,
                    zones: snapshot.zones,
                };
            };

            return ({
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
                        players: { ...state.players, [player.id]: { ...player, deckLoaded: false, commanderTax: 0 } },
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

                    if (typeof updates.life === 'number' && updates.life !== player.life) {
                        emitLog('player.life', { actorId: actor, playerId: id, from: player.life, to: updates.life, delta: updates.life - player.life }, buildLogContext());
                    }

                    set((state) => ({
                        players: {
                            ...state.players,
                            [id]: { ...state.players[id], ...updates },
                        },
                    }));
                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'updatePlayer', args: [id, updates], actorId: actor } });
                },

                updateCommanderTax: (playerId, delta, isRemote) => {
                    const player = get().players[playerId];
                    if (!player) return;
                    const from = player.commanderTax || 0;
                    const to = Math.max(0, from + delta);

                    set((state) => {
                        const current = state.players[playerId];
                        if (!current) return state;
                        return {
                            players: {
                                ...state.players,
                                [playerId]: { ...current, commanderTax: to }
                            }
                        };
                    });

                    emitLog('player.commanderTax', { actorId: playerId, playerId, from, to, delta: to - from }, buildLogContext());
                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'updateCommanderTax', args: [playerId, delta] } });
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
                    const initializedCard = { ...card, currentFaceIndex: card.currentFaceIndex ?? 0 };
                    if (card.scryfall && !card.power && !card.toughness) {
                        const frontFace = card.scryfall.card_faces?.[0];
                        initializedCard.power = card.scryfall.power ?? frontFace?.power;
                        initializedCard.toughness = card.scryfall.toughness ?? frontFace?.toughness;
                        initializedCard.basePower = card.scryfall.power ?? frontFace?.power;
                        initializedCard.baseToughness = card.scryfall.toughness ?? frontFace?.toughness;
                    }
                    const faces = getCardFaces(initializedCard);
                    if (faces.length) {
                        initializedCard.currentFaceIndex = Math.min(Math.max(initializedCard.currentFaceIndex ?? 0, 0), faces.length - 1);
                    }
                    const cardWithFaceStats = syncCardStatsToFace(initializedCard, initializedCard.currentFaceIndex);

                    set((state) => {
                        const targetZone = state.zones[cardWithFaceStats.zoneId];
                        const cardWithCounters = {
                            ...cardWithFaceStats,
                            counters: enforceZoneCounterRules(cardWithFaceStats.counters, targetZone)
                        };

                        return {
                            cards: { ...state.cards, [cardWithFaceStats.id]: cardWithCounters },
                            zones: {
                                ...state.zones,
                                [cardWithFaceStats.zoneId]: {
                                    ...state.zones[cardWithFaceStats.zoneId],
                                    cardIds: [...state.zones[cardWithFaceStats.zoneId].cardIds, cardWithFaceStats.id],
                                },
                            },
                        };
                    });
                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addCard', args: [cardWithFaceStats] } });
                },

                duplicateCard: (cardId, actorId, isRemote) => {
                    const actor = actorId ?? get().myPlayerId;
                    const state = get();
                    const sourceCard = state.cards[cardId];
                    if (!sourceCard) return;

                    const currentZone = state.zones[sourceCard.zoneId];
                    if (!currentZone) return;

                    const tokenPermission = canCreateToken({ actorId: actor }, currentZone);
                    if (!tokenPermission.allowed) {
                        logPermission({ action: 'duplicateCard', actorId: actor, allowed: false, reason: tokenPermission.reason, details: { cardId, zoneId: currentZone.id } });
                        return;
                    }

                    const newCardId = uuidv4();
                    const basePosition = {
                        x: sourceCard.position.x + SNAP_GRID_SIZE,
                        y: sourceCard.position.y + SNAP_GRID_SIZE,
                    };
                    const position = findAvailablePosition(basePosition, currentZone.cardIds, state.cards);
                    const clonedCard: Card = {
                        ...sourceCard,
                        id: newCardId,
                        isToken: true,
                        position,
                        counters: sourceCard.counters.map(counter => ({ ...counter })),
                    };

                    logPermission({ action: 'duplicateCard', actorId: actor, allowed: true, details: { cardId, newCardId, zoneId: currentZone.id } });
                    emitLog('card.duplicate', { actorId: actor, sourceCardId: cardId, newCardId, zoneId: currentZone.id }, buildLogContext());
                    get().addCard(clonedCard, isRemote);
                },

            updateCard: (id, updates, actorId, isRemote) => {
                const actor = actorId ?? get().myPlayerId;
                const cardBefore = get().cards[id];

                // Log P/T changes before applying update
                if (cardBefore) {
                    const newPower = updates.power ?? cardBefore.power;
                    const newToughness = updates.toughness ?? cardBefore.toughness;
                    const powerChanged = newPower !== cardBefore.power;
                    const toughnessChanged = newToughness !== cardBefore.toughness;
                    if ((powerChanged || toughnessChanged) && (newPower !== undefined || newToughness !== undefined)) {
                        emitLog(
                            'card.pt',
                            {
                                actorId: actor,
                                cardId: id,
                                zoneId: cardBefore.zoneId,
                                fromPower: cardBefore.power,
                                fromToughness: cardBefore.toughness,
                                toPower: newPower ?? cardBefore.power,
                                toToughness: newToughness ?? cardBefore.toughness,
                            },
                            buildLogContext()
                        );
                    }
                }

                set((state) => {
                    const current = state.cards[id];
                    if (!current) return state;

                    const nextZoneId = updates.zoneId ?? current.zoneId;
                    const zone = state.zones[nextZoneId];
                    const mergedCard = { ...current, ...updates, zoneId: nextZoneId };
                    const faces = getCardFaces(mergedCard);
                    const normalizedFaceIndex = faces.length
                        ? Math.min(Math.max(mergedCard.currentFaceIndex ?? 0, 0), faces.length - 1)
                        : mergedCard.currentFaceIndex;

                    const faceChanged = (normalizedFaceIndex ?? mergedCard.currentFaceIndex) !== current.currentFaceIndex;
                    const cardWithFace = faceChanged
                        ? syncCardStatsToFace(
                            { ...mergedCard, currentFaceIndex: faces.length ? normalizedFaceIndex : mergedCard.currentFaceIndex },
                            normalizedFaceIndex ?? mergedCard.currentFaceIndex
                        )
                        : syncCardStatsToFace(
                            { ...mergedCard, currentFaceIndex: faces.length ? normalizedFaceIndex : mergedCard.currentFaceIndex },
                            normalizedFaceIndex ?? mergedCard.currentFaceIndex,
                            { preserveExisting: true }
                        );

                    return {
                        cards: {
                            ...state.cards,
                            [id]: { ...cardWithFace, counters: enforceZoneCounterRules(cardWithFace.counters, zone) },
                        },
                    };
                });
                if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'updateCard', args: [id, updates], actorId: actor } });
            },

                transformCard: (cardId, faceIndex, isRemote) => {
                    const snapshot = get();
                    const card = snapshot.cards[cardId];
                    if (!card) return;

                    const zone = snapshot.zones[card.zoneId];
                    if (zone?.type !== ZONE.BATTLEFIELD) return;
                    if (!isTransformableCard(card)) return;

                    const faces = getCardFaces(card);
                    const targetIndex = faces.length
                        ? typeof faceIndex === "number"
                            ? Math.min(Math.max(faceIndex, 0), faces.length - 1)
                            : (getCurrentFaceIndex(card) + 1) % faces.length
                        : 0;

                    const targetFaceName = faces[targetIndex]?.name;

                    emitLog('card.transform', { actorId: card.controllerId, cardId, zoneId: card.zoneId, toFaceName: targetFaceName }, buildLogContext());

                    set((state) => {
                        const currentCard = state.cards[cardId];
                        if (!currentCard) return state;
                        return {
                            cards: {
                                ...state.cards,
                                [cardId]: syncCardStatsToFace(currentCard, targetIndex)
                            }
                        };
                    });

                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'transformCard', args: [cardId, targetIndex] } });
                },

            moveCard: (cardId, toZoneId, position, actorId, isRemote, opts) => {
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

                if (!opts?.suppressLog) {
                    emitLog('card.move', { actorId: actor, cardId, fromZoneId, toZoneId }, buildLogContext());
                }

                    const leavingBattlefield = fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
                    const resetToFront = leavingBattlefield ? syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0) : card;

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
                        const nextCounters = enforceZoneCounterRules(card.counters, toZone);

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
                            const nextCard = leavingBattlefield ? resetToFront : card;
                            cardsCopy[cardId] = {
                                ...nextCard,
                                position: newPosition,
                                tapped: nextTapped,
                                counters: nextCounters,
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

                        const nextCard = leavingBattlefield ? resetToFront : card;
                        cardsCopy[cardId] = {
                            ...nextCard,
                            zoneId: toZoneId,
                            position: newPosition,
                            tapped: nextTapped,
                            counters: nextCounters,
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

                    emitLog('card.move', { actorId: actor, cardId, fromZoneId, toZoneId }, buildLogContext());

                    const leavingBattlefield = fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;

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
                        const nextCounters = enforceZoneCounterRules(card.counters, toZone);
                        const resetToFront = syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0);

                        const nextCard = leavingBattlefield ? resetToFront : card;
                        cardsCopy[cardId] = {
                            ...nextCard,
                            zoneId: toZoneId,
                            tapped: nextTapped,
                            counters: nextCounters,
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

                    emitLog('card.remove', { actorId: actor, cardId, zoneId: zone.id }, buildLogContext());

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

                    const newTapped = !card.tapped;
                    emitLog('card.tap', { actorId: actor, cardId, zoneId: card.zoneId, tapped: newTapped }, buildLogContext());

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
                    emitLog('card.untapAll', { actorId: playerId, playerId }, buildLogContext());
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
                state.moveCard(cardId, handZone.id, undefined, actor, undefined, { suppressLog: true });

                emitLog('card.draw', { actorId: actor, playerId, count: 1 }, buildLogContext());
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

                    emitLog('library.shuffle', { actorId: actor, playerId }, buildLogContext());
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

                            const resetCard = syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0);
                            nextCards[card.id] = {
                                ...resetCard,
                                zoneId: libraryZone.id,
                                tapped: false,
                                faceDown: false,
                                position: { x: 0, y: 0 },
                                counters: enforceZoneCounterRules(resetCard.counters, libraryZone),
                            };
                            toLibrary.push(card.id);
                        });

                        const shuffled = [...libraryKeeps, ...toLibrary].sort(() => Math.random() - 0.5);
                        nextZones[libraryZone.id] = { ...nextZones[libraryZone.id], cardIds: shuffled };

                        return { cards: nextCards, zones: nextZones };
                    });

                    logPermission({ action: 'resetDeck', actorId: actor, allowed: true, details: { playerId } });
                    emitLog('deck.reset', { actorId: actor, playerId }, buildLogContext());
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
                    emitLog('deck.unload', { actorId: actor, playerId }, buildLogContext());
                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'unloadDeck', args: [playerId], actorId: actor } });
                },

                addGlobalCounter: (name: string, color?: string, isRemote?: boolean) => {
                    const existing = get().globalCounters[name];
                    if (existing) return;

                    const resolvedColor = resolveCounterColor(name, get().globalCounters);

                    set((state) => ({
                        globalCounters: { ...state.globalCounters, [name]: color || resolvedColor }
                    }));

                    emitLog('counter.global.add', { counterType: name, color: color || resolvedColor }, buildLogContext());
                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addGlobalCounter', args: [name, color] } });
                },

                addCounterToCard: (cardId, counter, isRemote) => {
                    const state = get();
                    const card = state.cards[cardId];
                    if (!card) return;

                    const zone = state.zones[card.zoneId];
                    if (!isBattlefieldZone(zone)) return;

                    const prevCount = card.counters.find(c => c.type === counter.type)?.count ?? 0;
                    const newCounters = mergeCounters(card.counters, counter);
                    const nextCount = newCounters.find(c => c.type === counter.type)?.count ?? prevCount;
                    const delta = nextCount - prevCount;
                    if (delta <= 0) return;

                    set((current) => {
                        const currentCard = current.cards[cardId];
                        if (!currentCard) return current;
                        return {
                            cards: {
                                ...current.cards,
                                [cardId]: {
                                    ...currentCard,
                                    counters: newCounters,
                                }
                            }
                        };
                    });

                    emitLog('counter.add', { actorId: card.controllerId, cardId, zoneId: card.zoneId, counterType: counter.type, delta, newTotal: nextCount }, buildLogContext());
                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'addCounterToCard', args: [cardId, counter] } });
                },

                removeCounterFromCard: (cardId, counterType, isRemote) => {
                    const state = get();
                    const card = state.cards[cardId];
                    if (!card) return;

                    const zone = state.zones[card.zoneId];
                    if (!isBattlefieldZone(zone)) return;

                    const prevCount = card.counters.find(c => c.type === counterType)?.count ?? 0;
                    const newCounters = decrementCounter(card.counters, counterType);
                    const nextCount = newCounters.find(c => c.type === counterType)?.count ?? 0;
                    const delta = nextCount - prevCount;
                    if (delta === 0) return;

                    set((current) => {
                        const currentCard = current.cards[cardId];
                        if (!currentCard) return current;
                        return {
                            cards: {
                                ...current.cards,
                                [cardId]: {
                                    ...currentCard,
                                    counters: newCounters,
                                }
                            }
                        };
                    });

                    emitLog('counter.remove', { actorId: card.controllerId, cardId, zoneId: card.zoneId, counterType, delta, newTotal: nextCount }, buildLogContext());
                    if (!isRemote) peerService.broadcast({ type: 'ACTION', payload: { action: 'removeCounterFromCard', args: [cardId, counterType] } });
                },

                setActiveModal: (modal) => {
                    set({ activeModal: modal });
                },
            });
        },
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
                // Strip counters from any cards not on the battlefield to enforce counter rules on load
                if (state?.cards && state?.zones) {
                    const migratedCounters: typeof state.cards = {};
                    Object.values(state.cards).forEach(card => {
                        const zone = state.zones[card.zoneId];
                        const counters = enforceZoneCounterRules(card.counters, zone);
                        migratedCounters[card.id] = counters === card.counters ? card : { ...card, counters };
                    });
                    state.cards = migratedCounters;
                }
                state?.setHasHydrated(true);
            },
        }
    )
);
