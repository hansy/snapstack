import { hmac } from "@noble/hashes/hmac.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { toBytes } from "./bytes";
import { bytesToHex } from "./hex";

export const sha256Bytes = (data: Uint8Array | string): Uint8Array => {
  return sha256(toBytes(data));
};

export const sha256Hex = (data: Uint8Array | string): string => {
  return bytesToHex(sha256Bytes(data));
};

export const hmacSha256 = (
  key: Uint8Array,
  data: Uint8Array | string,
): Uint8Array => {
  return hmac(sha256, key, toBytes(data));
};

export const hkdfSha256 = (params: {
  ikm: Uint8Array;
  salt: Uint8Array;
  info: Uint8Array;
  length: number;
}): Uint8Array => {
  return hkdf(sha256, params.ikm, params.salt, params.info, params.length);
};
