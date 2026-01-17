import * as Y from "yjs";

import { buildOverlayForViewer } from "../src/domain/overlay";
import { createEmptyHiddenState } from "../src/domain/hiddenState";
import { buildSnapshot, getMaps } from "../src/domain/yjsStore";
import { buildOverlayZoneLookup } from "../src/domain/overlay";
import type { Card } from "../../web/src/types/cards";
import type { Player } from "../../web/src/types/players";
import type { Zone, ZoneType } from "../../web/src/types/zones";

const config = {
  players: 4,
  handCards: 80,
  libraryCards: 120,
  battlefieldCards: 40,
  faceDownBattlefield: 10,
  iterations: 200,
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

const createZone = (
  id: string,
  type: ZoneType,
  ownerId: string,
  cardIds: string[] = []
): Zone => ({
  id,
  type,
  ownerId,
  cardIds,
});

const createCard = (
  id: string,
  ownerId: string,
  zoneId: string,
  overrides: Partial<Card> = {}
): Card => ({
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
  ...overrides,
});

const seedPlayers = (doc: Y.Doc, players: Player[]) => {
  const map = doc.getMap("players");
  const order = doc.getArray("playerOrder");
  order.delete(0, order.length);
  players.forEach((player) => map.set(player.id, player));
  if (players.length) {
    order.insert(
      0,
      players.map((player) => player.id)
    );
  }
};

const seedZones = (doc: Y.Doc, zones: Zone[]) => {
  const map = doc.getMap("zones");
  zones.forEach((zone) => map.set(zone.id, zone));
};

const seedCards = (doc: Y.Doc, cards: Card[]) => {
  const map = doc.getMap("cards");
  cards.forEach((card) => map.set(card.id, card));
};

const buildFixture = () => {
  const doc = createDoc();
  const players: Player[] = [];
  const zones: Zone[] = [];
  const publicCards: Card[] = [];
  const hidden = createEmptyHiddenState();

  for (let p = 0; p < config.players; p += 1) {
    const playerId = `p${p + 1}`;
    players.push(createPlayer(playerId));

    const handId = `hand-${playerId}`;
    const libraryId = `library-${playerId}`;
    const battlefieldId = `battlefield-${playerId}`;

    zones.push(createZone(handId, "hand", playerId, []));
    zones.push(createZone(libraryId, "library", playerId, []));
    zones.push(createZone(battlefieldId, "battlefield", playerId, []));

    hidden.handOrder[playerId] = [];
    hidden.libraryOrder[playerId] = [];

    for (let i = 0; i < config.handCards; i += 1) {
      const id = `h-${playerId}-${i}`;
      hidden.handOrder[playerId].push(id);
      hidden.cards[id] = createCard(id, playerId, handId);
    }

    for (let i = 0; i < config.libraryCards; i += 1) {
      const id = `l-${playerId}-${i}`;
      hidden.libraryOrder[playerId].push(id);
      hidden.cards[id] = createCard(id, playerId, libraryId);
    }

    const battlefieldIds: string[] = [];
    for (let i = 0; i < config.battlefieldCards; i += 1) {
      const id = `b-${playerId}-${i}`;
      const faceDown = i < config.faceDownBattlefield;
      const card = createCard(id, playerId, battlefieldId, { faceDown });
      publicCards.push(card);
      battlefieldIds.push(id);
      if (faceDown) {
        hidden.faceDownBattlefield[id] = { name: `Mystery ${id}` };
        hidden.faceDownReveals[id] = { toPlayers: [playerId] };
      }
    }

    const battlefieldZone = zones.find((zone) => zone.id === battlefieldId);
    if (battlefieldZone) battlefieldZone.cardIds = battlefieldIds;
  }

  seedPlayers(doc, players);
  seedZones(doc, zones);
  seedCards(doc, publicCards);

  return { doc, hidden, playerIds: players.map((player) => player.id) };
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const run = (options: { useSnapshot: boolean; useZoneLookup: boolean; iterations: number }) => {
  const fixture = buildFixture();
  const maps = getMaps(fixture.doc);
  const connections = [
    ...fixture.playerIds.map((playerId) => ({
      viewerId: playerId,
      viewerRole: "player" as const,
      libraryView: { playerId, count: 10 },
    })),
    { viewerRole: "spectator" as const },
  ];

  const startMemory = process.memoryUsage().heapUsed;
  const start = performance.now();

  for (let i = 0; i < options.iterations; i += 1) {
    const overlaySnapshot = options.useSnapshot ? buildSnapshot(maps) : undefined;
    const overlayZoneLookup =
      options.useSnapshot && options.useZoneLookup && overlaySnapshot
        ? buildOverlayZoneLookup(overlaySnapshot)
        : undefined;

    connections.forEach((connection) => {
      const args: any = {
        maps,
        hidden: fixture.hidden,
        viewerId: connection.viewerId,
        viewerRole: connection.viewerRole,
        libraryView: connection.libraryView,
      };
      if (overlaySnapshot) {
        args.snapshot = overlaySnapshot;
      }
      if (overlayZoneLookup) {
        args.zoneLookup = overlayZoneLookup;
      }
      buildOverlayForViewer(args);
    });
  }

  const durationMs = performance.now() - start;
  const endMemory = process.memoryUsage().heapUsed;
  const overlays = options.iterations * connections.length;
  const avgMs = durationMs / overlays;

  return {
    overlays,
    durationMs,
    avgMs,
    heapDelta: endMemory - startMemory,
  };
};

const useSnapshot = process.argv.includes("--snapshot");
const useZoneLookup = process.argv.includes("--zones");
const iterationArgIndex = process.argv.findIndex((arg) => arg === "--iterations");
const iterations = iterationArgIndex >= 0
  ? Number(process.argv[iterationArgIndex + 1])
  : config.iterations;

const result = run({
  useSnapshot,
  useZoneLookup,
  iterations: Number.isFinite(iterations) ? iterations : config.iterations,
});

const mode = useSnapshot ? (useZoneLookup ? "snapshot+zones" : "snapshot") : "baseline";
console.log(`overlay bench (${mode})`);
console.log(`players: ${config.players}, hand: ${config.handCards}, library: ${config.libraryCards}, battlefield: ${config.battlefieldCards}`);
console.log(`iterations: ${iterations}, overlays: ${result.overlays}`);
console.log(`total time: ${result.durationMs.toFixed(1)} ms`);
console.log(`avg time: ${result.avgMs.toFixed(4)} ms/overlay`);
console.log(`heap delta: ${formatBytes(result.heapDelta)}`);
