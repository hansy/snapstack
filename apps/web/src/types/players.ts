import type { PlayerId } from "./ids";
import type { Counter } from "./counters";

export type LibraryTopRevealMode = "self" | "all";

export interface Player {
  id: PlayerId;
  name: string;
  life: number;
  color?: string; // Player identity color (shared across clients)
  cursor?: { x: number; y: number }; // For multiplayer presence
  counters: Counter[];
  commanderDamage: Record<PlayerId, number>;
  commanderTax: number;
  deckLoaded?: boolean;
  handCount?: number;
  libraryCount?: number;
  sideboardCount?: number;
  libraryTopReveal?: LibraryTopRevealMode | null;
}
