import { ed25519 } from "@noble/curves/ed25519.js";

export const generateEd25519KeyPair = (): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} => {
  const { secretKey, publicKey } = ed25519.keygen();
  return { publicKey, privateKey: secretKey };
};

export const deriveEd25519KeyPairFromSeed = (
  seed: Uint8Array,
): { publicKey: Uint8Array; privateKey: Uint8Array } => {
  const privateKey = seed;
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
};

export const signEd25519 = (
  message: Uint8Array,
  privateKey: Uint8Array,
): Uint8Array => {
  return ed25519.sign(message, privateKey);
};

export const verifyEd25519 = (
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean => {
  return ed25519.verify(signature, message, publicKey);
};
