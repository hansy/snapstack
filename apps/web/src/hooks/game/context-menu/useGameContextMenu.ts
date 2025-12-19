import React from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import { useGameStore } from "@/store/gameStore";
import type { Card, ZoneId } from "@/types";
import { actionRegistry } from "@/models/game/context-menu/actionsRegistry";
import { fetchScryfallCardByUri } from "@/services/scryfall/scryfallCard";
import { getCard as getCachedCard } from "@/services/scryfall/scryfallCache";
import { getDisplayName } from "@/lib/cardDisplay";
import { getShortcutLabel } from "@/models/game/shortcuts/gameShortcuts";

import { fetchBattlefieldRelatedParts } from "./relatedParts";
import { createCardActionAdapters, createZoneActionAdapters } from "./actionAdapters";
import { createRelatedCardHandler } from "./createRelatedCard";
import { useContextMenuState } from "./useContextMenuState";

// Centralizes context menu state/handlers for cards and zones so UI components can stay lean.
export const useGameContextMenu = (myPlayerId: string, onViewZone?: (zoneId: ZoneId, count?: number) => void) => {
    const {
        contextMenu,
        openContextMenu,
        closeContextMenu,
        countPrompt,
        openCountPrompt,
        closeCountPrompt,
        textPrompt,
        openTextPrompt,
        closeTextPrompt,
    } = useContextMenuState();

    const seatHasDeckLoaded = React.useCallback((playerId?: string) => {
        if (!playerId) return false;
        return Boolean(useGameStore.getState().players[playerId]?.deckLoaded);
    }, []);

    const createRelatedCard = React.useMemo(
        () =>
            createRelatedCardHandler({
                actorId: myPlayerId,
                getState: useGameStore.getState,
                toast: { success: toast.success, error: toast.error },
                fetchScryfallCardByUri,
                createId: uuidv4,
            }),
        [myPlayerId]
    );

    // Builds and opens card-specific actions (tap, counters, move shortcuts).
    const handleCardContextMenu = React.useCallback(async (e: React.MouseEvent, card: Card) => {
        const store = useGameStore.getState();
        const zone = store.zones[card.zoneId];
        if (!seatHasDeckLoaded(zone?.ownerId ?? card.ownerId)) return;

        // Fetch full Scryfall data to get related parts (tokens, meld results, etc.)
        // This is needed because we only sync lite data over Yjs
        const relatedParts = await fetchBattlefieldRelatedParts({
            card,
            zoneType: zone?.type,
            fetchCardById: getCachedCard,
        });

        const cardActions = actionRegistry.buildCardActions({
            card,
            zones: store.zones,
            players: store.players,
            myPlayerId,
            globalCounters: store.globalCounters,
            relatedParts,
            ...createCardActionAdapters({
                store,
                myPlayerId,
                createRelatedCard,
                openTextPrompt,
            }),
        });

        openContextMenu(e, cardActions, getDisplayName(card));
    }, [createRelatedCard, myPlayerId, openContextMenu, openTextPrompt, seatHasDeckLoaded]);

    // Builds and opens zone-specific actions (draw/shuffle/view).
    const handleZoneContextMenu = React.useCallback((e: React.MouseEvent, zoneId: ZoneId) => {
        const store = useGameStore.getState();
        const zone = store.zones[zoneId];
        if (!zone || !seatHasDeckLoaded(zone.ownerId)) return;

        const items = actionRegistry.buildZoneViewActions({
            zone,
            myPlayerId,
            onViewZone,
            openCountPrompt,
            ...createZoneActionAdapters({ store, myPlayerId }),
        });
        if (items.length > 0) {
            openContextMenu(e, items);
        }
    }, [myPlayerId, onViewZone, openContextMenu, openCountPrompt, seatHasDeckLoaded]);

    const handleBattlefieldContextMenu = React.useCallback((e: React.MouseEvent, onCreateToken: () => void) => {
        if (!seatHasDeckLoaded(myPlayerId)) return;

        openContextMenu(e, [
            {
                type: 'action',
                label: 'Create Token',
                onSelect: onCreateToken,
                shortcut: getShortcutLabel('ui.openTokenModal'),
            }
        ]);
    }, [myPlayerId, openContextMenu, seatHasDeckLoaded]);

    return {
        contextMenu,
        handleCardContextMenu,
        handleZoneContextMenu,
        handleBattlefieldContextMenu,
        closeContextMenu,
        countPrompt,
        openCountPrompt,
        closeCountPrompt,
        textPrompt,
        openTextPrompt,
        closeTextPrompt,
    };
};
