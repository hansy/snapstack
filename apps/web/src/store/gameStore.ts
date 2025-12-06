import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Card, GameState, Zone } from '../types';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from '../lib/constants';
import { getZoneByType } from '../lib/gameSelectors';
import { ZONE } from '../constants/zones';
import { canCreateToken, canMoveCard, canTapCard, canUpdatePlayer, canViewZone } from '../rules/permissions';
import { logPermission } from '../rules/logger';
import { getCardFaces, getCurrentFaceIndex, isTransformableCard, syncCardStatsToFace } from '../lib/cardDisplay';
import { decrementCounter, enforceZoneCounterRules, isBattlefieldZone, mergeCounters, resolveCounterColor } from '../lib/counters';
import { emitLog, clearLogs } from '../logging/logStore';
import { getYDocHandles, runWithSharedDoc } from '../yjs/yManager';
import { addCounterToCard as yAddCounterToCard, duplicateCard as yDuplicateCard, moveCard as yMoveCard, removeCard as yRemoveCard, removeCounterFromCard as yRemoveCounterFromCard, reorderZoneCards as yReorderZoneCards, transformCard as yTransformCard, upsertCard as yUpsertCard, upsertPlayer as yUpsertPlayer, upsertZone as yUpsertZone, SharedMaps } from '../yjs/yMutations';
import { bumpPosition, clampNormalizedPosition, findAvailablePositionNormalized, GRID_STEP_Y, migratePositionToNormalized, positionsRoughlyEqual } from '../lib/positions';

interface GameStore extends GameState {
    // Additional actions or computed properties can go here
}

const createSafeStorage = (): Storage => {
    if (typeof window === 'undefined' || !window?.localStorage) {
        const store = new Map<string, string>();
        return {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => { store.set(key, value); },
            removeItem: (key: string) => { store.delete(key); },
            clear: () => store.clear(),
            key: (index: number) => Array.from(store.keys())[index] ?? null,
            get length() {
                return store.size;
            },
        } as Storage;
    }

    return window.localStorage;
};

