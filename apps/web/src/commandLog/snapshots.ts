import type * as Y from "yjs";

import { base64UrlToBytes, bytesToBase64Url } from "@/crypto/base64url";
import { canonicalizeJsonBytes } from "@/crypto/canonical";
import { signEd25519, verifyEd25519 } from "@/crypto/ed25519";
import { hmacSha256 } from "@/crypto/hash";
import { deriveRoomSigningKeyPair, deriveRoomSigningPublicKey } from "@/crypto/roomSig";

import type {
  SignedSnapshot,
  SignedSnapshotUnsigned,
  CommandValidationResult,
} from "./types";
import { deriveActorIdFromPublicKey, derivePlayerMacKey } from "./commands";

const requireValue = <T>(value: T | null | undefined, field: string): T => {
  if (value === null || value === undefined) {
    throw new Error(`Snapshot field ${field} is required`);
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

const buildSnapshotPayload = (
  snapshot: SignedSnapshotUnsigned,
  includeMac: boolean,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    v: requireValue(snapshot.v, "v"),
    id: requireValue(snapshot.id, "id"),
    actorId: requireValue(snapshot.actorId, "actorId"),
    seq: requireValue(snapshot.seq, "seq"),
    ts: requireValue(snapshot.ts, "ts"),
    upToIndex: requireValue(snapshot.upToIndex, "upToIndex"),
    logHash: requireValue(snapshot.logHash, "logHash"),
    publicState: requireValue(snapshot.publicState, "publicState"),
  };

  assignIfDefined(payload, "ownerEncByPlayer", snapshot.ownerEncByPlayer);
  assignIfDefined(payload, "spectatorEnc", snapshot.spectatorEnc);

  payload.pubKey = requireValue(snapshot.pubKey, "pubKey");

  if (includeMac) {
    payload.mac = requireValue(snapshot.mac, "mac");
  }

  return payload;
};

export const getSnapshotMacBytes = (
  snapshot: SignedSnapshotUnsigned,
): Uint8Array => {
  const payload = buildSnapshotPayload(snapshot, false);
  return canonicalizeJsonBytes(payload);
};

export const getSnapshotSigningBytes = (
  snapshot: SignedSnapshot,
): Uint8Array => {
  const payload = buildSnapshotPayload(snapshot, true);
  return canonicalizeJsonBytes(payload);
};

export const computeSnapshotMac = (
  snapshot: SignedSnapshotUnsigned,
  macKey: Uint8Array,
): string => {
  const macBytes = hmacSha256(macKey, getSnapshotMacBytes(snapshot));
  return bytesToBase64Url(macBytes);
};

export const signSnapshot = (params: {
  snapshot: SignedSnapshotUnsigned;
  macKey: Uint8Array;
  signPrivateKey: Uint8Array;
}): { mac: string; sig: string } => {
  const mac = computeSnapshotMac(params.snapshot, params.macKey);
  const signingBytes = getSnapshotSigningBytes({
    ...params.snapshot,
    mac,
    sig: "",
  } as SignedSnapshot);
  const signature = signEd25519(signingBytes, params.signPrivateKey);
  return { mac, sig: bytesToBase64Url(signature) };
};

export const appendSnapshot = (params: {
  snapshots: Y.Array<SignedSnapshot>;
  snapshot: SignedSnapshotUnsigned;
  sessionId: string;
  playerKey: Uint8Array;
  signPrivateKey: Uint8Array;
}): SignedSnapshot => {
  const macKey = derivePlayerMacKey({
    playerKey: params.playerKey,
    sessionId: params.sessionId,
  });
  const { mac, sig } = signSnapshot({
    snapshot: params.snapshot,
    macKey,
    signPrivateKey: params.signPrivateKey,
  });
  const roomKeys = deriveRoomSigningKeyPair({
    sessionId: params.sessionId,
    playerKey: params.playerKey,
  });
  const roomSigningBytes = getSnapshotSigningBytes({
    ...params.snapshot,
    mac,
    sig,
  } as SignedSnapshot);
  const roomSig = bytesToBase64Url(
    signEd25519(roomSigningBytes, roomKeys.privateKey),
  );
  const signed: SignedSnapshot = {
    ...params.snapshot,
    mac,
    sig,
    roomSig,
  } as SignedSnapshot;
  params.snapshots.push([signed]);
  return signed;
};

export const validateSnapshot = (params: {
  snapshot: SignedSnapshot;
  sessionId: string;
  playerKey: Uint8Array;
  expectedActorId?: string;
}): CommandValidationResult => {
  const { snapshot } = params;
  if (!snapshot.mac) return { ok: false, reason: "missing-mac" };
  if (!snapshot.roomSig) return { ok: false, reason: "missing-room-sig" };
  if (!snapshot.sig) return { ok: false, reason: "missing-sig" };

  let pubKeyBytes: Uint8Array;
  try {
    pubKeyBytes = base64UrlToBytes(snapshot.pubKey);
  } catch (_err) {
    return { ok: false, reason: "invalid-pubkey" };
  }

  const derivedActorId = deriveActorIdFromPublicKey(pubKeyBytes);
  if (derivedActorId !== snapshot.actorId) {
    return { ok: false, reason: "actor-id-mismatch" };
  }
  if (params.expectedActorId && params.expectedActorId !== snapshot.actorId) {
    return { ok: false, reason: "expected-actor-mismatch" };
  }

  let expectedMac: string;
  try {
    const macKey = derivePlayerMacKey({
      playerKey: params.playerKey,
      sessionId: params.sessionId,
    });
    expectedMac = computeSnapshotMac(snapshot, macKey);
  } catch (_err) {
    return { ok: false, reason: "invalid-envelope" };
  }
  if (expectedMac !== snapshot.mac) {
    return { ok: false, reason: "mac-mismatch" };
  }

  const roomPublicKey = deriveRoomSigningPublicKey({
    sessionId: params.sessionId,
    playerKey: params.playerKey,
  });
  let roomSigBytes: Uint8Array;
  try {
    roomSigBytes = base64UrlToBytes(snapshot.roomSig);
  } catch (_err) {
    return { ok: false, reason: "room-sig-mismatch" };
  }
  const roomSigningBytes = getSnapshotSigningBytes(snapshot);
  const roomSigValid = verifyEd25519(
    roomSigBytes,
    roomSigningBytes,
    roomPublicKey,
  );
  if (!roomSigValid) return { ok: false, reason: "room-sig-mismatch" };

  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(snapshot.sig);
  } catch (_err) {
    return { ok: false, reason: "sig-mismatch" };
  }

  let signingBytes: Uint8Array;
  try {
    signingBytes = getSnapshotSigningBytes(snapshot);
  } catch (_err) {
    return { ok: false, reason: "invalid-envelope" };
  }

  const validSig = verifyEd25519(signature, signingBytes, pubKeyBytes);
  if (!validSig) return { ok: false, reason: "sig-mismatch" };

  return { ok: true };
};

