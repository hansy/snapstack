import React from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import { useGameStore } from "@/store/gameStore";
import { useSelectionStore } from "@/store/selectionStore";
import type {
  Card,
  LibraryTopRevealMode,
  Player,
  ScryfallRelatedCard,
  ViewerRole,
  ZoneId,
} from "@/types";
import { actionRegistry } from "@/models/game/context-menu/actionsRegistry";
import { fetchScryfallCardByUri } from "@/services/scryfall/scryfallCard";
import { getCard as getCachedCard } from "@/services/scryfall/scryfallCache";
import { getDisplayName } from "@/lib/cardDisplay";
import { getPlayerZones } from "@/lib/gameSelectors";
import { MAX_PLAYER_LIFE } from "@/lib/limits";
import { ZONE } from "@/constants/zones";
import { getShortcutLabel } from "@/models/game/shortcuts/gameShortcuts";
import type { ContextMenuItem } from "@/models/game/context-menu/menu/types";
import { requestCardPreviewLock } from "@/lib/cardPreviewLock";

import { fetchBattlefieldRelatedParts } from "./relatedParts";
import { createCardActionAdapters, createZoneActionAdapters } from "./actionAdapters";
import { createRelatedCardHandler } from "./createRelatedCard";
import { useContextMenuState } from "./useContextMenuState";