export const useGameStore = create<GameStore>()(
    persist(
        (set, get) => {
            const applyShared = (fn: (maps: SharedMaps) => void) => runWithSharedDoc(fn);

            const syncSnapshotToShared = (state: GameState) => {
                const handles = getYDocHandles();
                if (!handles) return;
                const sync = (data: Record<string, any>, map: any) => {
                    map.forEach((_value: any, key: string) => {
                        if (!Object.prototype.hasOwnProperty.call(data, key)) map.delete(key);
                    });
                    Object.entries(data).forEach(([key, value]) => map.set(key, value as any));
                };
                handles.doc.transact(() => {
                    sync(state.players, handles.players);
                    sync(state.zones, handles.zones);
                    sync(state.cards, handles.cards);
                    sync(state.globalCounters, handles.globalCounters);
                });
            };

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
                battlefieldViewScale: {},
                playerIdsBySession: {},
                sessionVersions: {},
                sessionId: uuidv4(), // Generate a new session ID by default
                myPlayerId: uuidv4(), // Generate a temporary ID for the local player
                hasHydrated: false,
                positionFormat: 'normalized',
                globalCounters: {},
                activeModal: null,

                resetSession: (newSessionId, playerId) => {
                    const freshSessionId = newSessionId ?? uuidv4();
                    const freshPlayerId = playerId ?? get().playerIdsBySession[freshSessionId] ?? uuidv4();

                    clearLogs();

                    set((state) => ({
                        players: {},
                        cards: {},
                        zones: {},
                        battlefieldViewScale: {},
                        sessionId: freshSessionId,
                        myPlayerId: freshPlayerId,
                        playerIdsBySession: { ...state.playerIdsBySession, [freshSessionId]: freshPlayerId },
                        sessionVersions: { ...state.sessionVersions, [freshSessionId]: (state.sessionVersions[freshSessionId] ?? 0) + 1 },
                        globalCounters: {},
                        activeModal: null,
                    }));
                },

                ensurePlayerIdForSession: (sessionId: string) => {
                    const existing = get().playerIdsBySession[sessionId];
                    if (existing) return existing;
                    const fresh = uuidv4();
                    set((state) => ({
                        playerIdsBySession: { ...state.playerIdsBySession, [sessionId]: fresh },
                    }));
                    return fresh;
                },

                forgetSessionIdentity: (sessionId: string) => {
                    set((state) => {
                        const next = { ...state.playerIdsBySession };
                        delete next[sessionId];
                        const nextVersions = { ...state.sessionVersions };
                        nextVersions[sessionId] = (nextVersions[sessionId] ?? 0) + 1;
                        return { playerIdsBySession: next, sessionVersions: nextVersions };
                    });
                },

                ensureSessionVersion: (sessionId: string) => {
                    const current = get().sessionVersions[sessionId];
                    if (typeof current === 'number') return current;
                    const next = 1;
                    set((state) => ({
                        sessionVersions: { ...state.sessionVersions, [sessionId]: next },
                    }));
                    return next;
                },

                setHasHydrated: (state) => {
                    set({ hasHydrated: state });
                },

                addPlayer: (player, _isRemote) => {
                    const normalized = { ...player, deckLoaded: false, commanderTax: 0 };
                    if (applyShared((maps) => yUpsertPlayer(maps, normalized))) return;
                    set((state) => ({
                        players: { ...state.players, [normalized.id]: normalized },
                    }));
                },

                updatePlayer: (id, updates, actorId, _isRemote) => {
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

                    if (applyShared((maps) => {
                        const current = maps.players.get(id) as any;
                        if (!current) return;
                        maps.players.set(id, { ...current, ...updates });
                    })) return;

                    set((state) => ({
                        players: {
                            ...state.players,
                            [id]: { ...state.players[id], ...updates },
                        },
                    }));
                },

                updateCommanderTax: (playerId, delta, actorId, _isRemote) => {
                    const actor = actorId ?? get().myPlayerId;
                    const player = get().players[playerId];
                    if (!player) return;
                    if (actor !== playerId) {
                        logPermission({ action: 'updateCommanderTax', actorId: actor, allowed: false, reason: 'Only the player may change their commander tax', details: { playerId, delta } });
                        return;
                    }

                    const from = player.commanderTax || 0;
                    const to = Math.max(0, from + delta);

                    if (applyShared((maps) => {
                        const current = maps.players.get(playerId) as any;
                        if (!current) return;
                        maps.players.set(playerId, { ...current, commanderTax: to });
                    })) return;

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

                    logPermission({ action: 'updateCommanderTax', actorId: actor, allowed: true, details: { playerId, delta } });
                    emitLog('player.commanderTax', { actorId: actor, playerId, from, to, delta: to - from }, buildLogContext());
                },

                setDeckLoaded: (playerId, loaded, _isRemote) => {
                    if (applyShared((maps) => {
                        const current = maps.players.get(playerId) as any;
                        if (!current) return;
                        maps.players.set(playerId, { ...current, deckLoaded: loaded });
                    })) return;

                    set((state) => ({
                        players: {
                            ...state.players,
                            [playerId]: { ...state.players[playerId], deckLoaded: loaded }
                        }
                    }));
                },

                addZone: (zone: Zone, _isRemote?: boolean) => {
                    if (applyShared((maps) => yUpsertZone(maps, zone))) return;
                    set((state) => ({
                        zones: { ...state.zones, [zone.id]: zone },
                    }));
                },

                addCard: (card, _isRemote) => {
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
                    const normalizedCard = {
                        ...cardWithFaceStats,
                        position: (cardWithFaceStats.position?.x > 1 || cardWithFaceStats.position?.y > 1)
                            ? migratePositionToNormalized(cardWithFaceStats.position)
                            : clampNormalizedPosition(cardWithFaceStats.position || { x: 0.5, y: 0.5 }),
                    };

                    if (applyShared((maps) => {
                        yUpsertCard(maps, normalizedCard);
                        const zone = maps.zones.get(normalizedCard.zoneId) as Zone | undefined;
                        if (zone) {
                            maps.zones.set(normalizedCard.zoneId, { ...zone, cardIds: [...zone.cardIds, normalizedCard.id] });
                        }
                    })) return;

                    set((state) => {
                        const targetZone = state.zones[normalizedCard.zoneId];
                        const cardWithCounters = {
                            ...normalizedCard,
                            counters: enforceZoneCounterRules(normalizedCard.counters, targetZone)
                        };

                        return {
                            cards: { ...state.cards, [cardWithCounters.id]: cardWithCounters },
                            zones: {
                                ...state.zones,
                                [cardWithCounters.zoneId]: {
                                    ...state.zones[cardWithCounters.zoneId],
                                    cardIds: [...state.zones[cardWithCounters.zoneId].cardIds, cardWithCounters.id],
                                },
                            },
                        };
                    });
                },

                duplicateCard: (cardId, actorId, _isRemote) => {
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
                    const basePosition = bumpPosition(clampNormalizedPosition(sourceCard.position));
                    const position = findAvailablePositionNormalized(basePosition, currentZone.cardIds, state.cards);
                    const clonedCard: Card = {
                        ...sourceCard,
                        id: newCardId,
                        isToken: true,
                        position,
                        counters: sourceCard.counters.map(counter => ({ ...counter })),
                    };

                    logPermission({ action: 'duplicateCard', actorId: actor, allowed: true, details: { cardId, newCardId, zoneId: currentZone.id } });
                    emitLog('card.duplicate', { actorId: actor, sourceCardId: cardId, newCardId, zoneId: currentZone.id, cardName: sourceCard.name }, buildLogContext());
                    if (applyShared((maps) => yDuplicateCard(maps, cardId, newCardId))) return;
                    get().addCard(clonedCard, _isRemote);
                },

                updateCard: (id, updates, actorId, _isRemote) => {
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
                                    cardName: cardBefore.name,
                                },
                                buildLogContext()
                            );
                        }
                    }

                    if (applyShared((maps) => {
                        const current = maps.cards.get(id) as Card | undefined;
                        if (!current) return;
                        const nextZoneId = updates.zoneId ?? current.zoneId;
                        const zone = maps.zones.get(nextZoneId) as Zone | undefined;
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

                        maps.cards.set(id, { ...cardWithFace, counters: enforceZoneCounterRules(cardWithFace.counters, zone) });
                    })) return;

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
                },

                transformCard: (cardId, faceIndex, _isRemote) => {
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

                    emitLog('card.transform', { actorId: card.controllerId, cardId, zoneId: card.zoneId, toFaceName: targetFaceName, cardName: card.name }, buildLogContext());

                    if (applyShared((maps) => yTransformCard(maps, cardId, targetIndex))) return;

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
                },

                moveCard: (cardId, toZoneId, position, actorId, _isRemote, opts) => {
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

                    const bothBattlefields = fromZone.type === ZONE.BATTLEFIELD && toZone.type === ZONE.BATTLEFIELD;
                    const sameBattlefield = bothBattlefields && fromZoneId === toZoneId;
                    const controlShift = bothBattlefields && fromZone.ownerId !== toZone.ownerId;

                    if (!opts?.suppressLog && !sameBattlefield) {
                        const movePayload: any = {
                            actorId: actor,
                            cardId,
                            fromZoneId,
                            toZoneId,
                            cardName: opts?.faceDown ? 'a card' : card.name,
                            fromZoneType: fromZone.type,
                            toZoneType: toZone.type,
                            faceDown: opts?.faceDown,
                        };
                        if (controlShift) movePayload.gainsControlBy = toZone.ownerId;
                        emitLog('card.move', movePayload, buildLogContext());
                    }

                    if (applyShared((maps) => {
                        const sharedCard = maps.cards.get(cardId) as Card | undefined;
                        const sharedFrom = maps.zones.get(fromZoneId) as Zone | undefined;
                        const sharedTo = maps.zones.get(toZoneId) as Zone | undefined;
                        if (!sharedCard || !sharedFrom || !sharedTo) return;

                        const tokenLeavingBattlefield = sharedCard.isToken && sharedTo.type !== ZONE.BATTLEFIELD;
                        if (tokenLeavingBattlefield) {
                            maps.cards.delete(cardId);
                            maps.zones.set(fromZoneId, { ...sharedFrom, cardIds: sharedFrom.cardIds.filter((id) => id !== cardId) });
                            maps.zones.set(toZoneId, { ...sharedTo, cardIds: sharedTo.cardIds.filter((id) => id !== cardId) });
                            return;
                        }

                        yMoveCard(maps, cardId, toZoneId, position);

                        // Determine new faceDown state
                        let newFaceDown = opts?.faceDown;
                        if (newFaceDown === undefined) {
                            // If not specified, default to false unless moving between battlefields
                            const isBattlefieldToBattlefield = sharedFrom.type === ZONE.BATTLEFIELD && sharedTo.type === ZONE.BATTLEFIELD;
                            if (!isBattlefieldToBattlefield) {
                                newFaceDown = false;
                            }
                        }

                        if (newFaceDown !== undefined) {
                            const movedCard = maps.cards.get(cardId) as Card;
                            if (movedCard && movedCard.faceDown !== newFaceDown) {
                                maps.cards.set(cardId, { ...movedCard, faceDown: newFaceDown });
                            }
                        }
                    })) return;

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
                        return;
                    }

                    set((state) => {
                        const cardsCopy = { ...state.cards };
                        const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;
                        const nextCounters = enforceZoneCounterRules(card.counters, toZone);
                        const normalizedInput = position && (position.x > 1 || position.y > 1)
                            ? migratePositionToNormalized(position)
                            : position;
                        const providedPosition = normalizedInput ?? card.position;
                        let newPosition = clampNormalizedPosition(providedPosition);

                        // Only apply collision nudging if moving to a battlefield (free-form layout)
                        if (toZone.type === ZONE.BATTLEFIELD && position) {
                            const otherCardIds = toZone.cardIds.filter(id => id !== cardId);
                            for (const otherId of otherCardIds) {
                                const otherCard = cardsCopy[otherId];
                                if (!otherCard) continue;

                                if (positionsRoughlyEqual(otherCard.position, newPosition)) {
                                    let candidateY = otherCard.position.y + GRID_STEP_Y;
                                    const candidateX = newPosition.x;

                                    // Cascade down until this spot is free in the target zone
                                    let occupied = true;
                                    while (occupied) {
                                        occupied = false;
                                        for (const checkId of otherCardIds) {
                                            if (checkId === otherId) continue;
                                            const checkCard = cardsCopy[checkId];
                                            if (!checkCard) continue;
                                            if (positionsRoughlyEqual(checkCard.position, { x: candidateX, y: candidateY })) {
                                                candidateY += GRID_STEP_Y;
                                                occupied = true;
                                                break;
                                            }
                                        }
                                    }

                                    cardsCopy[otherId] = {
                                        ...otherCard,
                                        position: clampNormalizedPosition({
                                            ...otherCard.position,
                                            x: candidateX,
                                            y: candidateY,
                                        }),
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
                                faceDown: opts?.faceDown ?? nextCard.faceDown,
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

                        // Determine new faceDown state
                        let newFaceDown = opts?.faceDown;
                        if (newFaceDown === undefined) {
                            // If not specified, default to false unless moving between battlefields
                            if (!bothBattlefields) {
                                newFaceDown = false;
                            } else {
                                newFaceDown = nextCard.faceDown;
                            }
                        }

                        cardsCopy[cardId] = {
                            ...nextCard,
                            zoneId: toZoneId,
                            position: newPosition,
                            tapped: nextTapped,
                            counters: nextCounters,
                            faceDown: newFaceDown,
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
                },

                moveCardToBottom: (cardId, toZoneId, actorId, _isRemote) => {
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

                    const bothBattlefields = fromZone.type === ZONE.BATTLEFIELD && toZone.type === ZONE.BATTLEFIELD;
                    const sameBattlefield = bothBattlefields && fromZoneId === toZoneId;
                    const controlShift = bothBattlefields && fromZone.ownerId !== toZone.ownerId;

                    if (!sameBattlefield) {
                        const movePayload: any = {
                            actorId: actor,
                            cardId,
                            fromZoneId,
                            toZoneId,
                            cardName: card.name,
                            fromZoneType: fromZone.type,
                            toZoneType: toZone.type,
                        };
                        if (controlShift) movePayload.gainsControlBy = toZone.ownerId;
                        emitLog('card.move', movePayload, buildLogContext());
                    }

                    if (applyShared((maps) => {
                        const sharedCard = maps.cards.get(cardId) as Card | undefined;
                        const sharedFrom = maps.zones.get(fromZoneId) as Zone | undefined;
                        const sharedTo = maps.zones.get(toZoneId) as Zone | undefined;
                        if (!sharedCard || !sharedFrom || !sharedTo) return;

                        const tokenLeavingBattlefield = sharedCard.isToken && sharedTo.type !== ZONE.BATTLEFIELD;
                        if (tokenLeavingBattlefield) {
                            maps.cards.delete(cardId);
                            maps.zones.set(fromZoneId, { ...sharedFrom, cardIds: sharedFrom.cardIds.filter((id) => id !== cardId) });
                            maps.zones.set(toZoneId, { ...sharedTo, cardIds: sharedTo.cardIds.filter((id) => id !== cardId) });
                            return;
                        }

                        // place at bottom (front) of toZone
                        const newFromIds = sharedFrom.cardIds.filter((id) => id !== cardId);
                        const newToIds = fromZoneId === toZoneId ? [cardId, ...newFromIds] : [cardId, ...sharedTo.cardIds];
                        maps.cards.set(cardId, {
                            ...sharedCard,
                            zoneId: toZoneId,
                            tapped: sharedTo.type === ZONE.BATTLEFIELD ? sharedCard.tapped : false,
                            counters: enforceZoneCounterRules(sharedCard.counters, sharedTo),
                        });
                        maps.zones.set(fromZoneId, { ...sharedFrom, cardIds: newFromIds });
                        maps.zones.set(toZoneId, { ...sharedTo, cardIds: newToIds });
                    })) return;

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
                },

                removeCard: (cardId, actorId, _isRemote) => {
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

                    emitLog('card.remove', { actorId: actor, cardId, zoneId: zone.id, cardName: card.name }, buildLogContext());

                    if (applyShared((maps) => yRemoveCard(maps, cardId))) return;

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
                },

                reorderZoneCards: (zoneId, orderedCardIds, actorId, _isRemote) => {
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

                    if (applyShared((maps) => yReorderZoneCards(maps, zoneId, orderedCardIds))) return;

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
                },

                tapCard: (cardId, actorId, _isRemote) => {
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
                    emitLog('card.tap', { actorId: actor, cardId, zoneId: card.zoneId, tapped: newTapped, cardName: card.name }, buildLogContext());

                    if (applyShared((maps) => {
                        const current = maps.cards.get(cardId) as Card | undefined;
                        if (!current) return;
                        maps.cards.set(cardId, { ...current, tapped: !current.tapped });
                    })) return;

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
                },

                untapAll: (playerId, _isRemote) => {
                    if (applyShared((maps) => {
                        maps.cards.forEach((card: Card, key: string) => {
                            if (card.controllerId === playerId && card.tapped) {
                                maps.cards.set(key, { ...card, tapped: false });
                            }
                        });
                    })) return;

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

                shuffleLibrary: (playerId, actorId, _isRemote) => {
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

                    const sharedApplied = applyShared((maps) => {
                        const zone = maps.zones.get(libraryZone.id) as Zone | undefined;
                        if (!zone) return;
                        const shuffledIds = [...(zone.cardIds || [])].sort(() => Math.random() - 0.5);
                        maps.zones.set(libraryZone.id, { ...zone, cardIds: shuffledIds });
                    });

                    if (!sharedApplied) {
                        set((state) => {
                            const shuffledIds = [...(state.zones[libraryZone.id]?.cardIds || [])].sort(() => Math.random() - 0.5);

                            return {
                                zones: {
                                    ...state.zones,
                                    [libraryZone.id]: { ...state.zones[libraryZone.id], cardIds: shuffledIds },
                                },
                            };
                        });
                    }

                    logPermission({ action: 'shuffleLibrary', actorId: actor, allowed: true, details: { playerId } });

                    emitLog('library.shuffle', { actorId: actor, playerId }, buildLogContext());
                },

                resetDeck: (playerId, actorId, _isRemote) => {
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

                    syncSnapshotToShared(get());

                    logPermission({ action: 'resetDeck', actorId: actor, allowed: true, details: { playerId } });
                    emitLog('deck.reset', { actorId: actor, playerId }, buildLogContext());
                },

                unloadDeck: (playerId, actorId, _isRemote) => {
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

                    syncSnapshotToShared(get());

                    logPermission({ action: 'unloadDeck', actorId: actor, allowed: true, details: { playerId } });
                    emitLog('deck.unload', { actorId: actor, playerId }, buildLogContext());
                },

                addGlobalCounter: (name: string, color?: string, _isRemote?: boolean) => {
                    const existing = get().globalCounters[name];
                    if (existing) return;

                    const resolvedColor = resolveCounterColor(name, get().globalCounters);

                    if (applyShared((maps) => {
                        const current = maps.globalCounters.get(name) as string | undefined;
                        if (current) return;
                        maps.globalCounters.set(name, color || resolvedColor);
                    })) return;

                    set((state) => ({
                        globalCounters: { ...state.globalCounters, [name]: color || resolvedColor }
                    }));

                    emitLog('counter.global.add', { counterType: name, color: color || resolvedColor }, buildLogContext());
                },

                addCounterToCard: (cardId, counter, actorId, _isRemote) => {
                    const state = get();
                    const card = state.cards[cardId];
                    if (!card) return;

                    const actor = actorId ?? state.myPlayerId;
                    const zone = state.zones[card.zoneId];
                    if (!isBattlefieldZone(zone)) return;

                    if (actor !== card.ownerId) {
                        logPermission({ action: 'addCounterToCard', actorId: actor, allowed: false, reason: 'Only the card owner may add counters', details: { cardId, zoneId: card.zoneId, counterType: counter.type } });
                        return;
                    }

                    const prevCount = card.counters.find(c => c.type === counter.type)?.count ?? 0;
                    const newCounters = mergeCounters(card.counters, counter);
                    const nextCount = newCounters.find(c => c.type === counter.type)?.count ?? prevCount;
                    const delta = nextCount - prevCount;
                    if (delta <= 0) return;

                    if (applyShared((maps) => yAddCounterToCard(maps, cardId, counter))) return;

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

                    logPermission({ action: 'addCounterToCard', actorId: actor, allowed: true, details: { cardId, zoneId: card.zoneId, counterType: counter.type, delta } });
                    emitLog('counter.add', { actorId: actor, cardId, zoneId: card.zoneId, counterType: counter.type, delta, newTotal: nextCount, cardName: card.name }, buildLogContext());
                },

                removeCounterFromCard: (cardId, counterType, actorId, _isRemote) => {
                    const state = get();
                    const card = state.cards[cardId];
                    if (!card) return;

                    const actor = actorId ?? state.myPlayerId;
                    const zone = state.zones[card.zoneId];
                    if (!isBattlefieldZone(zone)) return;

                    if (actor !== card.ownerId) {
                        logPermission({ action: 'removeCounterFromCard', actorId: actor, allowed: false, reason: 'Only the card owner may remove counters', details: { cardId, zoneId: card.zoneId, counterType } });
                        return;
                    }

                    const prevCount = card.counters.find(c => c.type === counterType)?.count ?? 0;
                    const newCounters = decrementCounter(card.counters, counterType);
                    const nextCount = newCounters.find(c => c.type === counterType)?.count ?? 0;
                    const delta = nextCount - prevCount;
                    if (delta === 0) return;

                    if (applyShared((maps) => yRemoveCounterFromCard(maps, cardId, counterType))) return;

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

                    logPermission({ action: 'removeCounterFromCard', actorId: actor, allowed: true, details: { cardId, zoneId: card.zoneId, counterType, delta } });
                    emitLog('counter.remove', { actorId: actor, cardId, zoneId: card.zoneId, counterType, delta, newTotal: nextCount, cardName: card.name }, buildLogContext());
                },

                setActiveModal: (modal) => {
                    set({ activeModal: modal });
                },

                setBattlefieldViewScale: (playerId, scale) => {
                    const clamped = Math.min(Math.max(scale, 0.5), 1.2);
                    set((state) => ({
                        battlefieldViewScale: {
                            ...state.battlefieldViewScale,
                            [playerId]: clamped
                        }
                    }));
                },
            });
        },
        {
            name: 'snapstack-storage',
            storage: createJSONStorage(createSafeStorage),
            onRehydrateStorage: () => (state) => {
                if (state && state.cards) {
                    const migratedCards: typeof state.cards = {};
                    Object.values(state.cards).forEach(card => {
                        let position = card.position;

                        // Legacy top-left -> center
                        if (state.positionFormat === 'top-left') {
                            position = {
                                x: position.x + CARD_WIDTH_PX / 2,
                                y: position.y + CARD_HEIGHT_PX / 2
                            };
                        }

                        // Convert any pixel-based coordinates to normalized.
                        if (state.positionFormat !== 'normalized' || position.x > 1 || position.y > 1) {
                            position = migratePositionToNormalized(position);
                        }

                        migratedCards[card.id] = {
                            ...card,
                            position,
                        };
                    });
                    state.cards = migratedCards;
                    state.positionFormat = 'normalized';
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
                if (!state) return;

                if (!state.battlefieldViewScale) {
                    state.battlefieldViewScale = {};
                }
                if (!state.playerIdsBySession) {
                    state.playerIdsBySession = {};
                }
                state.setHasHydrated(true);
            },
        }
    )
);
