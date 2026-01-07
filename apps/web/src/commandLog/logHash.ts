import { canonicalizeJsonBytes } from "@/crypto/canonical";
import { concatBytes, utf8ToBytes } from "@/crypto/bytes";
import { sha256Bytes } from "@/crypto/hash";
import { bytesToHex, hexToBytes } from "@/crypto/hex";
import type { CommandEnvelope } from "./types";

export const INITIAL_LOG_HASH_BYTES = sha256Bytes(utf8ToBytes("init"));
export const INITIAL_LOG_HASH_HEX = bytesToHex(INITIAL_LOG_HASH_BYTES);

export const computeCommandHashBytes = (envelope: CommandEnvelope): Uint8Array => {
  return sha256Bytes(canonicalizeJsonBytes(envelope));
};

export const computeCommandHashHex = (envelope: CommandEnvelope): string => {
  return bytesToHex(computeCommandHashBytes(envelope));
};

export const computeNextLogHashBytes = (params: {
  prevLogHash: Uint8Array;
  envelope: CommandEnvelope;
}): Uint8Array => {
  const commandHash = computeCommandHashBytes(params.envelope);
  return sha256Bytes(concatBytes(params.prevLogHash, commandHash));
};

export const computeNextLogHashHex = (params: {
  prevLogHash: string;
  envelope: CommandEnvelope;
}): string => {
  const prevBytes = hexToBytes(params.prevLogHash);
  return bytesToHex(
    computeNextLogHashBytes({ prevLogHash: prevBytes, envelope: params.envelope }),
  );
};

export const computeLogHashChainHex = (params: {
  envelopes: CommandEnvelope[];
  initialHash?: string;
}): string => {
  let current = hexToBytes(params.initialHash ?? INITIAL_LOG_HASH_HEX);
  for (const envelope of params.envelopes) {
    current = computeNextLogHashBytes({ prevLogHash: current, envelope });
  }
  return bytesToHex(current);
};
