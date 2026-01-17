import * as Y from "yjs";

import { applyIntentToDoc } from "../src/domain/intents/applyIntentToDoc";
import { createEmptyHiddenState } from "../src/domain/hiddenState";
import type { Card } from "../../web/src/types/cards";
import type { Player } from "../../web/src/types/players";
import type { Zone } from "../../web/src/types/zones";

const config = {
  battlefieldCards: 800,
  otherZoneCards: 2500,
  iterations: 200,
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

const createZone = (id: string, type: Zone["type"], ownerId: string, cardIds: string[] = []): Zone => ({
  id,
  type,
  ownerId,
  cardIds,
});

const createCard = (id: string, ownerId: string, zoneId: string, overrides: Partial<Card> = {}): Card => ({
  id,
  name: `Card ${id}`,
  ownerId,
  controllerId: ownerId,
  zoneId,
  tapped: false,
  faceDown: false,
  position: { x: Math.random(), y: Math.random() },
  rotation: 0,
  counters: [],
  ...overrides,
});

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const battlefieldCards = withArg("battlefieldCards", config.battlefieldCards);
const otherZoneCards = withArg("otherZoneCards", config.otherZoneCards);
const iterations = withArg("iterations", config.iterations);

const doc = createDoc();
const hidden = createEmptyHiddenState();

const playersMap = doc.getMap("players");
const zonesMap = doc.getMap("zones");
const cardsMap = doc.getMap("cards");

const playerId = "p1";
playersMap.set(playerId, createPlayer(playerId));

const battlefield = createZone("bf-p1", "battlefield", playerId, []);
const graveyard = createZone("gy-p1", "graveyard", playerId, []);
const hand = createZone("hand-p1", "hand", playerId, []);

zonesMap.set(battlefield.id, battlefield);
zonesMap.set(graveyard.id, graveyard);
zonesMap.set(hand.id, hand);

for (let i = 0; i < battlefieldCards; i += 1) {
  const cardId = `bf-${i}`;
  battlefield.cardIds.push(cardId);
  cardsMap.set(cardId, createCard(cardId, playerId, battlefield.id));
}

for (let i = 0; i < otherZoneCards; i += 1) {
  const cardId = `gy-${i}`;
  graveyard.cardIds.push(cardId);
  cardsMap.set(cardId, createCard(cardId, playerId, graveyard.id));
}

const sourceCardId = battlefield.cardIds[0] ?? "bf-0";
const startMem = process.memoryUsage().heapUsed;
const start = performance.now();

for (let i = 0; i < iterations; i += 1) {
  const newCardId = `dup-${i}`;
  const result = applyIntentToDoc(
    doc,
    {
      id: `intent-${i}`,
      type: "card.duplicate",
      payload: {
        actorId: playerId,
        cardId: sourceCardId,
        newCardId,
      },
    },
    hidden
  );

  if (!result.ok) {
    throw new Error(result.error);
  }
}

const duration = performance.now() - start;
const endMem = process.memoryUsage().heapUsed;

console.log("duplicate bench");
console.log(`battlefield cards: ${battlefieldCards}, other zone cards: ${otherZoneCards}`);
console.log(`iterations: ${iterations}`);
console.log(`total time: ${duration.toFixed(1)} ms`);
console.log(`avg time: ${(duration / iterations).toFixed(3)} ms/iteration`);
console.log(`heap delta: ${formatBytes(endMem - startMem)}`);
