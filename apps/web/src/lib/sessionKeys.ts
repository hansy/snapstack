import { base64UrlToBytes, bytesToBase64Url } from "@/crypto/base64url";
import { randomBytes } from "@/crypto/random";
import { deriveRoomSigningPublicKey } from "@/crypto/roomSig";
import { createSafeStorage } from "@/lib/safeStorage";
import type { ViewerRole } from "@/types/ids";

export type SessionAccessKeys = {
  playerKey?: string;
  spectatorKey?: string;
  roomSigPubKey?: string;
};

type StoredSessionAccessKeys = SessionAccessKeys & { v: 1 };

type SessionKeySyncResult = {
  keys: SessionAccessKeys;
  fromHash: SessionAccessKeys;
};

const STORAGE_PREFIX = "mtg:session-keys:";
const STORAGE_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidKey = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && /^[A-Za-z0-9_-]+$/.test(value);

const storageKeyForSession = (sessionId: string) => `${STORAGE_PREFIX}${sessionId}`;

const parseSessionKeysFromHash = (hash: string): SessionAccessKeys => {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed) return {};
  const params = new URLSearchParams(trimmed);
  const playerKey = params.get("k") ?? undefined;
  const spectatorKey = params.get("s") ?? undefined;
  const roomSigPubKey = params.get("rk") ?? undefined;
  return {
    playerKey: isValidKey(playerKey) ? playerKey : undefined,
    spectatorKey: isValidKey(spectatorKey) ? spectatorKey : undefined,
    roomSigPubKey: isValidKey(roomSigPubKey) ? roomSigPubKey : undefined,
  };
};

export const getSessionAccessKeys = (
  sessionId: string,
  storage: Storage = createSafeStorage(),
): SessionAccessKeys => {
  try {
    const raw = storage.getItem(storageKeyForSession(sessionId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== STORAGE_VERSION) return {};
    const stored = parsed as StoredSessionAccessKeys;
    return {
      playerKey: isValidKey(stored.playerKey) ? stored.playerKey : undefined,
      spectatorKey: isValidKey(stored.spectatorKey)
        ? stored.spectatorKey
        : undefined,
      roomSigPubKey: isValidKey(stored.roomSigPubKey)
        ? stored.roomSigPubKey
        : undefined,
    };
  } catch (_err) {
    return {};
  }
};

export const setSessionAccessKeys = (
  sessionId: string,
  keys: SessionAccessKeys,
  storage: Storage = createSafeStorage(),
): void => {
  const payload: StoredSessionAccessKeys = {
    v: STORAGE_VERSION,
    playerKey: keys.playerKey,
    spectatorKey: keys.spectatorKey,
    roomSigPubKey: keys.roomSigPubKey,
  };
  try {
    storage.setItem(storageKeyForSession(sessionId), JSON.stringify(payload));
  } catch (_err) {
    // Ignore storage failures.
  }
};

export const mergeSessionAccessKeys = (
  sessionId: string,
  updates: SessionAccessKeys,
  storage: Storage = createSafeStorage(),
): SessionAccessKeys => {
  const existing = getSessionAccessKeys(sessionId, storage);
  const next: SessionAccessKeys = {
    playerKey: updates.playerKey ?? existing.playerKey,
    spectatorKey: updates.spectatorKey ?? existing.spectatorKey,
    roomSigPubKey: updates.roomSigPubKey ?? existing.roomSigPubKey,
  };
  if (
    next.playerKey !== existing.playerKey ||
    next.spectatorKey !== existing.spectatorKey ||
    next.roomSigPubKey !== existing.roomSigPubKey
  ) {
    setSessionAccessKeys(sessionId, next, storage);
  }
  return next;
};

export const ensureSessionAccessKeys = (
  sessionId: string,
  storage: Storage = createSafeStorage(),
): SessionAccessKeys => {
  const existing = getSessionAccessKeys(sessionId, storage);
  const next: SessionAccessKeys = {
    playerKey: existing.playerKey ?? bytesToBase64Url(randomBytes(32)),
    spectatorKey: existing.spectatorKey ?? bytesToBase64Url(randomBytes(32)),
    roomSigPubKey: existing.roomSigPubKey,
  };
  if (
    next.playerKey !== existing.playerKey ||
    next.spectatorKey !== existing.spectatorKey ||
    next.roomSigPubKey !== existing.roomSigPubKey
  ) {
    setSessionAccessKeys(sessionId, next, storage);
  }
  return next;
};

export const syncSessionAccessKeysFromLocation = (
  sessionId: string,
  location: Pick<Location, "hash"> | null =
    typeof window !== "undefined" ? window.location : null,
  storage: Storage = createSafeStorage(),
): SessionKeySyncResult => {
  const hash = location?.hash ?? "";
  const parsed = parseSessionKeysFromHash(hash);
  if (parsed.playerKey || parsed.spectatorKey || parsed.roomSigPubKey) {
    return {
      keys: mergeSessionAccessKeys(sessionId, parsed, storage),
      fromHash: parsed,
    };
  }
  return { keys: getSessionAccessKeys(sessionId, storage), fromHash: {} };
};

export const getSessionKeyForRole = (
  keys: SessionAccessKeys,
  role: ViewerRole,
): string | undefined => {
  return role === "spectator" ? keys.spectatorKey : keys.playerKey;
};

export const getShareRoleForRoom = (roomLockedByHost: boolean): ViewerRole =>
  roomLockedByHost ? "spectator" : "player";

export const buildSessionLink = (params: {
  sessionId: string;
  role: ViewerRole;
  keys: SessionAccessKeys;
  baseUrl?: string;
}): string => {
  const { sessionId, role, keys } = params;
  const key = getSessionKeyForRole(keys, role);
  const baseUrl =
    params.baseUrl ??
    (typeof window !== "undefined" ? window.location.origin : "");

  let hash = "";
  if (key) {
    if (role === "spectator") {
      const hashParams = new URLSearchParams();
      hashParams.set("s", key);
      let roomSigPubKey = keys.roomSigPubKey;
      if (!roomSigPubKey && keys.playerKey) {
        try {
          const derived = deriveRoomSigningPublicKey({
            sessionId,
            playerKey: base64UrlToBytes(keys.playerKey),
          });
          roomSigPubKey = bytesToBase64Url(derived);
        } catch (_err) {
          roomSigPubKey = undefined;
        }
      }
      if (roomSigPubKey) {
        hashParams.set("rk", roomSigPubKey);
      }
      hash = hashParams.toString();
    } else {
      hash = `k=${key}`;
    }
  }

  if (!baseUrl) {
    return `/game/${sessionId}${hash ? `#${hash}` : ""}`;
  }

  const url = new URL(baseUrl);
  url.pathname = `/game/${sessionId}`;
  url.hash = hash;
  return url.toString();
};

export const SESSION_KEYS_STORAGE_PREFIX = STORAGE_PREFIX;
