import type { Player, Zone } from "@/types";
import { ZONE } from "@/constants/zones";
import { computePlayerColors, resolveOrderedPlayerIds } from "@/lib/playerColors";

export type LocalPlayerInitPlan = {
  upsertPlayer?: Player;
  patchLocalPlayer?: Partial<Player>;
  patchColors: Array<{ playerId: string; color: string }>;
  zonesToCreate: Zone[];
};

const hasZoneOfType = (zones: Record<string, { ownerId: string; type: string }>, ownerId: string, type: string): boolean => {
  return Object.values(zones).some((zone) => zone.ownerId === ownerId && zone.type === type);
};

export const computeLocalPlayerInitPlan = ({
  players,
  playerOrder,
  zones,
  playerId,
  desiredName,
  defaultName,
}: {
  players: Record<string, Player>;
  playerOrder: string[];
  zones: Record<string, Zone>;
  playerId: string;
  desiredName: string;
  defaultName: string;
}): LocalPlayerInitPlan | null => {
  const playerExists = Boolean(players[playerId]);

  const hasCommanderZone =
    hasZoneOfType(zones, playerId, ZONE.COMMANDER) || hasZoneOfType(zones, playerId, "command");

  const zoneTypes = [ZONE.LIBRARY, ZONE.HAND, ZONE.BATTLEFIELD, ZONE.GRAVEYARD, ZONE.EXILE, ZONE.COMMANDER] as const;

  const zonesToCreate: Zone[] = [];
  for (const type of zoneTypes) {
    if (type === ZONE.COMMANDER) {
      if (hasCommanderZone) continue;
    } else if (hasZoneOfType(zones, playerId, type)) {
      continue;
    }
    zonesToCreate.push({ id: `${playerId}-${type}`, type, ownerId: playerId, cardIds: [] });
  }

  const orderedIds = resolveOrderedPlayerIds(players, playerOrder ?? []);
  const orderedIdsWithLocal = orderedIds.includes(playerId) ? orderedIds : [...orderedIds, playerId];
  const desiredColors = computePlayerColors(orderedIdsWithLocal);

  const currentColor = players[playerId]?.color;
  const desiredColor = desiredColors[playerId];
  const shouldPatchLocalColor = Boolean(
    playerExists && desiredColor && currentColor !== desiredColor
  );

  const patchColors: Array<{ playerId: string; color: string }> = [];
  Object.entries(desiredColors).forEach(([id, color]) => {
    if (id === playerId && shouldPatchLocalColor) return;
    if (!players[id]?.color) {
      patchColors.push({ playerId: id, color });
    }
  });

  const currentName = players[playerId]?.name;
  const needsNameUpdate = Boolean(
    desiredName && desiredName !== currentName && (!currentName || currentName === defaultName)
  );

  let patchLocalPlayer: Partial<Player> | undefined = needsNameUpdate
    ? { name: desiredName }
    : undefined;
  if (shouldPatchLocalColor) {
    patchLocalPlayer = { ...patchLocalPlayer, color: desiredColor };
  }

  if (playerExists && zonesToCreate.length === 0 && patchColors.length === 0 && !patchLocalPlayer) {
    return null;
  }

  const upsertPlayer: Player | undefined = playerExists
    ? undefined
    : {
        id: playerId,
        name: desiredName,
        life: 40,
        counters: [],
        commanderDamage: {},
        commanderTax: 0,
        deckLoaded: false,
        color: desiredColors[playerId],
      };

  return { upsertPlayer, patchLocalPlayer, patchColors, zonesToCreate };
};
