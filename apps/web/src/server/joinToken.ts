import { createServerFn } from "@tanstack/react-start";
import { createJoinToken } from "@mtg/shared/security/joinToken";

type JoinTokenRequest = {
  roomId: string;
};

type JoinTokenResponse = {
  token: string;
  exp: number;
};

const CLIENT_ALLOWED_ORIGINS = new Set([
  "https://drawspell.space",
  "http://localhost:5173",
]);
const JOIN_TOKEN_TTL_MS = 5 * 60_000;

const joinTokenValidator = (input: JoinTokenRequest) => input;

const normalizeOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch (_err) {
    return null;
  }
};

const isOriginAllowed = (origin: string | null, allowed: Set<string>) => {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return allowed.has(normalized);
};

type ServerEnv = {
  JOIN_TOKEN_SECRET?: string;
};

const resolveServerEnv = (ctx: {
  context?: { env?: ServerEnv };
}): ServerEnv => {
  if (ctx.context?.env) return ctx.context.env;
  if (typeof process !== "undefined") {
    return process.env as ServerEnv;
  }
  return {};
};

export const getJoinToken = createServerFn({ method: "POST" })
  .inputValidator(joinTokenValidator)
  .handler(async (ctx): Promise<JoinTokenResponse> => {
    try {
      const payload = ctx.data;
      const roomId = payload?.roomId?.trim();
      if (!roomId) {
        console.error("[joinToken] missing room");
        throw new Error("missing room");
      }

      const env = resolveServerEnv(ctx);
      const request = (ctx as { request?: Request }).request;
      const origin = request?.headers?.get("Origin") ?? null;
      if (!isOriginAllowed(origin, CLIENT_ALLOWED_ORIGINS)) {
        console.error("[joinToken] origin not allowed", { origin, roomId });
        throw new Error("origin not allowed");
      }

      const secret = env.JOIN_TOKEN_SECRET;
      if (!secret) {
        console.error("[joinToken] secret missing", { roomId });
        throw new Error("join token secret missing");
      }
      const exp = Date.now() + JOIN_TOKEN_TTL_MS;
      const token = await createJoinToken({ roomId, exp }, secret);

      return { token, exp };
    } catch (error) {
      console.error("[joinToken] error", {
        message:
          typeof error === "string"
            ? error
            : typeof error === "object" && error && "message" in error
              ? String((error as { message?: unknown }).message)
              : "unknown",
      });
      throw error;
    }
  });
