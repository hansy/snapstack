import type { Card, Zone, ViewerRole } from "../types";

// Generic allow/deny result for permission checks.
export type PermissionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// Visibility guidance for UI rendering.
export type Visibility = "none" | "backs" | "faces";

export type ViewResult = PermissionResult & {
  visibility?: Visibility;
};

// Minimal actor context so we can thread current player ID through checks.
export interface ActorContext {
  actorId: string;
  role?: ViewerRole;
  // future: capabilities, roles, overrides, etc.
}

export interface MoveContext extends ActorContext {
  card: Card;
  fromZone: Zone;
  toZone: Zone;
}
