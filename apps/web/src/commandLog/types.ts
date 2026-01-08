export type RecipientEncryptedPayload = {
  epk: string;
  nonce: string;
  ct: string;
};

export type CommandEnvelope = {
  v: 1;
  id: string;
  actorId: string;
  seq: number;
  ts: number;
  type: string;
  payloadPublic?: unknown;
  payloadOwnerEnc?: string;
  payloadSpectatorEnc?: string;
  payloadRecipientsEnc?: Record<string, RecipientEncryptedPayload>;
  pubKey: string;
  mac: string;
  sig: string;
  roomSig: string;
};

export type CommandEnvelopeUnsigned = Omit<
  CommandEnvelope,
  "mac" | "sig" | "roomSig"
> & {
  mac?: string;
  sig?: string;
  roomSig?: string;
};

export type SignedSnapshot = {
  v: 1;
  id: string;
  actorId: string;
  seq: number;
  ts: number;
  upToIndex: number;
  logHash: string;
  publicState: unknown;
  ownerEncByPlayer?: Record<string, string>;
  spectatorEnc?: string;
  pubKey: string;
  mac: string;
  sig: string;
  roomSig: string;
};

export type SignedSnapshotUnsigned = Omit<
  SignedSnapshot,
  "mac" | "sig" | "roomSig"
> & {
  mac?: string;
  sig?: string;
  roomSig?: string;
};

export type CommandValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "actor-id-mismatch"
        | "expected-actor-mismatch"
        | "mac-mismatch"
        | "missing-mac"
        | "missing-sig"
        | "seq-mismatch"
        | "sig-mismatch"
        | "invalid-pubkey"
        | "invalid-envelope"
        | "missing-room-sig"
        | "room-sig-mismatch";
    };
