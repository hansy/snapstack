import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { useGameStore } from '../store/gameStore';
import { Card, ScryfallRelatedCard, ZoneId } from '../types';
import { ContextMenuItem } from '../components/Game/context/menu';
import { actionRegistry } from '../components/Game/context/actionsRegistry';
import { canCreateToken } from '../rules/permissions';
import { ZONE } from '../constants/zones';
import { fetchScryfallCardByUri } from '../services/scryfallCard';
import { clampNormalizedPosition, findAvailablePositionNormalized, GRID_STEP_X, GRID_STEP_Y, migratePositionToNormalized } from '../lib/positions';
import { getDisplayName } from '../lib/cardDisplay';

// Centralizes context menu state/handlers for cards and zones so UI components can stay lean.
export const useGameContextMenu = (myPlayerId: string, onViewZone?: (zoneId: ZoneId, count?: number) => void) => {
    const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; items: ContextMenuItem[]; title?: string } | null>(null);
    const [countPrompt, setCountPrompt] = React.useState<{ title: string; message: string; onSubmit: (count: number) => void } | null>(null);
    const zones = useGameStore((state) => state.zones);
    const players = useGameStore((state) => state.players);
    const moveCard = useGameStore((state) => state.moveCard);
    const duplicateCard = useGameStore((state) => state.duplicateCard);

    const seatHasDeckLoaded = (playerId?: string) => {
        if (!playerId) return false;
        return Boolean(players[playerId]?.deckLoaded);
    };

    // Opens a context menu at the event point with provided actions.
    const handleContextMenu = (e: React.MouseEvent, items: ContextMenuItem[], title?: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, items, title });
    };

    const closeContextMenu = () => setContextMenu(null);

    const createRelatedCard = async (card: Card, related: ScryfallRelatedCard) => {
        const state = useGameStore.getState();
        const zone = state.zones[card.zoneId];
        if (!zone || zone.type !== ZONE.BATTLEFIELD) return;

        const permission = canCreateToken({ actorId: myPlayerId }, zone);
        if (!permission.allowed) {
            toast.error(permission.reason ?? 'Not allowed to create related card here');
            return;
        }

        try {
            const scryfallCard = await fetchScryfallCardByUri(related.uri);
            const frontFace = scryfallCard.card_faces?.[0];
            const imageUrl = scryfallCard.image_uris?.normal || frontFace?.image_uris?.normal;
            const isToken = related.component === 'token' || scryfallCard.layout === 'token' || /token/i.test(scryfallCard.type_line ?? '');
            const cardPosition = (card.position.x > 1 || card.position.y > 1)
                ? migratePositionToNormalized(card.position)
                : card.position;
            const basePosition = clampNormalizedPosition({
                x: cardPosition.x + GRID_STEP_X,
                y: cardPosition.y + GRID_STEP_Y,
            });
            const position = findAvailablePositionNormalized(basePosition, zone.cardIds, state.cards);
            state.addCard({
                id: uuidv4(),
                ownerId: zone.ownerId,
                controllerId: zone.ownerId,
                zoneId: zone.id,
                name: frontFace?.name || scryfallCard.name || related.name,
                imageUrl,
                typeLine: scryfallCard.type_line,
                oracleText: scryfallCard.oracle_text,
                scryfallId: scryfallCard.id,
                scryfall: scryfallCard,
                tapped: false,
                faceDown: false,
                currentFaceIndex: 0,
                rotation: 0,
                counters: [],
                position,
                isToken,
            });
            toast.success(`Created ${related.name}${isToken ? ' token' : ''}`);
        } catch (error) {
            console.error('Failed to fetch related card from Scryfall', error);
            toast.error('Failed to create related card');
        }
    };

    // Builds and opens card-specific actions (tap, counters, move shortcuts).
    const handleCardContextMenu = (e: React.MouseEvent, card: Card) => {
        const zone = zones[card.zoneId];
        if (!seatHasDeckLoaded(zone?.ownerId ?? card.ownerId)) return;

        const cardActions = actionRegistry.buildCardActions({
            card,
            zones,
            myPlayerId,
            moveCard: (cardId, toZoneId) => moveCard(cardId, toZoneId, undefined, myPlayerId),
            tapCard: (cardId) => useGameStore.getState().tapCard(cardId, myPlayerId),
            transformCard: (cardId, faceIndex) => useGameStore.getState().transformCard(cardId, faceIndex),
            duplicateCard: (cardId) => duplicateCard(cardId, myPlayerId),
            createRelatedCard,
            addCounter: (cardId, counter) => {
                useGameStore.getState().addCounterToCard(cardId, counter);
            },
            removeCounter: (cardId, counterType) => {
                useGameStore.getState().removeCounterFromCard(cardId, counterType);
            },
            openAddCounterModal: (cardId) => {
                useGameStore.getState().setActiveModal({ type: 'ADD_COUNTER', cardId });
            },
            globalCounters: useGameStore.getState().globalCounters,
            removeCard: (targetCard) => {
                useGameStore.getState().removeCard(targetCard.id, myPlayerId);
            },
        });

        handleContextMenu(e, cardActions, getDisplayName(card));
    };

    // Builds and opens zone-specific actions (draw/shuffle/view).
    const handleZoneContextMenu = (e: React.MouseEvent, zoneId: ZoneId) => {
        const zone = zones[zoneId];
        if (!zone || !seatHasDeckLoaded(zone.ownerId)) return;

        const items = actionRegistry.buildZoneViewActions({
            zone,
            myPlayerId,
            onViewZone,
            drawCard: (playerId) => useGameStore.getState().drawCard(playerId, myPlayerId),
            shuffleLibrary: (playerId) => useGameStore.getState().shuffleLibrary(playerId, myPlayerId),
            resetDeck: (playerId) => useGameStore.getState().resetDeck(playerId, myPlayerId),
            unloadDeck: (playerId) => useGameStore.getState().unloadDeck(playerId, myPlayerId),
            openCountPrompt: ({ title, message, onSubmit }) => setCountPrompt({ title, message, onSubmit }),
        });
        if (items.length > 0) {
            handleContextMenu(e, items);
        }
    };

    const handleBattlefieldContextMenu = (e: React.MouseEvent, onCreateToken: () => void) => {
        if (!seatHasDeckLoaded(myPlayerId)) return;

        handleContextMenu(e, [
            {
                type: 'action',
                label: 'Create Token',
                onSelect: onCreateToken,
            }
        ]);
    };

    return {
        contextMenu,
        handleCardContextMenu,
        handleZoneContextMenu,
        handleBattlefieldContextMenu,
        closeContextMenu,
        countPrompt,
        closeCountPrompt: () => setCountPrompt(null),
    };
};
