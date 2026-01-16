const ROOM_ID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DEFAULT_ROOM_ID_LENGTH = 10;

export const createRoomId = (length = DEFAULT_ROOM_ID_LENGTH): string => {
  const safeLength =
    typeof length === "number" && Number.isFinite(length) && length > 0
      ? Math.floor(length)
      : DEFAULT_ROOM_ID_LENGTH;
  const alphabetLength = ROOM_ID_ALPHABET.length;

  const cryptoSource =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  const bytes =
    cryptoSource && typeof cryptoSource.getRandomValues === "function"
      ? cryptoSource.getRandomValues(new Uint8Array(safeLength))
      : null;

  let result = "";
  for (let i = 0; i < safeLength; i += 1) {
    const value = bytes ? bytes[i] : Math.floor(Math.random() * 256);
    result += ROOM_ID_ALPHABET[value % alphabetLength];
  }
  return result;
};
