export const utf8ToBytes = (value: string): Uint8Array => {
  return new TextEncoder().encode(value);
};

export const bytesToUtf8 = (value: Uint8Array): string => {
  return new TextDecoder().decode(value);
};

export const toBytes = (value: Uint8Array | string): Uint8Array => {
  return typeof value === "string" ? utf8ToBytes(value) : value;
};

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const next = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    next.set(part, offset);
    offset += part.length;
  }
  return next;
};
