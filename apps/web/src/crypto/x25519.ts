import { x25519 } from "@noble/curves/ed25519.js";

export const generateX25519KeyPair = (): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} => {
  const { secretKey, publicKey } = x25519.keygen();
  return { publicKey, privateKey: secretKey };
};

export const x25519SharedSecret = (
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Uint8Array => {
  return x25519.getSharedSecret(privateKey, publicKey);
};
