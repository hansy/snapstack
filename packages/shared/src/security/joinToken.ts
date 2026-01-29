export type JoinTokenPayload = {
  roomId: string;
  exp: number;
  nonce?: string;
};

export type JoinTokenVerifyResult =
  | { ok: true; payload: JoinTokenPayload }
  | { ok: false; reason: string };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array | null => {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (_err) {
    return null;
  }
};

const toBase64Url = (bytes: Uint8Array): string =>
  toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const fromBase64Url = (value: string): Uint8Array | null => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return fromBase64(normalized + padding);
};

const toArrayBufferView = (
  bytes: Uint8Array
): Uint8Array<ArrayBuffer> => {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
};

const importHmacKey = async (secret: string) => {
  const secretBytes = textEncoder.encode(secret);
  return crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

const coercePayload = (value: unknown): JoinTokenPayload | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const roomId = typeof record.roomId === "string" ? record.roomId : null;
  const exp = typeof record.exp === "number" && Number.isFinite(record.exp) ? record.exp : null;
  if (!roomId || exp === null) return null;
  const nonce = typeof record.nonce === "string" ? record.nonce : undefined;
  return { roomId, exp, ...(nonce ? { nonce } : null) };
};

export const createJoinToken = async (
  payload: JoinTokenPayload,
  secret: string
): Promise<string> => {
  const body = JSON.stringify(payload);
  const bodyBytes = textEncoder.encode(body);
  const key = await importHmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, bodyBytes));
  return `${toBase64Url(bodyBytes)}.${toBase64Url(signature)}`;
};

export const verifyJoinToken = async (
  token: string,
  secret: string,
  opts?: { now?: number; maxSkewMs?: number }
): Promise<JoinTokenVerifyResult> => {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "missing token" };
  }
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return { ok: false, reason: "invalid token format" };
  }
  const payloadBytes = fromBase64Url(payloadPart);
  const signatureBytes = fromBase64Url(signaturePart);
  if (!payloadBytes || !signatureBytes) {
    return { ok: false, reason: "invalid token encoding" };
  }

  const payloadView = toArrayBufferView(payloadBytes);
  const signatureView = toArrayBufferView(signatureBytes);
  const key = await importHmacKey(secret);
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureView,
    payloadView
  );
  if (!verified) {
    return { ok: false, reason: "invalid token signature" };
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(textDecoder.decode(payloadBytes));
  } catch (_err) {
    return { ok: false, reason: "invalid token payload" };
  }
  const payload = coercePayload(parsed);
  if (!payload) {
    return { ok: false, reason: "invalid token payload" };
  }
  const now = opts?.now ?? Date.now();
  const skew = typeof opts?.maxSkewMs === "number" ? Math.max(0, opts.maxSkewMs) : 0;
  if (payload.exp + skew < now) {
    return { ok: false, reason: "token expired" };
  }
  return { ok: true, payload };
};
