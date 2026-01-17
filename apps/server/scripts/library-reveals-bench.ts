import * as Y from "yjs";

import { createEmptyHiddenState, syncLibraryRevealsToAllForPlayer } from "../src/domain/hiddenState";
import { getMaps } from "../src/domain/yjsStore";
import type { Card } from "../../web/src/types/cards";
import type { Player } from "../../web/src/types/players";
import type { Zone } from "../../web/src/types/zones";

const config = {
  cards: 1500,
  reveals: 250,
  iterations: 300,
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

const createDoc = () => {
  const doc = new Y.Doc();
  doc.getMap("players");
  doc.getArray<string>("playerOrder");
  doc.getMap("zones");
  doc.getMap("cards");
  doc.getMap<Y.Array<string>>("zoneCardOrders");
  doc.getMap("globalCounters");
  doc.getMap("battlefieldViewScale");
  doc.getMap("meta");
  doc.getMap("handRevealsToAll");
  doc.getMap("libraryRevealsToAll");
  doc.getMap("faceDownRevealsToAll");
  return doc;
};

const createPlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  name: `Player ${id}`,
  life: 20,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
  ...overrides,
});

const createZone = (id: string, ownerId: string): Zone => ({
  id,
  type: "library",
  ownerId,
  cardIds: [],
});

const createCard = (id: string, ownerId: string, zoneId: string): Card => ({
  id,
  name: `Card ${id}`,
  ownerId,
  controllerId: ownerId,
  zoneId,
  tapped: false,
  faceDown: false,
  position: { x: 0.5, y: 0.5 },
  rotation: 0,
  counters: [],
  oracleText: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  imageUrl: `https://img.example/${id}.png`,
});

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const cardsCount = withArg("cards", config.cards);
const revealsCount = withArg("reveals", config.reveals);
const iterations = withArg("iterations", config.iterations);

const doc = createDoc();
const maps = getMaps(doc);

const playerId = "p1";
const player = createPlayer(playerId, { libraryTopReveal: "all" });
maps.players.set(playerId, player);

const zone = createZone("library-p1", playerId);
maps.zones.set(zone.id, zone);

const hidden = createEmptyHiddenState();
hidden.libraryOrder[playerId] = [];

for (let i = 0; i < cardsCount; i += 1) {
  const cardId = `c-${i}`;
  hidden.libraryOrder[playerId].push(cardId);
  hidden.cards[cardId] = createCard(cardId, playerId, zone.id);
}

for (let i = 0; i < revealsCount && i < cardsCount; i += 1) {
  const cardId = `c-${i}`;
  hidden.libraryReveals[cardId] = { toAll: true };
}

const revealsToAll = maps.libraryRevealsToAll;
for (let i = cardsCount - 1; i > cardsCount - 20; i -= 1) {
  const cardId = `stale-${i}`;
  revealsToAll.set(cardId, { card: { name: `Stale ${cardId}` }, ownerId: playerId, orderKey: "999999" });
}

const startMem = process.memoryUsage().heapUsed;
const start = performance.now();

for (let i = 0; i < iterations; i += 1) {
  syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, zone.id);
}

const duration = performance.now() - start;
const endMem = process.memoryUsage().heapUsed;

console.log("library reveals bench");
console.log(`cards: ${cardsCount}, reveals: ${revealsCount}, iterations: ${iterations}`);
console.log(`total time: ${duration.toFixed(1)} ms`);
console.log(`avg time: ${(duration / iterations).toFixed(3)} ms/iteration`);
console.log(`heap delta: ${formatBytes(endMem - startMem)}`);
