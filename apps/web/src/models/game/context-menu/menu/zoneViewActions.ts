import type { PlayerId, ViewerRole, Zone, ZoneId } from "@/types";

import { ZONE } from "@/constants/zones";
import { canViewZone } from "@/rules/permissions";
import { getShortcutLabel } from "@/models/game/shortcuts/gameShortcuts";

import type { ContextMenuItem } from "./types";

interface ZoneActionBuilderParams {
  zone: Zone;
  myPlayerId: PlayerId;
  viewerRole?: ViewerRole;
  onViewZone?: (zoneId: ZoneId, count?: number) => void;
  drawCard: (playerId: PlayerId) => void;
  discardFromLibrary: (playerId: PlayerId, count?: number) => void;
  shuffleLibrary: (playerId: PlayerId) => void;
  resetDeck: (playerId: PlayerId) => void;
  mulligan: (playerId: PlayerId, count: number) => void;
  unloadDeck: (playerId: PlayerId) => void;
  openCountPrompt?: (opts: {
    title: string;
    message: string;
    onSubmit: (count: number) => void;
    initialValue?: number;
    minValue?: number;
    confirmLabel?: string;
  }) => void;
}

const buildLibraryDrawMenu = ({
  myPlayerId,
  drawCard,
  openCountPrompt,
}: {
  myPlayerId: PlayerId;
  drawCard: (playerId: PlayerId) => void;
  openCountPrompt?: ZoneActionBuilderParams["openCountPrompt"];
}): ContextMenuItem => {
  const submenu: ContextMenuItem[] = [
    {
      type: "action",
      label: "Draw 1",
      onSelect: () => drawCard(myPlayerId),
      shortcut: getShortcutLabel("game.drawOne"),
    },
    {
      type: "action",
      label: "Draw X...",
      onSelect: () => {
        if (!openCountPrompt) return;
        openCountPrompt({
          title: "Draw",
          message: "How many cards to draw?",
          onSubmit: (count) => {
            for (let i = 0; i < count; i++) {
              drawCard(myPlayerId);
            }
          },
        });
      },
      disabledReason: openCountPrompt ? undefined : "Prompt unavailable",
      shortcut: getShortcutLabel("game.drawX"),
    },
  ];

  return {
    type: "action",
    label: "Draw ...",
    onSelect: () => {},
    submenu,
  };
};

const buildLibraryDiscardMenu = ({
  myPlayerId,
  discardFromLibrary,
  openCountPrompt,
}: {
  myPlayerId: PlayerId;
  discardFromLibrary: (playerId: PlayerId, count?: number) => void;
  openCountPrompt?: ZoneActionBuilderParams["openCountPrompt"];
}): ContextMenuItem => {
  const submenu: ContextMenuItem[] = [
    {
      type: "action",
      label: "Discard 1",
      onSelect: () => discardFromLibrary(myPlayerId, 1),
      shortcut: getShortcutLabel("game.discardOne"),
    },
    {
      type: "action",
      label: "Discard X...",
      onSelect: () => {
        if (!openCountPrompt) return;
        openCountPrompt({
          title: "Discard",
          message: "How many cards to discard?",
          onSubmit: (count) => discardFromLibrary(myPlayerId, count),
          minValue: 1,
        });
      },
      disabledReason: openCountPrompt ? undefined : "Prompt unavailable",
      shortcut: getShortcutLabel("game.discardX"),
    },
  ];

  return {
    type: "action",
    label: "Discard ...",
    onSelect: () => {},
    submenu,
  };
};

const buildLibraryViewMenu = ({
  zoneId,
  onViewZone,
  openCountPrompt,
}: {
  zoneId: ZoneId;
  onViewZone: (zoneId: ZoneId, count?: number) => void;
  openCountPrompt?: ZoneActionBuilderParams["openCountPrompt"];
}): ContextMenuItem => {
  const submenu: ContextMenuItem[] = [
    {
      type: "action",
      label: "View all",
      onSelect: () => onViewZone(zoneId),
      shortcut: getShortcutLabel("zone.viewLibraryAll"),
    },
    {
      type: "action",
      label: "View top X...",
      onSelect: () => {
        if (!openCountPrompt) return;
        openCountPrompt({
          title: "View Top",
          message: "How many cards from top?",
          onSubmit: (count) => onViewZone(zoneId, count),
        });
      },
      disabledReason: openCountPrompt ? undefined : "Prompt unavailable",
      shortcut: getShortcutLabel("zone.viewLibraryTop"),
    },
  ];

  return {
    type: "action",
    label: "View ...",
    onSelect: () => {},
    submenu,
  };
};

export const buildZoneViewActions = ({
  zone,
  myPlayerId,
  viewerRole,
  onViewZone,
  drawCard,
  discardFromLibrary,
  shuffleLibrary,
  resetDeck,
  mulligan,
  unloadDeck,
  openCountPrompt,
}: ZoneActionBuilderParams): ContextMenuItem[] => {
  const items: ContextMenuItem[] = [];

  if (zone.type === ZONE.LIBRARY) {
    const viewAllPermission = canViewZone(
      { actorId: myPlayerId, role: viewerRole },
      zone,
      { viewAll: true }
    );
    if (!viewAllPermission.allowed) return items;
    if (zone.ownerId !== myPlayerId) return items;

    items.push(buildLibraryDrawMenu({ myPlayerId, drawCard, openCountPrompt }));
    items.push(
      buildLibraryDiscardMenu({ myPlayerId, discardFromLibrary, openCountPrompt })
    );

    if (onViewZone) {
      items.push(buildLibraryViewMenu({ zoneId: zone.id, onViewZone, openCountPrompt }));
    }

    items.push({
      type: "action",
      label: "Shuffle",
      onSelect: () => shuffleLibrary(myPlayerId),
      shortcut: getShortcutLabel("game.shuffleLibrary"),
    });
    items.push({
      type: "action",
      label: "Mulligan",
      onSelect: () => {
        if (!openCountPrompt) return;
        openCountPrompt({
          title: "Mulligan",
          message: "Reset deck and draw new cards. How many cards to draw?",
          initialValue: 7,
          onSubmit: (count) => {
            mulligan(myPlayerId, count);
          },
        });
      },
      disabledReason: openCountPrompt ? undefined : "Prompt unavailable",
      shortcut: getShortcutLabel("game.mulligan"),
    });
    items.push({ type: "separator" });
    items.push({
      type: "action",
      label: "Reset",
      onSelect: () => resetDeck(myPlayerId),
      shortcut: getShortcutLabel("deck.reset"),
    });
    items.push({
      type: "action",
      label: "Unload",
      onSelect: () => unloadDeck(myPlayerId),
      danger: true,
      shortcut: getShortcutLabel("deck.unload"),
    });
  } else if (zone.type === ZONE.GRAVEYARD || zone.type === ZONE.EXILE) {
    const viewPermission = canViewZone({ actorId: myPlayerId, role: viewerRole }, zone);
    if (viewPermission.allowed && onViewZone)
      items.push({
        type: "action",
        label: "View All",
        onSelect: () => onViewZone(zone.id),
        shortcut:
          zone.ownerId === myPlayerId
            ? zone.type === ZONE.GRAVEYARD
              ? getShortcutLabel("zone.viewGraveyard")
              : zone.type === ZONE.EXILE
                ? getShortcutLabel("zone.viewExile")
                : undefined
            : undefined,
      });
  }

  return items;
};