export const validateSnapshotRoomSig = (params: {
  snapshot: SignedSnapshot;
  roomPublicKey: Uint8Array;
}): CommandValidationResult => {
  try {
    if (!params.snapshot.mac) return { ok: false, reason: "missing-mac" };
    if (!params.snapshot.sig) return { ok: false, reason: "missing-sig" };
    if (!params.snapshot.roomSig) return { ok: false, reason: "missing-room-sig" };
    const pubKeyBytes = base64UrlToBytes(params.snapshot.pubKey);
    const derivedActorId = deriveActorIdFromPublicKey(pubKeyBytes);
    if (derivedActorId !== params.snapshot.actorId) {
      return { ok: false, reason: "actor-id-mismatch" };
    }
    let roomSigBytes: Uint8Array;
    try {
      roomSigBytes = base64UrlToBytes(params.snapshot.roomSig);
    } catch (_err) {
      return { ok: false, reason: "room-sig-mismatch" };
    }
    const signingBytes = getSnapshotSigningBytes(params.snapshot);
    const roomSigValid = verifyEd25519(
      roomSigBytes,
      signingBytes,
      params.roomPublicKey,
    );
    if (!roomSigValid) return { ok: false, reason: "room-sig-mismatch" };
    const actorSigValid = verifyEd25519(
      base64UrlToBytes(params.snapshot.sig),
      signingBytes,
      pubKeyBytes,
    );
    return actorSigValid ? { ok: true } : { ok: false, reason: "sig-mismatch" };
  } catch (_err) {
    return { ok: false, reason: "invalid-envelope" };
  }
};
