import * as Y from "yjs";

import { applyIntentToDoc } from "../src/domain/intents/applyIntentToDoc";
import { createEmptyHiddenState } from "../src/domain/hiddenState";
import type { Card } from "../../web/src/types/cards";
import type { Player } from "../../web/src/types/players";
import type { Zone, ZoneType } from "../../web/src/types/zones";

const config = {
  players: 4,
  libraryCards: 2000,
  iterations: 5000,
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

const createZone = (id: string, type: ZoneType, ownerId: string, cardIds: string[] = []): Zone => ({
  id,
  type,
  ownerId,
  cardIds,
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

const players = withArg("players", config.players);
const libraryCards = withArg("libraryCards", config.libraryCards);
const iterations = withArg("iterations", config.iterations);

const doc = createDoc();
const hidden = createEmptyHiddenState();
const playersMap = doc.getMap("players");
const zonesMap = doc.getMap("zones");

for (let p = 0; p < players; p += 1) {
  const playerId = `p${p + 1}`;
  playersMap.set(playerId, createPlayer(playerId));

  const libraryId = `library-${playerId}`;
  const handId = `hand-${playerId}`;
  zonesMap.set(libraryId, createZone(libraryId, "library", playerId, []));
  zonesMap.set(handId, createZone(handId, "hand", playerId, []));

  hidden.libraryOrder[playerId] = [];
  hidden.handOrder[playerId] = [];

  for (let i = 0; i < libraryCards; i += 1) {
    const cardId = `l-${playerId}-${i}`;
    hidden.libraryOrder[playerId].push(cardId);
    hidden.cards[cardId] = createCard(cardId, playerId, libraryId);
  }
}

const actorId = "p1";
const intent = {
  id: "intent-1",
  type: "library.view",
  payload: {
    actorId,
    playerId: actorId,
    count: 7,
  },
};

const startMem = process.memoryUsage().heapUsed;
const start = performance.now();

for (let i = 0; i < iterations; i += 1) {
  const result = applyIntentToDoc(doc, intent, hidden);
  if (!result.ok) {
    throw new Error(result.error);
  }
}

const duration = performance.now() - start;
const endMem = process.memoryUsage().heapUsed;

console.log("intent bench (library.view)");
console.log(`players: ${players}, libraryCards: ${libraryCards}, iterations: ${iterations}`);
console.log(`total time: ${duration.toFixed(1)} ms`);
console.log(`avg time: ${(duration / iterations).toFixed(4)} ms/intent`);
console.log(`heap delta: ${formatBytes(endMem - startMem)}`);
