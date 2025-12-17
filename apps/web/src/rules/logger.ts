// Lightweight permission logger. In the future this can be wired to a UI console or persisted history.
export interface PermissionLogEntry {
  action: string;
  actorId: string;
  allowed: boolean;
  reason?: string;
  details?: Record<string, any>;
}

const nodeProcessEnv = (globalThis as any).process?.env as Record<string, unknown> | undefined;

const isTestEnv =
  (import.meta as any).env?.MODE === 'test' || Boolean(nodeProcessEnv?.VITEST);

const nodeEnv =
  typeof nodeProcessEnv?.NODE_ENV === 'string' ? nodeProcessEnv.NODE_ENV : undefined;

const isDevEnv =
  (import.meta as any).env?.DEV === true ||
  (nodeEnv != null && nodeEnv !== 'production');

const ENABLE_PERMISSION_LOGS = isDevEnv && !isTestEnv;

export const logPermission = ({ action, actorId, allowed, reason, details }: PermissionLogEntry) => {
  if (!ENABLE_PERMISSION_LOGS) return;
  const payload = { action, actorId, allowed, reason, ...details };
  if (allowed) {
    console.info('[perm allow]', payload);
  } else {
    console.warn('[perm deny]', payload);
  }
};
