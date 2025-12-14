import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Card, GameState, Zone } from '../types';
import { getZoneByType } from '../lib/gameSelectors';
import { ZONE } from '../constants/zones';
import { canModifyCardState, canMoveCard, canTapCard, canUpdatePlayer, canViewZone } from '../rules/permissions';
import { logPermission } from '../rules/logger';
import { getCardFaces, getCurrentFaceIndex, isTransformableCard, syncCardStatsToFace } from '../lib/cardDisplay';
import { decrementCounter, enforceZoneCounterRules, isBattlefieldZone, mergeCounters, resolveCounterColor } from '../lib/counters';
import { emitLog, clearLogs } from '../logging/logStore';
import { destroySession, getSessionHandles, runWithSharedDoc } from '../yjs/docManager';
import { isApplyingRemoteUpdate } from '../yjs/sync';
import { addCounterToCard as yAddCounterToCard, duplicateCard as yDuplicateCard, moveCard as yMoveCard, patchCard as yPatchCard, patchPlayer as yPatchPlayer, removeCard as yRemoveCard, removeCounterFromCard as yRemoveCounterFromCard, removePlayer as yRemovePlayer, reorderZoneCards as yReorderZoneCards, resetDeck as yResetDeck, setBattlefieldViewScale as ySetBattlefieldViewScale, sharedSnapshot, transformCard as yTransformCard, unloadDeck as yUnloadDeck, upsertCard as yUpsertCard, upsertPlayer as yUpsertPlayer, upsertZone as yUpsertZone, SharedMaps } from '../yjs/yMutations';
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

const resolveControllerAfterMove = (card: Card, fromZone: Zone, toZone: Zone): string => {
    if (toZone.type === ZONE.BATTLEFIELD) {
        // Returning to owner's battlefield always reassigns control to owner.
        if (toZone.ownerId === card.ownerId) return card.ownerId;
        // Moving between different battlefields hands control to the destination battlefield owner.
        if (fromZone.ownerId !== toZone.ownerId) return toZone.ownerId;
    } else {
        // Leaving the battlefield to an owner-only zone resets control to the owner.
        if (card.controllerId !== card.ownerId) return card.ownerId;
    }
    return card.controllerId;
};

