import type { Card } from "@/types";

import { getCurrentFace } from "./cardDisplay";

export type CardStatKey = "power" | "toughness";

export const getNextCardStatUpdate = (
  card: Card,
  type: CardStatKey,
  delta: number
): Pick<Card, CardStatKey> | null => {
  const faceStat = getCurrentFace(card)?.[type];
  const currentVal = parseInt(card[type] ?? faceStat ?? "0");
  if (Number.isNaN(currentVal)) return null;
  return { [type]: (currentVal + delta).toString() } as Pick<Card, CardStatKey>;
};
