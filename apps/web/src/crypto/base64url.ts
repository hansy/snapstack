const bytesToBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  if (typeof globalThis.btoa !== "function") {
    throw new Error("base64 encoding is not available in this environment");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }

  if (typeof globalThis.atob !== "function") {
    throw new Error("base64 decoding is not available in this environment");
  }
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const base64ToBase64Url = (value: string): string => {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlToBase64 = (value: string): string => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4;
  if (padding === 0) return padded;
  return padded + "=".repeat(4 - padding);
};

export const bytesToBase64Url = (bytes: Uint8Array): string => {
  return base64ToBase64Url(bytesToBase64(bytes));
};

export const base64UrlToBytes = (value: string): Uint8Array => {
  return base64ToBytes(base64UrlToBase64(value));
};
