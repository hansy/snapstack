import type { Player } from "@/types";

export const computeCommanderDamagePatch = (
  player: Pick<Player, "life" | "commanderDamage">,
  sourceId: string,
  delta: number
): Pick<Player, "life" | "commanderDamage"> | null => {
  const currentDamage = player.commanderDamage[sourceId] || 0;
  const nextDamage = Math.max(0, currentDamage + delta);

  if (nextDamage === currentDamage) return null;

  const lifeDelta = -(nextDamage - currentDamage);
  return {
    life: player.life + lifeDelta,
    commanderDamage: {
      ...player.commanderDamage,
      [sourceId]: nextDamage,
    },
  };
};

