import type { CardIdentity } from "@mtg/shared/types/cards";

import { LEGACY_COMMAND_ZONE, ZONE } from "./constants";
import type { Zone } from "@mtg/shared/types/zones";
import { enforceZoneCounterRules, mergeCardIdentity, resetCardToFrontFace } from "./cards";
import { clearFaceDownStateForCard, syncLibraryRevealsToAllForPlayer, updatePlayerCounts } from "./hiddenState";
import { placeCardId, removeFromArray } from "./lists";
import { shuffle } from "./random";
import { findZoneByType } from "./zones";
import { buildSnapshot, readCard, readPlayer, readZone, uniqueStrings, writeCard, writePlayer, writeZone } from "./yjsStore";
import type { HiddenState, Maps } from "./types";

const applyDeckRebuild = (
  maps: Maps,
  hidden: HiddenState,
  playerId: string,
  options: { mode: "reset" | "mulligan"; drawTarget?: number }
): { actualDrawCount: number; libraryZoneId: string } | null => {
  const snapshot = buildSnapshot(maps);
  const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
  const handZone = findZoneByType(snapshot.zones, playerId, ZONE.HAND);
  const sideboardZone = findZoneByType(snapshot.zones, playerId, ZONE.SIDEBOARD);
  const commanderZone = findZoneByType(snapshot.zones, playerId, ZONE.COMMANDER);
  if (!libraryZone) return null;
  if (options.mode === "mulligan" && !handZone) return null;

  const commanderKeeps =
    commanderZone?.cardIds.filter((id) => snapshot.cards[id]?.ownerId !== playerId) ?? [];
  const commanderOwned =
    commanderZone?.cardIds.filter((id) => snapshot.cards[id]?.ownerId === playerId) ?? [];
  const toCommander: string[] = [];
  const commanderIdentityOverrides: Record<string, CardIdentity> = {};

  const previousHandOrder = hidden.handOrder[playerId] ?? [];
  const previousLibraryOrder = hidden.libraryOrder[playerId] ?? [];

  previousHandOrder.forEach((id) => {
    Reflect.deleteProperty(hidden.handReveals, id);
    maps.handRevealsToAll.delete(id);
  });

  previousLibraryOrder.forEach((id) => {
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.libraryRevealsToAll.delete(id);
  });

  const libraryKeeps = previousLibraryOrder.filter((id) => {
    const card = hidden.cards[id];
    return card && card.ownerId !== playerId;
  });

  const toLibrary: string[] = [];

  const removeFromPublicZone = (zoneId: string, cardId: string) => {
    const zone = readZone(maps, zoneId) ?? snapshot.zones[zoneId];
    if (!zone) return;
    const nextIds = removeFromArray(zone.cardIds, cardId);
    writeZone(maps, { ...zone, cardIds: nextIds });
  };

  Object.values(snapshot.cards).forEach((card) => {
    if (card.ownerId !== playerId) return;
    const fromZone = snapshot.zones[card.zoneId];
    if (!fromZone) return;
    const fromZoneType = fromZone.type as Zone["type"] | typeof LEGACY_COMMAND_ZONE;
    const inCommanderZone = fromZoneType === ZONE.COMMANDER || fromZoneType === LEGACY_COMMAND_ZONE;
    const inSideboard = fromZone.type === ZONE.SIDEBOARD;
    const resolvedCard = card.faceDown
      ? mergeCardIdentity(card, hidden.faceDownBattlefield[card.id])
      : card;

    if (resolvedCard.isToken) {
      removeFromPublicZone(card.zoneId, card.id);
      maps.cards.delete(card.id);
      clearFaceDownStateForCard(maps, hidden, card.id);
      return;
    }

    if (resolvedCard.isCommander && commanderZone) {
      if (resolvedCard.faceDown && hidden.faceDownBattlefield[card.id]) {
        commanderIdentityOverrides[card.id] = hidden.faceDownBattlefield[card.id];
      }
      if (!inCommanderZone) {
        removeFromPublicZone(card.zoneId, card.id);
      }
      clearFaceDownStateForCard(maps, hidden, card.id);
      toCommander.push(card.id);
      return;
    }

    if (inCommanderZone) {
      return;
    }

    if (inSideboard && !resolvedCard.isCommander) {
      removeFromPublicZone(card.zoneId, card.id);
      maps.cards.delete(card.id);
      hidden.cards[card.id] = { ...resolvedCard, zoneId: fromZone.id };
      hidden.sideboardOrder[playerId] = placeCardId(
        hidden.sideboardOrder[playerId] ?? [],
        card.id,
        "top"
      );
      clearFaceDownStateForCard(maps, hidden, card.id);
      return;
    }

    removeFromPublicZone(card.zoneId, card.id);
    maps.cards.delete(card.id);
    clearFaceDownStateForCard(maps, hidden, card.id);
    toLibrary.push(card.id);
    hidden.cards[card.id] = { ...resolvedCard, zoneId: libraryZone.id };
  });

  Object.entries(hidden.cards).forEach(([cardId, card]) => {
    if (card.ownerId !== playerId) return;
    const zone = snapshot.zones[card.zoneId];
    if (card.isToken) {
      Reflect.deleteProperty(hidden.cards, cardId);
      return;
    }
    if (card.isCommander && commanderZone) {
      toCommander.push(cardId);
      return;
    }
    if (zone?.type === ZONE.SIDEBOARD && !card.isCommander) {
      return;
    }
    toLibrary.push(cardId);
  });

  const commanderCardIds = uniqueStrings([...commanderOwned, ...toCommander]);
  commanderCardIds.forEach((cardId) => {
    Reflect.deleteProperty(hidden.cards, cardId);
    hidden.handOrder[playerId] = removeFromArray(hidden.handOrder[playerId] ?? [], cardId);
    hidden.libraryOrder[playerId] = removeFromArray(hidden.libraryOrder[playerId] ?? [], cardId);
    hidden.sideboardOrder[playerId] = removeFromArray(
      hidden.sideboardOrder[playerId] ?? [],
      cardId
    );
  });

  const shuffled = shuffle(uniqueStrings([...libraryKeeps, ...toLibrary]));
  const shouldDraw = options.mode === "mulligan";
  const drawTarget = shouldDraw
    ? Number.isFinite(options.drawTarget) ? Math.max(0, Math.floor(options.drawTarget ?? 0)) : 0
    : 0;
  const actualDrawCount = shouldDraw ? Math.min(drawTarget, shuffled.length) : 0;
  const drawIds = shouldDraw && actualDrawCount > 0 ? shuffled.slice(-actualDrawCount) : [];
  const remainingLibrary = shouldDraw
    ? shuffled.slice(0, shuffled.length - drawIds.length)
    : shuffled;

  hidden.libraryOrder[playerId] = remainingLibrary;
  hidden.handOrder[playerId] = shouldDraw ? drawIds : [];

  shuffled.forEach((id) => {
    const card = hidden.cards[id];
    if (!card) return;
    const resetCard = resetCardToFrontFace(card);
    hidden.cards[id] = {
      ...resetCard,
      zoneId: libraryZone.id,
      tapped: false,
      faceDown: false,
      controllerId: card.ownerId,
      knownToAll: false,
      position: { x: 0, y: 0 },
      rotation: 0,
      customText: undefined,
      counters: enforceZoneCounterRules(resetCard.counters, libraryZone),
    };
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.libraryRevealsToAll.delete(id);
  });

  drawIds.forEach((id) => {
    const card = hidden.cards[id];
    if (!card || !handZone) return;
    hidden.cards[id] = {
      ...card,
      zoneId: handZone.id,
      counters: enforceZoneCounterRules(card.counters, handZone),
    };
  });

  hidden.sideboardOrder[playerId] = (hidden.sideboardOrder[playerId] ?? []).filter((id) => {
    const card = hidden.cards[id];
    if (!card) return false;
    if (card.isToken) return false;
    if (commanderCardIds.includes(id)) return false;
    return true;
  });

  if (handZone) {
    writeZone(maps, { ...handZone, cardIds: shouldDraw ? drawIds : [] });
  }
  writeZone(maps, { ...libraryZone, cardIds: [] });
  if (sideboardZone) writeZone(maps, { ...sideboardZone, cardIds: [] });

  if (commanderZone) {
    const commanderIds = uniqueStrings([...commanderKeeps, ...commanderOwned, ...toCommander]);
    commanderIds.forEach((id) => {
      const source = hidden.cards[id] ?? snapshot.cards[id];
      if (!source) return;
      const identityOverride = commanderIdentityOverrides[id];
      const resolvedSource = mergeCardIdentity(source, identityOverride);
      const resetCard = resetCardToFrontFace(resolvedSource);
      const nextCard = {
        ...resetCard,
        zoneId: commanderZone.id,
        tapped: false,
        faceDown: false,
        controllerId: source.ownerId,
        knownToAll: true,
        customText: undefined,
        counters: enforceZoneCounterRules(resetCard.counters, commanderZone),
        isCommander: true,
      };
      writeCard(maps, nextCard);
    });
    writeZone(maps, { ...commanderZone, cardIds: commanderIds });
  }

  updatePlayerCounts(maps, hidden, playerId);
  syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);

  return { actualDrawCount, libraryZoneId: libraryZone.id };
};

