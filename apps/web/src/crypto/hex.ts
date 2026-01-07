export const bytesToHex = (bytes: Uint8Array): string => {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
};

export const hexToBytes = (hex: string): Uint8Array => {
  const normalized = hex.trim().toLowerCase();
  if (normalized.length % 2 !== 0) {
    throw new Error("Hex string must have an even length");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const start = i * 2;
    const value = Number.parseInt(normalized.slice(start, start + 2), 16);
    if (Number.isNaN(value)) {
      throw new Error("Hex string contains invalid bytes");
    }
    bytes[i] = value;
  }
  return bytes;
};
