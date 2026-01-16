import type * as Y from "yjs";

import type { Card } from "../../../../web/src/types/cards";
import type { Counter } from "../../../../web/src/types/counters";
import type { Player } from "../../../../web/src/types/players";
import type { Zone } from "../../../../web/src/types/zones";
import { MAX_PLAYERS } from "../../../../web/src/lib/room";

import { ZONE, isHiddenZoneType } from "../constants";
import {
  applyCardUpdates,
  buildCardIdentity,
  buildDuplicateTokenCard,
  computeDuplicateTokenPosition,
  computeTransformTargetIndex,
  decrementCounter,
  enforceZoneCounterRules,
  isTransformableCard,
  mergeCardIdentity,
  mergeCounters,
  normalizeCardForAdd,
  stripCardIdentity,
  syncCardStatsToFace,
} from "../cards";
import {
  buildLibraryOrderKey,
  buildRevealPatch,
  clearFaceDownStateForCard,
  syncLibraryRevealsToAllForPlayer,
  updatePlayerCounts,
} from "../hiddenState";
import { hasSameMembers, placeCardId, removeFromArray } from "../lists";
import { clampNumber } from "../positions";
import {
  applyRecordToMap,
  buildSnapshot,
  getMaps,
  isRecord,
  readCard,
  readPlayer,
  readRecord,
  readZone,
  resolveNextHostId,
  syncZoneOrder,
  syncPlayerOrder,
  uniqueStrings,
  writeCard,
  writePlayer,
  writeZone,
} from "../yjsStore";
import { canAddCard, canModifyCardState, canMoveCard, canRemoveToken, canTapCard, canUpdatePlayer, canViewHiddenZone } from "../permissions";
import type { ApplyResult, HiddenState, InnerApplyResult, Intent, LogEvent, Maps } from "../types";
import { applyCardMove } from "../movement";
import { applyMulligan, applyResetDeck, applyUnloadDeck } from "../deck";
import { shuffle } from "../random";
import { findZoneByType } from "../zones";

