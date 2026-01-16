// Lightweight permission logger. In the future this can be wired to a UI console or persisted history.
export interface PermissionLogEntry {
  action: string;
  actorId: string;
  allowed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export const logPermission = (_entry: PermissionLogEntry) => {
  return;
};