// Centralizes context menu state/handlers for cards and zones so UI components can stay lean.
export const useGameContextMenu = (
    viewerRole: ViewerRole | undefined,
    myPlayerId: string,
    onViewZone?: (zoneId: ZoneId, count?: number) => void,
    onFlipCoin?: () => void,
    onRollDice?: () => void
) => {
    const isSpectator = viewerRole === "spectator";
    const {
        contextMenu,
        openContextMenu,
        closeContextMenu,
        updateContextMenu,
        countPrompt,
        openCountPrompt,
        closeCountPrompt,
        textPrompt,
        openTextPrompt,
        closeTextPrompt,
        topCardRevealPrompt,
        openTopCardRevealPrompt,
        closeTopCardRevealPrompt,
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

    const contextMenuRequestRef = React.useRef(0);

    const buildCardMenuItems = React.useCallback(
        (
            card: Card,
            relatedParts?: ScryfallRelatedCard[],
            previewAnchorEl?: HTMLElement | null
        ) => {
            const store = useGameStore.getState();
            return actionRegistry.buildCardActions({
                card,
                zones: store.zones,
                players: store.players,
                myPlayerId,
                viewerRole,
                globalCounters: store.globalCounters,
                relatedParts,
                previewAnchorEl,
                lockPreview: (targetCard, anchorEl) =>
                    requestCardPreviewLock({ cardId: targetCard.id, anchorEl }),
                ...createCardActionAdapters({
                    store,
                    myPlayerId,
                    createRelatedCard,
                    openTextPrompt,
                }),
            });
        },
        [createRelatedCard, myPlayerId, openTextPrompt, viewerRole]
    );

    // Builds and opens card-specific actions (tap, counters, move shortcuts).
    const handleCardContextMenu = React.useCallback((e: React.MouseEvent, card: Card) => {
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

        const previewAnchorEl = e.currentTarget as HTMLElement;
        const cardActions = buildCardMenuItems(card, undefined, previewAnchorEl);
        openContextMenu(e, cardActions, getDisplayName(card));

        const requestId = ++contextMenuRequestRef.current;

        // Fetch full Scryfall data to get related parts (tokens, meld results, etc.)
        // This is needed because we only sync lite data over Yjs
        void (async () => {
            const relatedParts = await fetchBattlefieldRelatedParts({
                card,
                zoneType: zone?.type,
                fetchCardById: getCachedCard,
            });
            if (!relatedParts || relatedParts.length === 0) return;
            if (contextMenuRequestRef.current !== requestId) return;

            const latest = useGameStore.getState().cards[card.id] ?? card;
            updateContextMenu((current) => {
                if (!current) return current;
                return {
                    ...current,
                    items: buildCardMenuItems(latest, relatedParts, previewAnchorEl),
                };
            });
        })();
    }, [buildCardMenuItems, isSpectator, myPlayerId, openContextMenu, seatHasDeckLoaded, updateContextMenu]);

    // Builds and opens zone-specific actions (draw/shuffle/view).
    const handleZoneContextMenu = React.useCallback((e: React.MouseEvent, zoneId: ZoneId) => {
        if (isSpectator) return;
        const store = useGameStore.getState();
        const zone = store.zones[zoneId];
        if (!zone || !seatHasDeckLoaded(zone.ownerId)) return;

        const libraryTopReveal = store.players[zone.ownerId]?.libraryTopReveal;
        const setLibraryTopReveal = (mode: LibraryTopRevealMode | null) => {
          store.updatePlayer(
            zone.ownerId,
            { libraryTopReveal: mode ?? null },
            myPlayerId
          );
        };

        const items = actionRegistry.buildZoneViewActions({
            zone,
            myPlayerId,
            viewerRole,
            onViewZone,
            openCountPrompt,
            openTopCardRevealPrompt,
            libraryTopReveal,
            setLibraryTopReveal,
            ...createZoneActionAdapters({ store, myPlayerId }),
        });
        if (items.length > 0) {
            contextMenuRequestRef.current += 1;
            openContextMenu(e, items);
        }
    }, [isSpectator, myPlayerId, onViewZone, openContextMenu, openCountPrompt, openTopCardRevealPrompt, seatHasDeckLoaded]);

    const handleBattlefieldContextMenu = React.useCallback(
        (e: React.MouseEvent, actions: { onCreateToken: () => void; onOpenCoinFlipper?: () => void; onOpenDiceRoller?: () => void }) => {
            if (isSpectator) return;
            if (!seatHasDeckLoaded(myPlayerId)) return;
            const onCoinFlip = actions.onOpenCoinFlipper ?? onFlipCoin;
            const onDiceRoll = actions.onOpenDiceRoller ?? onRollDice;
            const playerZones = getPlayerZones(useGameStore.getState().zones, myPlayerId);

            const items: ContextMenuItem[] = [];
            if (onCoinFlip) {
              items.push({
                type: "action",
                label: "Flip Coin",
                onSelect: onCoinFlip,
                shortcut: getShortcutLabel("ui.openCoinFlipper"),
              });
            }
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
                contextMenuRequestRef.current += 1;
                openContextMenu(e, items);
            }
        },
        [isSpectator, myPlayerId, onFlipCoin, onRollDice, openContextMenu, seatHasDeckLoaded]
    );

    const handleLifeContextMenu = React.useCallback(
        (e: React.MouseEvent, player: Player) => {
            if (isSpectator) return;
            if (player.id !== myPlayerId) return;

            contextMenuRequestRef.current += 1;
            openContextMenu(e, [
                {
                    type: "action",
                    label: "Set life total",
                    onSelect: () => {
                        openCountPrompt({
                            title: "Set life total",
                            message: "Enter the new life total.",
                            initialValue: Math.max(0, player.life),
                            minValue: 0,
                            confirmLabel: "Set life",
                            onSubmit: (value) => {
                                const nextLife = Number.isFinite(value)
                                    ? Math.max(0, Math.min(MAX_PLAYER_LIFE, Math.floor(value)))
                                    : player.life;
                                useGameStore
                                    .getState()
                                    .updatePlayer(player.id, { life: nextLife }, myPlayerId);
                            },
                        });
                    },
                },
            ]);
        },
        [isSpectator, myPlayerId, openContextMenu, openCountPrompt]
    );

    return {
        contextMenu,
        handleCardContextMenu,
        handleZoneContextMenu,
        handleBattlefieldContextMenu,
        handleLifeContextMenu,
        closeContextMenu,
        countPrompt,
        openCountPrompt,
        closeCountPrompt,
        textPrompt,
        openTextPrompt,
        closeTextPrompt,
        topCardRevealPrompt,
        openTopCardRevealPrompt,
        closeTopCardRevealPrompt,
    };
};
