import type { Player } from "@/types";
import { MAX_PLAYER_LIFE, MIN_PLAYER_LIFE } from "@/lib/limits";

import { MAX_NAME_LENGTH } from "../sanitizeLimits";

import { sanitizeCounters } from "./counters";
import { clampNumber } from "./utils";

export const sanitizePlayer = (value: any): Player | null => {
  if (!value || typeof value.id !== "string") return null;
  const id = value.id;
  const name =
    typeof value.name === "string" && value.name.trim().length
      ? value.name.slice(0, MAX_NAME_LENGTH)
      : `Player ${id.slice(0, 4)}`;
  const commanderDamage: Record<string, number> = {};
  if (value.commanderDamage && typeof value.commanderDamage === "object") {
    Object.entries(value.commanderDamage).forEach(([pid, dmg]) => {
      if (typeof pid === "string") {
        commanderDamage[pid] = clampNumber(dmg, 0, 999, 0);
      }
    });
  }
  const libraryTopReveal =
    value.libraryTopReveal === "self" || value.libraryTopReveal === "all"
      ? value.libraryTopReveal
      : undefined;
  return {
    id,
    name,
    life: clampNumber(value.life, MIN_PLAYER_LIFE, MAX_PLAYER_LIFE, 40),
    color: typeof value.color === "string" ? value.color.slice(0, 16) : undefined,
    cursor:
      value.cursor &&
      typeof value.cursor.x === "number" &&
      typeof value.cursor.y === "number"
        ? { x: value.cursor.x, y: value.cursor.y }
        : undefined,
    counters: sanitizeCounters(value.counters),
    commanderDamage,
    commanderTax: clampNumber(value.commanderTax, 0, 99, 0),
    deckLoaded: Boolean(value.deckLoaded),
    libraryTopReveal,
  };
};

export const sanitizePlayerOrder = (
  value: any,
  players: Record<string, Player>,
  max: number
): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  const source = Array.isArray(value) ? value : [];
  for (const id of source) {
    if (typeof id !== "string") continue;
    if (!players[id]) continue;
    if (seen.has(id)) continue;
    result.push(id);
    seen.add(id);
    if (result.length >= max) return result;
  }
  const remaining = Object.keys(players).sort();
  for (const id of remaining) {
    if (seen.has(id)) continue;
    result.push(id);
    if (result.length >= max) break;
  }
  return result;
};