export const applyIntentToDoc = (doc: Y.Doc, intent: Intent, hidden: HiddenState): ApplyResult => {
  if (!intent || typeof intent.type !== "string") {
    return { ok: false, error: "invalid intent" };
  }
  const payload = isRecord(intent.payload) ? intent.payload : {};
  const maps = getMaps(doc);
  const logEvents: LogEvent[] = [];
  let hiddenChanged = false;
  const pushLogEvent = (eventId: string, logPayload: Record<string, unknown>) => {
    logEvents.push({ eventId, payload: logPayload });
  };
  const markHiddenChanged = () => {
    hiddenChanged = true;
  };
  const readActorId = (value: unknown) => (typeof value === "string" ? value : undefined);
  const actorId = readActorId(payload.actorId);
  const prepareCardAdd = (
    raw: unknown
  ): { card: Card; zoneId: string } | { error: string } => {
    if (!actorId) return { error: "missing actor" };
    const card = isRecord(raw) ? (raw as Card) : null;
    if (!card || typeof card.id !== "string") return { error: "invalid card" };
    const normalized = normalizeCardForAdd(card);
    const zone = readZone(maps, normalized.zoneId);
    if (!zone) return { error: "zone not found" };
    const permission = canAddCard(actorId, normalized, zone);
    if (!permission.allowed) {
      return { error: permission.reason ?? "not permitted" };
    }
    return { card: normalized, zoneId: zone.id };
  };
  const applyPreparedCardAdd = (
    prepared: { card: Card; zoneId: string }
  ): InnerApplyResult => {
    if (!actorId) return { ok: false, error: "missing actor" };
    const zone = readZone(maps, prepared.zoneId);
    if (!zone) return { ok: false, error: "zone not found" };
    const nextCounters = enforceZoneCounterRules(prepared.card.counters, zone ?? undefined);
    const nextCard = { ...prepared.card, counters: nextCounters };
    if (zone && isHiddenZoneType(zone.type)) {
      hidden.cards[nextCard.id] = nextCard;
      if (zone.type === ZONE.HAND) {
        const nextOrder = placeCardId(hidden.handOrder[zone.ownerId] ?? [], nextCard.id, "top");
        hidden.handOrder[zone.ownerId] = nextOrder;
        writeZone(maps, { ...zone, cardIds: nextOrder });
      } else if (zone.type === ZONE.LIBRARY) {
        hidden.libraryOrder[zone.ownerId] = placeCardId(
          hidden.libraryOrder[zone.ownerId] ?? [],
          nextCard.id,
          "top"
        );
      } else if (zone.type === ZONE.SIDEBOARD) {
        hidden.sideboardOrder[zone.ownerId] = placeCardId(
          hidden.sideboardOrder[zone.ownerId] ?? [],
          nextCard.id,
          "top"
        );
      }
      updatePlayerCounts(maps, hidden, zone.ownerId);
      markHiddenChanged();
      return { ok: true };
    }
    const enteringFaceDownBattlefield = zone?.type === ZONE.BATTLEFIELD && nextCard.faceDown;
    const publicCard = enteringFaceDownBattlefield
      ? stripCardIdentity({
          ...nextCard,
          knownToAll: false,
          revealedToAll: false,
          revealedTo: [],
        })
      : nextCard;
    writeCard(maps, publicCard);
    if (zone) {
      const nextIds = placeCardId(zone.cardIds, nextCard.id, "top");
      writeZone(maps, { ...zone, cardIds: nextIds });
    }
    if (enteringFaceDownBattlefield) {
      hidden.faceDownBattlefield[nextCard.id] = buildCardIdentity(nextCard);
      hidden.faceDownReveals[nextCard.id] = {};
      maps.faceDownRevealsToAll.delete(nextCard.id);
      markHiddenChanged();
    }
    if (nextCard.isToken) {
      pushLogEvent("card.tokenCreate", {
        actorId,
        playerId: nextCard.ownerId,
        tokenName: nextCard.name ?? "Token",
        count: 1,
      });
    }
    return { ok: true };
  };

  const apply = (): InnerApplyResult => {
    if (!actorId) return { ok: false, error: "missing actor" };
    switch (intent.type) {
      case "player.join": {
        const player = isRecord(payload.player) ? (payload.player as Player) : null;
        if (!player || typeof player.id !== "string") {
          return { ok: false, error: "invalid player" };
        }
        if (player.id !== actorId) {
          return { ok: false, error: "actor mismatch" };
        }

        const existing = readPlayer(maps, player.id);
        if (!existing) {
          const locked = Boolean(maps.meta.get("locked"));
          if (locked) return { ok: false, error: "room locked" };
          if (maps.players.size >= MAX_PLAYERS) {
            return { ok: false, error: "room full" };
          }
          writePlayer(maps, player);
        }

        let initializedHidden = false;
        if (!hidden.handOrder[player.id]) {
          hidden.handOrder[player.id] = [];
          initializedHidden = true;
        }
        if (!hidden.libraryOrder[player.id]) {
          hidden.libraryOrder[player.id] = [];
          initializedHidden = true;
        }
        if (!hidden.sideboardOrder[player.id]) {
          hidden.sideboardOrder[player.id] = [];
          initializedHidden = true;
        }
        if (initializedHidden) {
          updatePlayerCounts(maps, hidden, player.id);
          markHiddenChanged();
        }
        const currentHost = maps.meta.get("hostId");
        if (typeof currentHost !== "string" || !maps.players.get(currentHost)) {
          maps.meta.set("hostId", player.id);
        }
        return { ok: true };
      }
      case "player.update": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const updates = isRecord(payload.updates) ? payload.updates : null;
        if (!playerId || !updates) return { ok: false, error: "invalid player update" };
        const current = readPlayer(maps, playerId);
        if (!current) return { ok: false, error: "player not found" };
        const permission = canUpdatePlayer(actorId, current, updates);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        if (typeof updates.life === "number" && updates.life !== current.life) {
          const from = typeof current.life === "number" ? current.life : 0;
          const to = updates.life;
          pushLogEvent("player.life", {
            actorId,
            playerId,
            from,
            to,
            delta: to - from,
          });
        }
        if (
          Object.prototype.hasOwnProperty.call(updates, "libraryTopReveal") &&
          updates.libraryTopReveal !== current.libraryTopReveal
        ) {
          const enabled = Boolean(updates.libraryTopReveal);
          const mode = enabled ? updates.libraryTopReveal : current.libraryTopReveal;
          if (typeof mode === "string") {
            pushLogEvent("library.topReveal", {
              actorId,
              playerId,
              enabled,
              mode,
            });
          }
          writePlayer(maps, { ...current, ...updates, id: playerId });
          syncLibraryRevealsToAllForPlayer(maps, hidden, playerId);
          markHiddenChanged();
          return { ok: true };
        }
        writePlayer(maps, { ...current, ...updates, id: playerId });
        return { ok: true };
      }
      case "player.leave": {
        const requestedPlayerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const playerId = requestedPlayerId && requestedPlayerId === actorId ? requestedPlayerId : actorId;
        if (!playerId) return { ok: false, error: "invalid player" };

        const snapshot = buildSnapshot(maps);
        const nextPlayers = { ...snapshot.players };
        delete nextPlayers[playerId];

        const nextOrder = snapshot.playerOrder.filter((id) => id !== playerId);

        const nextZones: Record<string, Zone> = {};
        Object.values(snapshot.zones).forEach((zone) => {
          if (zone.ownerId === playerId) return;
          nextZones[zone.id] = { ...zone };
        });

        const nextCards: Record<string, Card> = {};
        Object.values(snapshot.cards).forEach((card) => {
          if (card.ownerId === playerId) return;
          const zone = nextZones[card.zoneId];
          if (!zone) return;
          nextCards[card.id] = { ...card };
        });

        Object.values(nextZones).forEach((zone) => {
          zone.cardIds = zone.cardIds.filter((id) => nextCards[id]);
        });

        const nextMeta = { ...snapshot.meta };
        const hostId = typeof nextMeta.hostId === "string" ? (nextMeta.hostId as string) : null;
        if (!hostId || hostId === playerId || !nextPlayers[hostId]) {
          nextMeta.hostId = resolveNextHostId(nextPlayers, nextOrder);
        }

        applyRecordToMap(maps.players, nextPlayers as Record<string, unknown>);
        applyRecordToMap(maps.cards, nextCards as Record<string, unknown>);
        applyRecordToMap(maps.zones, nextZones as Record<string, unknown>);
        applyRecordToMap(maps.meta, nextMeta);
        syncPlayerOrder(maps.playerOrder, nextOrder);
        maps.battlefieldViewScale.delete(playerId);

        Object.values(nextZones).forEach((zone) => {
          syncZoneOrder(maps, zone.id, zone.cardIds);
        });

        maps.zoneCardOrders.forEach((_value, key) => {
          const zoneId = String(key);
          if (!nextZones[zoneId]) maps.zoneCardOrders.delete(zoneId);
        });

        const hiddenRemoveIds = Object.values(hidden.cards)
          .filter((card) => card.ownerId === playerId)
          .map((card) => card.id);
        hiddenRemoveIds.forEach((id) => {
          Reflect.deleteProperty(hidden.cards, id);
          Reflect.deleteProperty(hidden.handReveals, id);
          Reflect.deleteProperty(hidden.libraryReveals, id);
          maps.handRevealsToAll.delete(id);
          maps.libraryRevealsToAll.delete(id);
        });
        Reflect.deleteProperty(hidden.handOrder, playerId);
        Reflect.deleteProperty(hidden.libraryOrder, playerId);
        Reflect.deleteProperty(hidden.sideboardOrder, playerId);
        Object.keys(hidden.faceDownBattlefield).forEach((id) => {
          if (!maps.cards.get(id)) {
            Reflect.deleteProperty(hidden.faceDownBattlefield, id);
            Reflect.deleteProperty(hidden.faceDownReveals, id);
            maps.faceDownRevealsToAll.delete(id);
          }
        });
        markHiddenChanged();
        return { ok: true };
      }
      case "zone.add": {
        const zone = isRecord(payload.zone) ? (payload.zone as Zone) : null;
        if (!zone || typeof zone.id !== "string") return { ok: false, error: "invalid zone" };
        const existing = readZone(maps, zone.id);
        if (existing) {
          if (existing.ownerId !== zone.ownerId || existing.type !== zone.type) {
            return { ok: false, error: "zone mismatch" };
          }
          if (existing.ownerId !== actorId) {
            return { ok: false, error: "Only zone owner may add zones" };
          }
          return { ok: true };
        }
        if (zone.ownerId !== actorId) {
          return { ok: false, error: "Only zone owner may add zones" };
        }
        const nextCardIds = uniqueStrings(zone.cardIds ?? []);
        const normalized = {
          ...zone,
          cardIds:
            zone.type === ZONE.HAND ? nextCardIds : isHiddenZoneType(zone.type) ? [] : nextCardIds,
        } as Zone;
        writeZone(maps, normalized);
        if (isHiddenZoneType(zone.type)) {
          if (zone.type === ZONE.HAND && !hidden.handOrder[zone.ownerId]) {
            hidden.handOrder[zone.ownerId] = normalized.cardIds;
          }
          if (zone.type === ZONE.LIBRARY && !hidden.libraryOrder[zone.ownerId]) {
            hidden.libraryOrder[zone.ownerId] = [];
          }
          if (zone.type === ZONE.SIDEBOARD && !hidden.sideboardOrder[zone.ownerId]) {
            hidden.sideboardOrder[zone.ownerId] = [];
          }
          updatePlayerCounts(maps, hidden, zone.ownerId);
          markHiddenChanged();
        }
        return { ok: true };
      }
      case "zone.reorder": {
        const zoneId = typeof payload.zoneId === "string" ? payload.zoneId : null;
        const orderedCardIds = Array.isArray(payload.orderedCardIds)
          ? uniqueStrings(payload.orderedCardIds as unknown[])
          : null;
        if (!zoneId || !orderedCardIds) return { ok: false, error: "invalid reorder" };
        const zone = readZone(maps, zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        if (zone.ownerId !== actorId) {
          return { ok: false, error: "Only zone owner may reorder cards" };
        }
        const currentOrder = isHiddenZoneType(zone.type)
          ? zone.type === ZONE.HAND
            ? hidden.handOrder[zone.ownerId] ?? []
            : zone.type === ZONE.LIBRARY
              ? hidden.libraryOrder[zone.ownerId] ?? []
              : hidden.sideboardOrder[zone.ownerId] ?? []
          : zone.cardIds;
        if (!hasSameMembers(currentOrder, orderedCardIds)) {
          return { ok: false, error: "invalid reorder" };
        }
        if (zone.type === ZONE.HAND) {
          hidden.handOrder[zone.ownerId] = orderedCardIds;
          writeZone(maps, { ...zone, cardIds: orderedCardIds });
          updatePlayerCounts(maps, hidden, zone.ownerId);
          markHiddenChanged();
          return { ok: true };
        }
        if (zone.type === ZONE.LIBRARY) {
          hidden.libraryOrder[zone.ownerId] = orderedCardIds;
          updatePlayerCounts(maps, hidden, zone.ownerId);
          syncLibraryRevealsToAllForPlayer(maps, hidden, zone.ownerId, zone.id);
          markHiddenChanged();
          return { ok: true };
        }
        if (zone.type === ZONE.SIDEBOARD) {
          hidden.sideboardOrder[zone.ownerId] = orderedCardIds;
          updatePlayerCounts(maps, hidden, zone.ownerId);
          markHiddenChanged();
          return { ok: true };
        }
        writeZone(maps, { ...zone, cardIds: orderedCardIds });
        return { ok: true };
      }
      case "room.lock": {
        const locked = Boolean(payload.locked);
        const hostId = maps.meta.get("hostId");
        if (typeof hostId === "string" && hostId !== actorId) {
          return { ok: false, error: "Only host may lock the room" };
        }
        maps.meta.set("locked", locked);
        return { ok: true };
      }
      case "ui.battlefieldScale.set": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const scaleRaw = typeof payload.scale === "number" ? payload.scale : null;
        if (!playerId || scaleRaw === null) return { ok: false, error: "invalid scale" };
        if (playerId !== actorId) {
          return { ok: false, error: "actor mismatch" };
        }
        maps.battlefieldViewScale.set(playerId, clampNumber(scaleRaw, 0.5, 1));
        return { ok: true };
      }
      case "counter.global.add": {
        const counterType = typeof payload.counterType === "string" ? payload.counterType : null;
        const color = typeof payload.color === "string" ? payload.color : null;
        if (!counterType || !color) return { ok: false, error: "invalid counter" };
        if (!maps.globalCounters.get(counterType)) {
          maps.globalCounters.set(counterType, color);
        }
        return { ok: true };
      }
      case "card.counter.adjust": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        if (!cardId) return { ok: false, error: "invalid card" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        const permission = canModifyCardState(actorId, card, zone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }

        if (isRecord(payload.counter) && typeof payload.counter.type === "string") {
          const counter: Counter = {
            type: payload.counter.type,
            count:
              typeof payload.counter.count === "number" && Number.isFinite(payload.counter.count)
                ? Math.floor(payload.counter.count)
                : 0,
            ...(typeof payload.counter.color === "string"
              ? { color: payload.counter.color }
              : null),
          };
          const nextCounters = mergeCounters(card.counters, counter);
          const prevCount =
            card.counters.find((entry) => entry.type === counter.type)?.count ?? 0;
          const nextCount =
            nextCounters.find((entry) => entry.type === counter.type)?.count ?? prevCount;
          const delta = nextCount - prevCount;
          if (delta > 0) {
            pushLogEvent("counter.add", {
              actorId,
              cardId,
              zoneId: card.zoneId,
              counterType: counter.type,
              delta,
              newTotal: nextCount,
              cardName: card.name,
            });
          }
          writeCard(maps, { ...card, counters: nextCounters });
          return { ok: true };
        }

        const counterType = typeof payload.counterType === "string" ? payload.counterType : null;
        const delta = typeof payload.delta === "number" ? payload.delta : -1;
        if (!counterType) return { ok: false, error: "invalid counter update" };
        const nextCounters = decrementCounter(card.counters, counterType, delta);
        const prevCount = card.counters.find((entry) => entry.type === counterType)?.count ?? 0;
        const nextCount = nextCounters.find((entry) => entry.type === counterType)?.count ?? 0;
        const appliedDelta = nextCount - prevCount;
        if (appliedDelta !== 0) {
          pushLogEvent(appliedDelta > 0 ? "counter.add" : "counter.remove", {
            actorId,
            cardId,
            zoneId: card.zoneId,
            counterType,
            delta: appliedDelta,
            newTotal: nextCount,
            cardName: card.name,
          });
        }
        writeCard(maps, { ...card, counters: nextCounters });
        return { ok: true };
      }
      case "card.tap": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const tapped = typeof payload.tapped === "boolean" ? payload.tapped : null;
        if (!cardId || tapped === null) return { ok: false, error: "invalid tap" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        const permission = canTapCard(actorId, card, zone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        pushLogEvent("card.tap", {
          actorId,
          cardId,
          zoneId: card.zoneId,
          tapped,
          cardName: card.name,
        });
        writeCard(maps, { ...card, tapped });
        return { ok: true };
      }
      case "card.untapAll": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        if (playerId !== actorId) {
          return { ok: false, error: "actor mismatch" };
        }
        pushLogEvent("card.untapAll", {
          actorId,
          playerId,
        });
        maps.cards.forEach((value, key) => {
          const raw = readRecord(value);
          if (!raw) return;
          const card = raw as Card;
          if (card.controllerId === playerId && card.tapped) {
            maps.cards.set(String(key), { ...card, tapped: false });
          }
        });
        return { ok: true };
      }
      case "card.add": {
        const prepared = prepareCardAdd(payload.card);
        if ("error" in prepared) return { ok: false, error: prepared.error };
        return applyPreparedCardAdd(prepared);
      }
      case "card.add.batch": {
        const cards = Array.isArray(payload.cards) ? payload.cards : null;
        if (!cards || cards.length === 0) return { ok: false, error: "invalid cards" };
        const prepared: { card: Card; zoneId: string }[] = [];
        for (const raw of cards) {
          const next = prepareCardAdd(raw);
          if ("error" in next) return { ok: false, error: next.error };
          prepared.push(next);
        }
        for (const entry of prepared) {
          const result = applyPreparedCardAdd(entry);
          if (!result.ok) return result;
        }
        return { ok: true };
      }
      case "card.remove": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        if (!cardId) return { ok: false, error: "invalid card" };
        const card = readCard(maps, cardId);
        if (card) {
          const zone = readZone(maps, card.zoneId);
          if (!zone) return { ok: false, error: "zone not found" };
          const permission = canRemoveToken(actorId, card, zone);
          if (!permission.allowed) {
            return { ok: false, error: permission.reason ?? "not permitted" };
          }
          if (zone) {
            const nextIds = removeFromArray(zone.cardIds, cardId);
            writeZone(maps, { ...zone, cardIds: nextIds });
          }
          pushLogEvent("card.remove", {
            actorId,
            cardId,
            zoneId: card.zoneId,
            cardName: card.name,
          });
          maps.cards.delete(cardId);
          const hadFaceDown =
            Boolean(hidden.faceDownBattlefield[cardId]) || Boolean(hidden.faceDownReveals[cardId]);
          clearFaceDownStateForCard(maps, hidden, cardId);
          if (hadFaceDown) markHiddenChanged();
          return { ok: true };
        }
        const hiddenCard = hidden.cards[cardId];
        if (!hiddenCard) return { ok: false, error: "card not found" };
        const hiddenZone = readZone(maps, hiddenCard.zoneId);
        if (!hiddenZone) return { ok: false, error: "zone not found" };
        const hiddenPermission = canRemoveToken(actorId, hiddenCard, hiddenZone);
        if (!hiddenPermission.allowed) {
          return { ok: false, error: hiddenPermission.reason ?? "not permitted" };
        }
        if (hiddenZone.type === ZONE.HAND) {
          const nextOrder = removeFromArray(hidden.handOrder[hiddenZone.ownerId] ?? [], cardId);
          hidden.handOrder[hiddenZone.ownerId] = nextOrder;
          writeZone(maps, { ...hiddenZone, cardIds: nextOrder });
        } else if (hiddenZone.type === ZONE.LIBRARY) {
          hidden.libraryOrder[hiddenZone.ownerId] = removeFromArray(
            hidden.libraryOrder[hiddenZone.ownerId] ?? [],
            cardId
          );
          syncLibraryRevealsToAllForPlayer(maps, hidden, hiddenZone.ownerId, hiddenZone.id);
        } else if (hiddenZone.type === ZONE.SIDEBOARD) {
          hidden.sideboardOrder[hiddenZone.ownerId] = removeFromArray(
            hidden.sideboardOrder[hiddenZone.ownerId] ?? [],
            cardId
          );
        }
        Reflect.deleteProperty(hidden.cards, cardId);
        Reflect.deleteProperty(hidden.handReveals, cardId);
        Reflect.deleteProperty(hidden.libraryReveals, cardId);
        maps.handRevealsToAll.delete(cardId);
        maps.libraryRevealsToAll.delete(cardId);
        updatePlayerCounts(maps, hidden, hiddenCard.ownerId);
        pushLogEvent("card.remove", {
          actorId,
          cardId,
          zoneId: hiddenCard.zoneId,
          cardName: "a card",
        });
        markHiddenChanged();
        return { ok: true };
      }
      case "card.update": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const updates = isRecord(payload.updates) ? payload.updates : null;
        if (!cardId || !updates) return { ok: false, error: "invalid update" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };

        const forbiddenKeys = [
          "name",
          "imageUrl",
          "oracleText",
          "typeLine",
          "scryfallId",
          "scryfall",
          "deckSection",
          "zoneId",
          "position",
          "counters",
          "ownerId",
          "controllerId",
          "id",
          "tapped",
          "knownToAll",
          "revealedToAll",
          "revealedTo",
          "isToken",
        ];
        for (const key of forbiddenKeys) {
          if (Object.prototype.hasOwnProperty.call(updates, key)) {
            return { ok: false, error: "unsupported update" };
          }
        }

        if (Object.prototype.hasOwnProperty.call(updates, "isCommander")) {
          if (card.ownerId !== actorId) {
            return { ok: false, error: "Only owner may update commander status" };
          }
        }
        if (Object.prototype.hasOwnProperty.call(updates, "commanderTax")) {
          if (card.ownerId !== actorId) {
            return { ok: false, error: "Only owner may update commander tax" };
          }
        }

        const controlledFields = [
          "power",
          "toughness",
          "basePower",
          "baseToughness",
          "customText",
          "faceDown",
          "faceDownMode",
          "currentFaceIndex",
          "rotation",
        ];
        const requiresControl = controlledFields.some((key) =>
          Object.prototype.hasOwnProperty.call(updates, key)
        );
        if (requiresControl) {
          const permission = canModifyCardState(actorId, card, zone);
          if (!permission.allowed) {
            return { ok: false, error: permission.reason ?? "not permitted" };
          }
        }
        const nextCard = applyCardUpdates(card, updates, zone?.type);
        let publicCard = nextCard;
        if (zone?.type === ZONE.BATTLEFIELD) {
          if (!card.faceDown && nextCard.faceDown) {
            hidden.faceDownBattlefield[card.id] = buildCardIdentity(nextCard);
            hidden.faceDownReveals[card.id] = {};
            maps.faceDownRevealsToAll.delete(card.id);
            markHiddenChanged();
            publicCard = stripCardIdentity({
              ...nextCard,
              knownToAll: false,
              revealedToAll: false,
              revealedTo: [],
            });
          } else if (card.faceDown && !nextCard.faceDown) {
            const identity = hidden.faceDownBattlefield[card.id];
            Reflect.deleteProperty(hidden.faceDownBattlefield, card.id);
            Reflect.deleteProperty(hidden.faceDownReveals, card.id);
            maps.faceDownRevealsToAll.delete(card.id);
            markHiddenChanged();
            publicCard = mergeCardIdentity(nextCard, identity);
          } else if (nextCard.faceDown) {
            publicCard = stripCardIdentity(nextCard);
          }
        }
        const newPower = (updates as Record<string, unknown>).power ?? card.power;
        const newToughness = (updates as Record<string, unknown>).toughness ?? card.toughness;
        const powerChanged = newPower !== card.power;
        const toughnessChanged = newToughness !== card.toughness;
        if (
          (powerChanged || toughnessChanged) &&
          (newPower !== undefined || newToughness !== undefined)
        ) {
          pushLogEvent("card.pt", {
            actorId,
            cardId,
            zoneId: card.zoneId,
            fromPower: card.power,
            fromToughness: card.toughness,
            toPower: newPower ?? card.power,
            toToughness: newToughness ?? card.toughness,
            cardName: card.name,
          });
        }
        const commanderTaxBefore = card.commanderTax ?? 0;
        const commanderTaxAfter = nextCard.commanderTax ?? 0;
        if (commanderTaxBefore !== commanderTaxAfter) {
          pushLogEvent("player.commanderTax", {
            actorId,
            playerId: card.ownerId,
            cardId: card.id,
            zoneId: card.zoneId,
            cardName: card.name,
            from: commanderTaxBefore,
            to: commanderTaxAfter,
            delta: commanderTaxAfter - commanderTaxBefore,
          });
        }
        writeCard(maps, publicCard);
        return { ok: true };
      }
      case "card.transform": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const faceIndex = typeof payload.targetIndex === "number" ? payload.targetIndex : undefined;
        if (!cardId) return { ok: false, error: "invalid card" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        const permission = canModifyCardState(actorId, card, zone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        if (!isTransformableCard(card)) return { ok: true };
        const { targetIndex, toFaceName } = computeTransformTargetIndex(card, faceIndex);
        pushLogEvent("card.transform", {
          actorId,
          cardId,
          zoneId: card.zoneId,
          toFaceName,
          cardName: card.name,
        });
        const cardForTransform = card.faceDown
          ? mergeCardIdentity(card, hidden.faceDownBattlefield[card.id])
          : card;
        const nextCard = syncCardStatsToFace(cardForTransform, targetIndex);
        if (card.faceDown) {
          hidden.faceDownBattlefield[card.id] = buildCardIdentity(nextCard);
          markHiddenChanged();
          writeCard(maps, stripCardIdentity(nextCard));
        } else {
          writeCard(maps, nextCard);
        }
        return { ok: true };
      }
      case "card.reveal.set": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        if (!cardId) return { ok: false, error: "invalid card" };
        const hiddenCard = hidden.cards[cardId];
        if (!hiddenCard) return { ok: false, error: "card not found" };
        if (hiddenCard.ownerId !== actorId) {
          return { ok: false, error: "Only owner may reveal this card" };
        }
        const zone = readZone(maps, hiddenCard.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        if (zone.type !== ZONE.HAND && zone.type !== ZONE.LIBRARY) {
          return { ok: true };
        }
        const reveal =
          isRecord(payload.reveal) || payload.reveal === null
            ? (payload.reveal as { toAll?: boolean; to?: string[] } | null)
            : null;
        const patch = buildRevealPatch(hiddenCard, reveal);
        if (!reveal) {
          if (zone.type === ZONE.HAND) {
            Reflect.deleteProperty(hidden.handReveals, cardId);
            maps.handRevealsToAll.delete(cardId);
          } else if (zone.type === ZONE.LIBRARY) {
            Reflect.deleteProperty(hidden.libraryReveals, cardId);
            maps.libraryRevealsToAll.delete(cardId);
            syncLibraryRevealsToAllForPlayer(maps, hidden, zone.ownerId, zone.id);
          }
          markHiddenChanged();
          return { ok: true };
        }
        const toPlayers = patch.revealedTo ?? [];
        const revealState = {
          ...(patch.revealedToAll ? { toAll: true } : null),
          ...(toPlayers.length ? { toPlayers } : null),
        };
        if (zone.type === ZONE.HAND) {
          hidden.handReveals[cardId] = revealState;
          if (patch.revealedToAll) {
            maps.handRevealsToAll.set(cardId, buildCardIdentity(hiddenCard));
          } else {
            maps.handRevealsToAll.delete(cardId);
          }
        } else if (zone.type === ZONE.LIBRARY) {
          hidden.libraryReveals[cardId] = revealState;
          if (patch.revealedToAll) {
            const order = hidden.libraryOrder[zone.ownerId] ?? [];
            const index = order.indexOf(cardId);
            maps.libraryRevealsToAll.set(cardId, {
              card: buildCardIdentity(hiddenCard),
              orderKey: buildLibraryOrderKey(index >= 0 ? index : order.length),
              ownerId: hiddenCard.ownerId,
            });
          } else {
            maps.libraryRevealsToAll.delete(cardId);
          }
          syncLibraryRevealsToAllForPlayer(maps, hidden, zone.ownerId, zone.id);
        }
        markHiddenChanged();
        return { ok: true };
      }
      case "card.duplicate": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const newCardId = typeof payload.newCardId === "string" ? payload.newCardId : null;
        if (!cardId || !newCardId) return { ok: false, error: "invalid duplicate" };
        const card = readCard(maps, cardId);
        if (!card) return { ok: false, error: "card not found" };
        const zone = readZone(maps, card.zoneId);
        if (!zone) return { ok: false, error: "zone not found" };
        const permission = canModifyCardState(actorId, card, zone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const snapshot = buildSnapshot(maps);
        const position = computeDuplicateTokenPosition({
          sourceCard: card,
          orderedCardIds: zone.cardIds,
          cardsById: snapshot.cards,
        });
        const clone = buildDuplicateTokenCard({ sourceCard: card, newCardId, position });
        writeCard(maps, clone);
        const nextIds = placeCardId(zone.cardIds, clone.id, "top");
        writeZone(maps, { ...zone, cardIds: nextIds });
        pushLogEvent("card.duplicate", {
          actorId,
          sourceCardId: cardId,
          newCardId,
          zoneId: zone.id,
          cardName: card.name,
        });
        return { ok: true };
      }
      case "card.move": {
        const cardId = typeof payload.cardId === "string" ? payload.cardId : null;
        const toZoneId = typeof payload.toZoneId === "string" ? payload.toZoneId : null;
        if (!cardId || !toZoneId) return { ok: false, error: "invalid move" };
        const toZone = readZone(maps, toZoneId);
        if (!toZone) return { ok: false, error: "zone not found" };
        const publicCard = readCard(maps, cardId);
        const hiddenCard = !publicCard ? hidden.cards[cardId] : null;
        const card = publicCard ?? hiddenCard;
        if (!card) return { ok: false, error: "card not found" };
        const fromZone = readZone(maps, card.zoneId);
        if (!fromZone) return { ok: false, error: "zone not found" };
        const permission = canMoveCard(actorId, card, fromZone, toZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const placement =
          typeof payload.placement === "string" && (payload.placement === "bottom" || payload.placement === "top")
            ? payload.placement
            : "top";
        return applyCardMove(maps, hidden, payload, placement, pushLogEvent, markHiddenChanged);
      }
      case "library.draw": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const count = typeof payload.count === "number" ? payload.count : 1;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        const handZone = findZoneByType(snapshot.zones, playerId, ZONE.HAND);
        if (!libraryZone || !handZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const drawCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
        for (let i = 0; i < drawCount; i += 1) {
          const order = hidden.libraryOrder[playerId] ?? [];
          const cardId = order.length ? order[order.length - 1] : null;
          if (!cardId) break;
          const result = applyCardMove(
            maps,
            hidden,
            { cardId, toZoneId: handZone.id, actorId: payload.actorId, opts: { suppressLog: true } },
            "top",
            pushLogEvent,
            markHiddenChanged
          );
          if (!result.ok) return result;
        }
        syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);
        return { ok: true };
      }
      case "library.discard": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const count = typeof payload.count === "number" ? payload.count : 1;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        const graveyardZone = findZoneByType(snapshot.zones, playerId, ZONE.GRAVEYARD);
        if (!libraryZone || !graveyardZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const discardCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
        for (let i = 0; i < discardCount; i += 1) {
          const order = hidden.libraryOrder[playerId] ?? [];
          const cardId = order.length ? order[order.length - 1] : null;
          if (!cardId) break;
          const result = applyCardMove(
            maps,
            hidden,
            { cardId, toZoneId: graveyardZone.id, actorId: payload.actorId, opts: { suppressLog: true } },
            "top",
            pushLogEvent,
            markHiddenChanged
          );
          if (!result.ok) return result;
        }
        syncLibraryRevealsToAllForPlayer(maps, hidden, playerId, libraryZone.id);
        return { ok: true };
      }
      case "library.shuffle": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const current = hidden.libraryOrder[playerId] ?? [];
        const shuffled = shuffle(current);
        hidden.libraryOrder[playerId] = shuffled;
        shuffled.forEach((id) => {
          const card = hidden.cards[id];
          if (card) {
            hidden.cards[id] = { ...card, knownToAll: false };
          }
          Reflect.deleteProperty(hidden.libraryReveals, id);
          maps.libraryRevealsToAll.delete(id);
        });
        updatePlayerCounts(maps, hidden, playerId);
        syncLibraryRevealsToAllForPlayer(maps, hidden, playerId);
        markHiddenChanged();
        pushLogEvent("library.shuffle", {
          actorId,
          playerId,
        });
        return { ok: true };
      }
      case "deck.reset": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        applyResetDeck(maps, hidden, playerId);
        markHiddenChanged();
        pushLogEvent("deck.reset", {
          actorId,
          playerId,
        });
        return { ok: true };
      }
      case "deck.unload": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        applyUnloadDeck(maps, hidden, playerId);
        markHiddenChanged();
        pushLogEvent("deck.unload", {
          actorId,
          playerId,
        });
        return { ok: true };
      }
      case "deck.mulligan": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        const count = typeof payload.count === "number" ? payload.count : 0;
        if (!playerId) return { ok: false, error: "invalid player" };
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        const mulliganDrawCount = applyMulligan(maps, hidden, playerId, count);
        markHiddenChanged();
        pushLogEvent("deck.reset", {
          actorId,
          playerId,
        });
        if (mulliganDrawCount > 0) {
          pushLogEvent("card.draw", {
            actorId,
            playerId,
            count: mulliganDrawCount,
          });
        }
        return { ok: true };
      }
      case "deck.load": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        if (playerId !== actorId) {
          return { ok: false, error: "actor mismatch" };
        }
        const player = readPlayer(maps, playerId);
        if (!player) return { ok: true };
        writePlayer(maps, { ...player, deckLoaded: true });
        return { ok: true };
      }
      case "library.view": {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : null;
        if (!playerId) return { ok: false, error: "invalid player" };
        const count = typeof payload.count === "number" ? payload.count : undefined;
        const snapshot = buildSnapshot(maps);
        const libraryZone = findZoneByType(snapshot.zones, playerId, ZONE.LIBRARY);
        if (!libraryZone) return { ok: false, error: "zone not found" };
        const permission = canViewHiddenZone(actorId, libraryZone);
        if (!permission.allowed) {
          return { ok: false, error: permission.reason ?? "not permitted" };
        }
        pushLogEvent("library.view", {
          actorId,
          playerId,
          ...(count !== undefined ? { count } : {}),
        });
        return { ok: true };
      }
      case "coin.flip": {
        const count = typeof payload.count === "number" ? payload.count : null;
        const results = Array.isArray(payload.results)
          ? payload.results.filter((value) => value === "heads" || value === "tails")
          : null;
        const safeCount = typeof count === "number" && Number.isFinite(count) ? Math.floor(count) : 0;
        if (!safeCount || !results || results.length === 0) {
          return { ok: false, error: "invalid coin flip" };
        }
        pushLogEvent("coin.flip", {
          actorId,
          count: safeCount,
          results,
        });
        return { ok: true };
      }
      case "dice.roll": {
        const sides = typeof payload.sides === "number" ? payload.sides : null;
        const count = typeof payload.count === "number" ? payload.count : null;
        const results = Array.isArray(payload.results)
          ? payload.results.filter((value) => typeof value === "number")
          : null;
        if (!sides || !count || !results) return { ok: false, error: "invalid dice roll" };
        pushLogEvent("dice.roll", {
          actorId,
          sides,
          count,
          results,
        });
        return { ok: true };
      }
      default:
        break;
    }
    return { ok: false, error: `unhandled intent: ${intent.type}` };
  };

  try {
    let result: InnerApplyResult = { ok: false, error: "unknown" };
    doc.transact(() => {
      result = apply();
    });
    if (result.ok) {
      return { ok: true, logEvents, ...(hiddenChanged ? { hiddenChanged: true } : null) };
    }
    return result;
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "intent failed" };
  }
};
