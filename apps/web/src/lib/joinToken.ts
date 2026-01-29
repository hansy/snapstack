import { getJoinToken } from "@/server/joinToken";

type JoinTokenCacheEntry = {
  token: string;
  exp: number;
};

const JOIN_TOKEN_REFRESH_BUFFER_MS = 30_000;
const cache = new Map<string, JoinTokenCacheEntry>();
const inflight = new Map<string, Promise<JoinTokenCacheEntry | null>>();

const isFresh = (entry: JoinTokenCacheEntry, now: number) =>
  entry.exp - now > JOIN_TOKEN_REFRESH_BUFFER_MS;

export const resolveJoinToken = async (roomId: string): Promise<string | null> => {
  if (!roomId) return null;
  const now = Date.now();
  const cached = cache.get(roomId);
  if (cached && isFresh(cached, now)) return cached.token;

  const existing = inflight.get(roomId);
  if (existing) {
    const result = await existing;
    return result?.token ?? null;
  }

  const request = getJoinToken({ data: { roomId } })
    .then((result) => {
      if (!result || typeof result.token !== "string") return null;
      if (typeof result.exp !== "number" || !Number.isFinite(result.exp)) return null;
      const entry = { token: result.token, exp: result.exp };
      cache.set(roomId, entry);
      return entry;
    })
    .catch((_err) => null)
    .finally(() => {
      inflight.delete(roomId);
    });

  inflight.set(roomId, request);
  const resolved = await request;
  return resolved?.token ?? null;
};

export const clearJoinToken = (roomId: string) => {
  if (!roomId) return;
  cache.delete(roomId);
};
