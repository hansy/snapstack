import type * as Y from "yjs";

import { base64UrlToBytes, bytesToBase64Url } from "@/crypto/base64url";
import { canonicalizeJsonBytes } from "@/crypto/canonical";
import { utf8ToBytes } from "@/crypto/bytes";
import { signEd25519, verifyEd25519 } from "@/crypto/ed25519";
import { hkdfSha256, hmacSha256, sha256Bytes } from "@/crypto/hash";
import { bytesToHex } from "@/crypto/hex";
import type {
  CommandEnvelope,
  CommandEnvelopeUnsigned,
  CommandValidationResult,
} from "./types";

const MAC_INFO = "room-mac";
const MAC_KEY_LENGTH = 32;

const requireValue = <T>(value: T | null | undefined, field: string): T => {
  if (value === null || value === undefined) {
    throw new Error(`Command field ${field} is required`);
  }
  return value;
};

const assignIfDefined = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) => {
  if (value !== undefined) target[key] = value;
};

const buildCommandPayload = (
  envelope: CommandEnvelopeUnsigned,
  includeMac: boolean,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    v: requireValue(envelope.v, "v"),
    id: requireValue(envelope.id, "id"),
    actorId: requireValue(envelope.actorId, "actorId"),
    seq: requireValue(envelope.seq, "seq"),
    ts: requireValue(envelope.ts, "ts"),
    type: requireValue(envelope.type, "type"),
  };

  assignIfDefined(payload, "payloadPublic", envelope.payloadPublic);
  assignIfDefined(payload, "payloadOwnerEnc", envelope.payloadOwnerEnc);
  assignIfDefined(payload, "payloadSpectatorEnc", envelope.payloadSpectatorEnc);
  assignIfDefined(
    payload,
    "payloadRecipientsEnc",
    envelope.payloadRecipientsEnc,
  );

  payload.pubKey = requireValue(envelope.pubKey, "pubKey");

  if (includeMac) {
    payload.mac = requireValue(envelope.mac, "mac");
  }

  return payload;
};

export const deriveActorIdFromPublicKey = (publicKey: Uint8Array): string => {
  const digest = sha256Bytes(publicKey);
  return bytesToHex(digest.slice(0, 16));
};

export const derivePlayerMacKey = (params: {
  playerKey: Uint8Array;
  sessionId: string;
}): Uint8Array => {
  return hkdfSha256({
    ikm: params.playerKey,
    salt: utf8ToBytes(params.sessionId),
    info: utf8ToBytes(MAC_INFO),
    length: MAC_KEY_LENGTH,
  });
};

export const getCommandMacBytes = (
  envelope: CommandEnvelopeUnsigned,
): Uint8Array => {
  const payload = buildCommandPayload(envelope, false);
  return canonicalizeJsonBytes(payload);
};

export const getCommandSigningBytes = (envelope: CommandEnvelope): Uint8Array => {
  const payload = buildCommandPayload(envelope, true);
  return canonicalizeJsonBytes(payload);
};

export const computeCommandMac = (
  envelope: CommandEnvelopeUnsigned,
  macKey: Uint8Array,
): string => {
  const macBytes = hmacSha256(macKey, getCommandMacBytes(envelope));
  return bytesToBase64Url(macBytes);
};

export const signCommand = (params: {
  envelope: CommandEnvelopeUnsigned;
  macKey: Uint8Array;
  signPrivateKey: Uint8Array;
}): { mac: string; sig: string } => {
  const mac = computeCommandMac(params.envelope, params.macKey);
  const signingBytes = getCommandSigningBytes({
    ...params.envelope,
    mac,
    sig: "",
  } as CommandEnvelope);
  const signature = signEd25519(signingBytes, params.signPrivateKey);
  return { mac, sig: bytesToBase64Url(signature) };
};

export const appendCommand = (params: {
  commands: Y.Array<CommandEnvelope>;
  envelope: CommandEnvelopeUnsigned;
  sessionId: string;
  playerKey: Uint8Array;
  signPrivateKey: Uint8Array;
}): CommandEnvelope => {
  const macKey = derivePlayerMacKey({
    playerKey: params.playerKey,
    sessionId: params.sessionId,
  });
  const { mac, sig } = signCommand({
    envelope: params.envelope,
    macKey,
    signPrivateKey: params.signPrivateKey,
  });
  const signed: CommandEnvelope = {
    ...params.envelope,
    mac,
    sig,
  } as CommandEnvelope;
  params.commands.push([signed]);
  return signed;
};

export const validateCommand = (params: {
  envelope: CommandEnvelope;
  sessionId: string;
  playerKey: Uint8Array;
  expectedSeq?: number;
  expectedActorId?: string;
}): CommandValidationResult => {
  const { envelope } = params;

  if (!envelope.mac) return { ok: false, reason: "missing-mac" };
  if (!envelope.sig) return { ok: false, reason: "missing-sig" };

  let pubKeyBytes: Uint8Array;
  try {
    pubKeyBytes = base64UrlToBytes(envelope.pubKey);
  } catch (_err) {
    return { ok: false, reason: "invalid-pubkey" };
  }

  const derivedActorId = deriveActorIdFromPublicKey(pubKeyBytes);
  if (derivedActorId !== envelope.actorId) {
    return { ok: false, reason: "actor-id-mismatch" };
  }
  if (params.expectedActorId && params.expectedActorId !== envelope.actorId) {
    return { ok: false, reason: "expected-actor-mismatch" };
  }
  if (params.expectedSeq !== undefined && envelope.seq !== params.expectedSeq) {
    return { ok: false, reason: "seq-mismatch" };
  }

  let expectedMac: string;
  try {
    const macKey = derivePlayerMacKey({
      playerKey: params.playerKey,
      sessionId: params.sessionId,
    });
    expectedMac = computeCommandMac(envelope, macKey);
  } catch (_err) {
    return { ok: false, reason: "invalid-envelope" };
  }
  if (expectedMac !== envelope.mac) {
    return { ok: false, reason: "mac-mismatch" };
  }

  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(envelope.sig);
  } catch (_err) {
    return { ok: false, reason: "sig-mismatch" };
  }

  let signingBytes: Uint8Array;
  try {
    signingBytes = getCommandSigningBytes(envelope);
  } catch (_err) {
    return { ok: false, reason: "invalid-envelope" };
  }

  const validSig = verifyEd25519(signature, signingBytes, pubKeyBytes);
  if (!validSig) return { ok: false, reason: "sig-mismatch" };

  return { ok: true };
};
