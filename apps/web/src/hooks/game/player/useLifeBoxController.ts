import * as React from "react";

import type { Player } from "@/types";

import { useGameStore } from "@/store/gameStore";

import { computeCommanderDamagePatch } from "@/models/game/player/lifeBoxModel";

export type CommanderDamageEntry = {
  opponentId: string;
  color: string;
  damage: number;
};

export type LifeBoxControllerInput = {
  player: Player;
  isMe?: boolean;
  className?: string;
  opponentColors: Record<string, string>;
  isRight?: boolean;
  onEditUsername?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

export const useLifeBoxController = ({
  player,
  isMe,
  className,
  opponentColors,
  isRight,
  onEditUsername,
  onContextMenu,
}: LifeBoxControllerInput) => {
  const updatePlayer = useGameStore((state) => state.updatePlayer);

  const canEditLife = isMe === true;
  const canEditCommanderDamage = isMe === true;

  const showCommanderDamageDrawer = Object.keys(opponentColors).length > 1;

  const commanderDamageEntries = React.useMemo<CommanderDamageEntry[]>(() => {
    return Object.entries(opponentColors)
      .filter(([opponentId]) => opponentId !== player.id)
      .map(([opponentId, color]) => ({
        opponentId,
        color,
        damage: player.commanderDamage[opponentId] || 0,
      }));
  }, [opponentColors, player.commanderDamage, player.id]);

  const handleLifeChange = React.useCallback(
    (amount: number) => {
      updatePlayer(player.id, { life: player.life + amount });
    },
    [updatePlayer, player.id, player.life]
  );

  const handleCommanderDamageChange = React.useCallback(
    (sourceId: string, amount: number) => {
      const patch = computeCommanderDamagePatch(player, sourceId, amount);
      if (!patch) return;
      updatePlayer(player.id, patch);
    },
    [player, updatePlayer]
  );

  return {
    player,
    isMe,
    className,
    isRight,
    onEditUsername,
    onContextMenu,
    canEditLife,
    canEditCommanderDamage,
    showCommanderDamageDrawer,
    commanderDamageEntries,
    handleLifeChange,
    handleCommanderDamageChange,
  };
};

export type LifeBoxController = ReturnType<typeof useLifeBoxController>;

