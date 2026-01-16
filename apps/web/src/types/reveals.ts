import type { CardIdentity } from "./cards";
import type { CardId, PlayerId } from "./ids";

export type HandRevealsToAll = Record<string, CardIdentity>;

export type LibraryRevealEntry = {
  card: CardIdentity;
  orderKey: string;
  ownerId?: PlayerId;
};

export type LibraryRevealsToAll = Record<string, LibraryRevealEntry>;

export type FaceDownRevealsToAll = Record<CardId, CardIdentity>;
