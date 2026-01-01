import React from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import { useGameStore } from "@/store/gameStore";
import { useSelectionStore } from "@/store/selectionStore";
import type { Card, ViewerRole, ZoneId } from "@/types";
import { actionRegistry } from "@/models/game/context-menu/actionsRegistry";
import { fetchScryfallCardByUri } from "@/services/scryfall/scryfallCard";
import { getCard as getCachedCard } from "@/services/scryfall/scryfallCache";
import { getDisplayName } from "@/lib/cardDisplay";
import { getPlayerZones } from "@/lib/gameSelectors";
import { ZONE } from "@/constants/zones";
import { getShortcutLabel } from "@/models/game/shortcuts/gameShortcuts";
import type { ContextMenuItem } from "@/models/game/context-menu/menu/types";

import { fetchBattlefieldRelatedParts } from "./relatedParts";
import { createCardActionAdapters, createZoneActionAdapters } from "./actionAdapters";
import { createRelatedCardHandler } from "./createRelatedCard";
import { useContextMenuState } from "./useContextMenuState";

// Centralizes context menu state/handlers for cards and zones so UI components can stay lean.
export const useGameContextMenu = (
    viewerRole: ViewerRole | undefined,
    myPlayerId: string,
    onViewZone?: (zoneId: ZoneId, count?: number) => void,
    onRollDice?: () => void
) => {
    const isSpectator = viewerRole === "spectator";
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
                viewerRole,
                getState: useGameStore.getState,
                toast: { success: toast.success, error: toast.error },
                fetchScryfallCardByUri,
                createId: uuidv4,
            }),
        [myPlayerId, viewerRole]
    );

    // Builds and opens card-specific actions (tap, counters, move shortcuts).
    const handleCardContextMenu = React.useCallback(async (e: React.MouseEvent, card: Card) => {
        if (isSpectator) return;
        const store = useGameStore.getState();
        const zone = store.zones[card.zoneId];
        if (!seatHasDeckLoaded(zone?.ownerId ?? card.ownerId)) return;

        const selectionEnabled =
            zone?.type === ZONE.BATTLEFIELD && zone.ownerId === myPlayerId;
        const selectionState = useSelectionStore.getState();
        if (selectionEnabled && !selectionState.selectedCardIds.includes(card.id)) {
            useSelectionStore.getState().selectOnly(card.id, card.zoneId);
        }

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
            viewerRole,
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
    }, [createRelatedCard, isSpectator, myPlayerId, openContextMenu, openTextPrompt, seatHasDeckLoaded]);

    // Builds and opens zone-specific actions (draw/shuffle/view).
    const handleZoneContextMenu = React.useCallback((e: React.MouseEvent, zoneId: ZoneId) => {
        if (isSpectator) return;
        const store = useGameStore.getState();
        const zone = store.zones[zoneId];
        if (!zone || !seatHasDeckLoaded(zone.ownerId)) return;

        const items = actionRegistry.buildZoneViewActions({
            zone,
            myPlayerId,
            viewerRole,
            onViewZone,
            openCountPrompt,
            ...createZoneActionAdapters({ store, myPlayerId }),
        });
        if (items.length > 0) {
            openContextMenu(e, items);
        }
    }, [isSpectator, myPlayerId, onViewZone, openContextMenu, openCountPrompt, seatHasDeckLoaded]);

    const handleBattlefieldContextMenu = React.useCallback(
        (e: React.MouseEvent, actions: { onCreateToken: () => void; onOpenDiceRoller?: () => void }) => {
            if (isSpectator) return;
            if (!seatHasDeckLoaded(myPlayerId)) return;
            const onDiceRoll = actions.onOpenDiceRoller ?? onRollDice;
            const playerZones = getPlayerZones(useGameStore.getState().zones, myPlayerId);

            const items: ContextMenuItem[] = [];
            if (onDiceRoll) {
              items.push({
                type: "action",
                label: "Roll Dice",
                onSelect: onDiceRoll,
                shortcut: getShortcutLabel("ui.openDiceRoller"),
              });
            }
            if (playerZones.sideboard && onViewZone) {
              items.push({
                type: "action",
                label: "View Sideboard",
                onSelect: () => onViewZone(playerZones.sideboard!.id),
              });
            }
            items.push({
              type: "action",
              label: "Create Token",
              onSelect: actions.onCreateToken,
                shortcut: getShortcutLabel("ui.openTokenModal"),
            });

            if (items.length > 0) {
                openContextMenu(e, items);
            }
        },
        [isSpectator, myPlayerId, onRollDice, openContextMenu, seatHasDeckLoaded]
    );

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