export const applyResetDeck = (maps: Maps, hidden: HiddenState, playerId: string) => {
  const result = applyDeckRebuild(maps, hidden, playerId, { mode: "reset" });
  if (!result) return;
  const player = readPlayer(maps, playerId);
  if (player) {
    writePlayer(maps, { ...player, libraryTopReveal: undefined });
  }
  syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, result.libraryZoneId);
};

export const applyUnloadDeck = (maps: Maps, hidden: HiddenState, playerId: string) => {
  const snapshot = buildSnapshot(maps);

  Object.values(snapshot.cards).forEach((card) => {
    if (card.ownerId !== playerId) return;
    const zone = snapshot.zones[card.zoneId];
    if (zone) {
      const nextIds = removeFromArray(zone.cardIds, card.id);
      writeZone(maps, { ...zone, cardIds: nextIds });
    }
    maps.cards.delete(card.id);
    clearFaceDownStateForCard(maps, hidden, card.id);
  });

  Object.entries(hidden.cards).forEach(([id, card]) => {
    if (card.ownerId !== playerId) return;
    Reflect.deleteProperty(hidden.cards, id);
    Reflect.deleteProperty(hidden.handReveals, id);
    Reflect.deleteProperty(hidden.libraryReveals, id);
    maps.handRevealsToAll.delete(id);
    maps.libraryRevealsToAll.delete(id);
  });

  hidden.handOrder[playerId] = [];
  hidden.libraryOrder[playerId] = [];
  hidden.sideboardOrder[playerId] = [];

  const handZone = findZoneByType(snapshot.zones, playerId, ZONE.HAND);
  if (handZone) writeZone(maps, { ...handZone, cardIds: [] });
  const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
  if (libraryZone) {
    writeZone(maps, { ...libraryZone, cardIds: [] });
    syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);
  }
  const sideboardZone = findZoneByType(snapshot.zones, playerId, ZONE.SIDEBOARD);
  if (sideboardZone) writeZone(maps, { ...sideboardZone, cardIds: [] });
  const commanderZone = findZoneByType(snapshot.zones, playerId, ZONE.COMMANDER);
  if (commanderZone) {
    const commanderCurrent = readZone(maps, commanderZone.id) ?? commanderZone;
    const nextCommanderIds = commanderCurrent.cardIds.filter((cardId) => {
      const card = readCard(maps, cardId);
      return Boolean(card && card.zoneId === commanderCurrent.id);
    });
    writeZone(maps, { ...commanderCurrent, cardIds: nextCommanderIds });
  }

  const player = readPlayer(maps, playerId);
  if (player) {
    writePlayer(maps, { ...player, deckLoaded: false, libraryTopReveal: undefined });
  }
  updatePlayerCounts(maps, hidden, playerId);
};

export const applyMulligan = (
  maps: Maps,
  hidden: HiddenState,
  playerId: string,
  count: number
): number => {
  const result = applyDeckRebuild(maps, hidden, playerId, {
    mode: "mulligan",
    drawTarget: count,
  });
  return result?.actualDrawCount ?? 0;
};
