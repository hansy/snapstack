// Lightweight permission logger. In the future this can be wired to a UI console or persisted history.
export interface PermissionLogEntry {
  action: string;
  actorId: string;
  allowed: boolean;
  reason?: string;
  details?: Record<string, any>;
}

export const logPermission = ({ action, actorId, allowed, reason, details }: PermissionLogEntry) => {
  const payload = { action, actorId, allowed, reason, ...details };
  if (allowed) {
    console.info('[perm allow]', payload);
  } else {
    console.warn('[perm deny]', payload);
  }
};
