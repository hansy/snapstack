export const randomBytes = (length: number): Uint8Array => {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error("Secure random generation is not available in this environment");
  }
  const bytes = new Uint8Array(length);
  cryptoObj.getRandomValues(bytes);
  return bytes;
};