export const useGameStore = create<GameStore>()(
    persist(
        (set, get) => {
            // Apply mutation to Yjs, but skip if we're processing a remote update
            // (prevents feedback loop: Yjs -> Zustand -> Yjs)
            const applyShared = (fn: (maps: SharedMaps) => void) => {
                if (isApplyingRemoteUpdate()) {
                    // Skip Yjs mutation - this change came FROM Yjs
                    return false;
                }
                return runWithSharedDoc(fn);
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
                playerOrder: [],
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
                        playerOrder: [],
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

                leaveGame: () => {
                    const sessionId = get().sessionId;
                    const playerId = get().myPlayerId;

                    if (sessionId) {
                        const handles = getSessionHandles(sessionId);
                        if (handles) {
                            handles.doc.transact(() => {
                                yRemovePlayer(
                                    {
                                        players: handles.players,
                                        playerOrder: handles.playerOrder,
                                        zones: handles.zones,
                                        cards: handles.cards,
                                        zoneCardOrders: handles.zoneCardOrders,
                                        globalCounters: handles.globalCounters,
                                        battlefieldViewScale: handles.battlefieldViewScale,
                                    } as any,
                                    playerId,
                                );
                            });
                        }

                        try {
                            destroySession(sessionId);
                        } catch (_err) {}

                        get().forgetSessionIdentity(sessionId);
                    }

                    get().resetSession();
                },

                setHasHydrated: (state) => {
                    set({ hasHydrated: state });
                },

                addPlayer: (player, _isRemote) => {
                    const normalized = { ...player, deckLoaded: false, commanderTax: 0 };
                    if (applyShared((maps) => yUpsertPlayer(maps, normalized))) return;
                    set((state) => ({
                        players: { ...state.players, [normalized.id]: normalized },
                        playerOrder: state.playerOrder.includes(normalized.id)
                            ? state.playerOrder
                            : [...state.playerOrder, normalized.id],
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
                        yPatchPlayer(maps, id, updates as any);
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
                        yPatchPlayer(maps, playerId, { commanderTax: to } as any);
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
                        yPatchPlayer(maps, playerId, { deckLoaded: loaded } as any);
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
                    // Initialize P/T from card_faces if not already set
                    // Note: scryfall is a lite version (no power/toughness at root level)
                    const initializedCard = { ...card, currentFaceIndex: card.currentFaceIndex ?? 0 };
                    if (!card.power && !card.toughness) {
                        const frontFace = card.scryfall?.card_faces?.[0];
                        if (frontFace?.power || frontFace?.toughness) {
                            initializedCard.power = frontFace.power;
                            initializedCard.toughness = frontFace.toughness;
                            initializedCard.basePower = frontFace.power;
                            initializedCard.baseToughness = frontFace.toughness;
                        }
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

                    const tokenPermission = canModifyCardState({ actorId: actor }, sourceCard, currentZone);
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

                    // `updateCard` is intentionally limited to battlefield-only card state edits.
                    // Movement and ordering must go through `moveCard` so zone orders stay consistent.
                    if (
                        Object.prototype.hasOwnProperty.call(updates, 'zoneId') ||
                        Object.prototype.hasOwnProperty.call(updates, 'position') ||
                        Object.prototype.hasOwnProperty.call(updates, 'counters')
                    ) {
                        console.warn('[updateCard] Unsupported fields (use moveCard / addCounterToCard instead)', {
                            cardId: id,
                            fields: Object.keys(updates),
                        });
                        return;
                    }

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

                    if (cardBefore) {
                        const cardZone = get().zones[cardBefore.zoneId];
                        const controlledFields = ['power', 'toughness', 'basePower', 'baseToughness', 'customText', 'faceDown', 'currentFaceIndex'];
                        const requiresControl = Object.keys(updates).some(key => controlledFields.includes(key));
                        if (requiresControl) {
                            const permission = canModifyCardState({ actorId: actor }, cardBefore, cardZone);
                            if (!permission.allowed) {
                                logPermission({ action: 'updateCard', actorId: actor, allowed: false, reason: permission.reason, details: { cardId: id, zoneId: cardBefore.zoneId, updates: Object.keys(updates) } });
                                return;
                            }
                        }
                    }

                    if (applyShared((maps) => {
                        if (!cardBefore) return;
                        const nextZoneId = updates.zoneId ?? cardBefore.zoneId;
                        const mergedCard = { ...cardBefore, ...updates, zoneId: nextZoneId };
                        const faces = getCardFaces(mergedCard);
                        const normalizedFaceIndex = faces.length
                            ? Math.min(Math.max(mergedCard.currentFaceIndex ?? 0, 0), faces.length - 1)
                            : mergedCard.currentFaceIndex;

                        const faceChanged = (normalizedFaceIndex ?? mergedCard.currentFaceIndex) !== cardBefore.currentFaceIndex;
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

                        const patch: any = {};
                        ([
                            'power',
                            'toughness',
                            'basePower',
                            'baseToughness',
                            'customText',
                            'faceDown',
                            'currentFaceIndex',
                            'rotation',
                        ] as const).forEach((key) => {
                            if ((cardWithFace as any)[key] !== (cardBefore as any)[key]) {
                                patch[key] = (cardWithFace as any)[key];
                            }
                        });
                        if (Object.keys(patch).length) {
                            yPatchCard(maps, id, patch);
                        }
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

                    const actor = snapshot.myPlayerId;
                    const permission = canModifyCardState({ actorId: actor }, card, zone);
                    if (!permission.allowed) {
                        logPermission({ action: 'transformCard', actorId: actor, allowed: false, reason: permission.reason, details: { cardId, zoneId: zone.id } });
                        return;
                    }

                    const faces = getCardFaces(card);
                    const targetIndex = faces.length
                        ? typeof faceIndex === "number"
                            ? Math.min(Math.max(faceIndex, 0), faces.length - 1)
                            : (getCurrentFaceIndex(card) + 1) % faces.length
                        : 0;

                    const targetFaceName = faces[targetIndex]?.name;

                    emitLog('card.transform', { actorId: actor, cardId, zoneId: card.zoneId, toFaceName: targetFaceName, cardName: card.name }, buildLogContext());

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

                    const nextControllerId = resolveControllerAfterMove(card, fromZone, toZone);
                    const controlWillChange = nextControllerId !== card.controllerId;
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
                    const controlShift = controlWillChange && toZone.type === ZONE.BATTLEFIELD;

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
                        if (controlShift) movePayload.gainsControlBy = nextControllerId;
                        emitLog('card.move', movePayload, buildLogContext());
                    }

                    // Apply to Yjs (if connected) but always continue to update local state
                    // This "dual-write" ensures immediate visual feedback while Yjs syncs in background
                    applyShared((maps) => {
                        const tokenLeavingBattlefield = card.isToken && toZone.type !== ZONE.BATTLEFIELD;
                        if (tokenLeavingBattlefield) {
                            yRemoveCard(maps, cardId);
                            return;
                        }

                        yMoveCard(maps, cardId, toZoneId, position);

                        if (controlWillChange) {
                            yPatchCard(maps, cardId, { controllerId: nextControllerId });
                        }

                        // Determine new faceDown state
                        let newFaceDown = opts?.faceDown;
                        if (newFaceDown === undefined) {
                            // If not specified, default to false unless moving between battlefields
                            const isBattlefieldToBattlefield = fromZone.type === ZONE.BATTLEFIELD && toZone.type === ZONE.BATTLEFIELD;
                            if (!isBattlefieldToBattlefield) {
                                newFaceDown = false;
                            }
                        }

                        if (newFaceDown !== undefined) {
                            yPatchCard(maps, cardId, { faceDown: newFaceDown });
                        }
                    });

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
                                controllerId: controlWillChange ? nextControllerId : nextCard.controllerId,
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
                            controllerId: controlWillChange ? nextControllerId : nextCard.controllerId,
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

                    const nextControllerId = resolveControllerAfterMove(card, fromZone, toZone);
                    const controlWillChange = nextControllerId !== card.controllerId;
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
                    const controlShift = controlWillChange && toZone.type === ZONE.BATTLEFIELD;

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
                        if (controlShift) movePayload.gainsControlBy = nextControllerId;
                        emitLog('card.move', movePayload, buildLogContext());
                    }

                    if (applyShared((maps) => {
                        const tokenLeavingBattlefield = card.isToken && toZone.type !== ZONE.BATTLEFIELD;
                        if (tokenLeavingBattlefield) {
                            yRemoveCard(maps, cardId);
                            return;
                        }

                        yMoveCard(maps, cardId, toZoneId);

                        if (controlWillChange) {
                            yPatchCard(maps, cardId, { controllerId: nextControllerId });
                        }

                        // place at bottom (front) of toZone
                        const snapshot = sharedSnapshot(maps);
                        const toOrder = snapshot.zones[toZoneId]?.cardIds ?? [];
                        const reordered = [cardId, ...toOrder.filter((id) => id !== cardId)];
                        yReorderZoneCards(maps, toZoneId, reordered);
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
                            controllerId: controlWillChange ? nextControllerId : nextCard.controllerId,
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
                    const actorIsController = actor === card.controllerId;
                    if (!actorIsOwner && !actorIsZoneHost && !actorIsController) {
                        logPermission({ action: 'removeCard', actorId: actor, allowed: false, reason: 'Only owner, controller, or zone host may remove this token', details: { cardId } });
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

                    if (applyShared((maps) => yPatchCard(maps, cardId, { tapped: newTapped }))) return;

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
                        const snapshot = sharedSnapshot(maps);
                        Object.values(snapshot.cards).forEach((card) => {
                            if (card.controllerId === playerId && card.tapped) {
                                yPatchCard(maps, card.id, { tapped: false });
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
                        const snapshot = sharedSnapshot(maps);
                        const zone = snapshot.zones[libraryZone.id];
                        if (!zone) return;
                        const shuffledIds = [...zone.cardIds].sort(() => Math.random() - 0.5);
                        yReorderZoneCards(maps, libraryZone.id, shuffledIds);
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

                    const sharedApplied = applyShared((maps) => {
                        yResetDeck(maps, playerId);
                    });

                    if (!sharedApplied) {
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
                                if (fromZone && fromZone.ownerId === playerId) {
                                    const fromType = (fromZone as any).type as string;
                                    if (fromType === ZONE.COMMANDER || fromType === 'command') {
                                        return;
                                    }
                                }
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
                    }

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

                    const sharedApplied = applyShared((maps) => {
                        yUnloadDeck(maps, playerId);
                    });

                    if (!sharedApplied) {
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
                    }

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

                    const permission = canModifyCardState({ actorId: actor }, card, zone);
                    if (!permission.allowed) {
                        logPermission({ action: 'addCounterToCard', actorId: actor, allowed: false, reason: permission.reason, details: { cardId, zoneId: card.zoneId, counterType: counter.type } });
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

                    const permission = canModifyCardState({ actorId: actor }, card, zone);
                    if (!permission.allowed) {
                        logPermission({ action: 'removeCounterFromCard', actorId: actor, allowed: false, reason: permission.reason, details: { cardId, zoneId: card.zoneId, counterType } });
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
                    const clamped = Math.min(Math.max(scale, 0.5), 1);
                    const current = get().battlefieldViewScale[playerId];
                    if (current === clamped) return;

                    if (applyShared((maps) => ySetBattlefieldViewScale(maps, playerId, clamped))) return;

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
            version: 2,
            migrate: (persistedState: any, _version) => {
                // v2: only persist identity/session bookkeeping; game state comes from Yjs.
                return {
                    playerIdsBySession: persistedState?.playerIdsBySession ?? {},
                    sessionVersions: persistedState?.sessionVersions ?? {},
                } as any;
            },
            partialize: (state) => ({
                playerIdsBySession: state.playerIdsBySession,
                sessionVersions: state.sessionVersions,
            }),
            storage: createJSONStorage(createSafeStorage),
            onRehydrateStorage: () => (state) => {
                if (!state) return;

                if (!state.playerIdsBySession) {
                    state.playerIdsBySession = {};
                }
                if (!state.sessionVersions) {
                    state.sessionVersions = {};
                }
                state.setHasHydrated(true);
            },
        }
    )
);
