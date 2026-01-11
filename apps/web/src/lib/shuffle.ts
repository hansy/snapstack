const TWO_POW_32 = 2 ** 32;
const TWO_POW_53 = 2 ** 53;

const cryptoRandom = (): number | null => {
  if (typeof globalThis === "undefined") return null;
  const crypto = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
  const getRandomValues = crypto?.getRandomValues?.bind(crypto);
  if (!getRandomValues) return null;

  try {
    const buffer = new Uint32Array(2);
    getRandomValues(buffer);
    const [hi, lo] = buffer;
    // Combine to 53 bits to match Math.random's range, avoiding modulo bias.
    return ((hi & 0x1fffff) * TWO_POW_32 + lo) / TWO_POW_53;
  } catch {
    return null;
  }
};

const defaultRandom = () => cryptoRandom() ?? Math.random();

export function shuffle<T>(items: T[], random = defaultRandom): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}
