import { chunkHiddenCards } from "../src/domain/hiddenState";
import type { Card } from "../../web/src/types/cards";

const config = {
  cards: 4000,
  iterations: 30,
  nameSize: 18,
  textSize: 80,
};

const readArg = (name: string) => {
  const idx = process.argv.findIndex((arg) => arg === `--${name}`);
  if (idx === -1) return null;
  const raw = process.argv[idx + 1];
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

const withArg = <T extends number>(key: keyof typeof config, fallback: T): T => {
  const value = readArg(String(key));
  return (value ?? fallback) as T;
};

const repeatChar = (char: string, count: number) => Array(count + 1).join(char);

const buildCards = (count: number) => {
  const cards: Record<string, Card> = {};
  const nameStub = repeatChar("N", config.nameSize);
  const textStub = repeatChar("T", config.textSize);
  for (let i = 0; i < count; i += 1) {
    const id = `card-${i}`;
    cards[id] = {
      id,
      name: `${nameStub}-${i}`,
      ownerId: "p1",
      controllerId: "p1",
      zoneId: "hand-p1",
      tapped: false,
      faceDown: false,
      position: { x: 0.5, y: 0.5 },
      rotation: 0,
      counters: [],
      oracleText: textStub,
      imageUrl: `https://img.example/${i}.png`,
    };
  }
  return cards;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const cardsCount = withArg("cards", config.cards);
const iterations = withArg("iterations", config.iterations);
const cards = buildCards(cardsCount);

const startMem = process.memoryUsage().heapUsed;
const start = performance.now();
let totalChunks = 0;

for (let i = 0; i < iterations; i += 1) {
  const chunks = chunkHiddenCards(cards);
  totalChunks += chunks.length;
}

const duration = performance.now() - start;
const endMem = process.memoryUsage().heapUsed;
const totalOps = iterations;

console.log("hidden chunk bench");
console.log(`cards: ${cardsCount}, iterations: ${iterations}`);
console.log(`total chunks: ${totalChunks}`);
console.log(`total time: ${duration.toFixed(1)} ms`);
console.log(`avg time: ${(duration / totalOps).toFixed(3)} ms/iteration`);
console.log(`heap delta: ${formatBytes(endMem - startMem)}`);
