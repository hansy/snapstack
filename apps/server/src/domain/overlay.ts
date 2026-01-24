import type { Card } from "@mtg/shared/types/cards";

import { ZONE } from "./constants";
import { toCardLite } from "./cards";
import type { HiddenState, Maps, OverlaySnapshotData, Snapshot } from "./types";
import { buildSnapshot, uniqueStrings } from "./yjsStore";
import { applyRevealToCard } from "./hiddenState";

export type OverlayZoneLookup = {
  handZoneIds: Record<string, string>;
  libraryZoneIds: Record<string, string>;
};

export const buildOverlayZoneLookup = (snapshot: Snapshot): OverlayZoneLookup => {
  const handZoneIds: Record<string, string> = {};
  const libraryZoneIds: Record<string, string> = {};
  Object.values(snapshot.zones).forEach((zone) => {
    if (zone.type === ZONE.HAND) handZoneIds[zone.ownerId] = zone.id;
    if (zone.type === ZONE.LIBRARY) libraryZoneIds[zone.ownerId] = zone.id;
  });
  return { handZoneIds, libraryZoneIds };
};

type OverlayParams = {
  hidden: HiddenState;
  viewerId?: string;
  viewerRole?: "player" | "spectator";
  libraryView?: { playerId: string; count?: number };
  zoneLookup?: OverlayZoneLookup;
} & ({ maps: Maps } | { snapshot: Snapshot; maps?: Maps });

export const buildOverlayForViewer = (params: OverlayParams): OverlaySnapshotData => {
  const snapshot = "snapshot" in params ? params.snapshot : buildSnapshot(params.maps);
  const zoneLookup = params.zoneLookup ?? buildOverlayZoneLookup(snapshot);
  const overlayCardsById = new Map<string, ReturnType<typeof toCardLite>>();
  const addOverlayCard = (card: Card) => {
    if (!overlayCardsById.has(card.id)) {
      overlayCardsById.set(card.id, toCardLite(card));
    }
  };
  const zoneCardOrders: Record<string, string[]> = {};
  const viewerRole = params.viewerRole ?? "player";
  const viewerId = params.viewerId;

  const { handZoneIds, libraryZoneIds } = zoneLookup;

  const canSeeHand = (ownerId: string) =>
    viewerRole === "spectator" || (viewerId && viewerId === ownerId);

  Object.entries(params.hidden.handOrder).forEach(([ownerId, cardIds]) => {
    const handZoneId = handZoneIds[ownerId];
    cardIds.forEach((cardId) => {
      const card = params.hidden.cards[cardId];
      if (!card) return;
      const reveal = params.hidden.handReveals[cardId];
      const allowed =
        canSeeHand(ownerId) ||
        reveal?.toAll === true ||
        (viewerId && Array.isArray(reveal?.toPlayers) && reveal?.toPlayers.includes(viewerId));
      if (!allowed) return;
      const nextCard = applyRevealToCard(card, reveal);
      addOverlayCard({
        ...nextCard,
        zoneId: handZoneId ?? nextCard.zoneId,
      });
    });
  });

  if (params.libraryView) {
    const { playerId, count } = params.libraryView;
    if (viewerRole !== "spectator" && (!viewerId || viewerId === playerId)) {
      const libraryZoneId = libraryZoneIds[playerId];
      const order = params.hidden.libraryOrder[playerId] ?? [];
      const selected =
        typeof count === "number" && count > 0 ? order.slice(-count) : order.slice();
      if (libraryZoneId) {
        zoneCardOrders[libraryZoneId] = selected;
      }
      selected.forEach((cardId) => {
        const card = params.hidden.cards[cardId];
        if (!card) return;
        const reveal = params.hidden.libraryReveals[cardId];
        const nextCard = applyRevealToCard(card, reveal);
        addOverlayCard({
          ...nextCard,
          zoneId: libraryZoneId ?? nextCard.zoneId,
        });
      });
    }
  }

  Object.entries(params.hidden.libraryOrder).forEach(([ownerId, order]) => {
    const mode = snapshot.players[ownerId]?.libraryTopReveal;
    if (!mode) return;
    const canSeeTop =
      mode === "all" || (viewerRole !== "spectator" && viewerId && viewerId === ownerId);
    if (!canSeeTop) return;
    const topCardId = order.length ? order[order.length - 1] : null;
    if (!topCardId) return;
    const card = params.hidden.cards[topCardId];
    if (!card) return;
    const baseReveal = params.hidden.libraryReveals[topCardId];
    const topReveal =
      mode === "all"
        ? { toAll: true }
        : viewerId
          ? { toPlayers: [viewerId] }
          : undefined;
    const mergedReveal = baseReveal || topReveal
      ? {
          ...(baseReveal?.toAll || topReveal?.toAll ? { toAll: true } : null),
          ...(baseReveal?.toPlayers?.length || topReveal?.toPlayers?.length
            ? {
                toPlayers: uniqueStrings([
                  ...(baseReveal?.toPlayers ?? []),
                  ...(topReveal?.toPlayers ?? []),
                ]),
              }
            : null),
        }
      : undefined;
    const nextCard = applyRevealToCard(card, mergedReveal);
    addOverlayCard({
      ...nextCard,
      zoneId: libraryZoneIds[ownerId] ?? nextCard.zoneId,
    });
  });

  Object.entries(params.hidden.libraryOrder).forEach(([ownerId, order]) => {
    if (viewerRole === "spectator") return;
    if (!viewerId || viewerId !== ownerId) return;
    const libraryZoneId = libraryZoneIds[ownerId];
    if (!libraryZoneId) return;
    if (zoneCardOrders[libraryZoneId]) return;
    const topCardId = order.length ? order[order.length - 1] : null;
    if (!topCardId) return;
    zoneCardOrders[libraryZoneId] = [topCardId];
  });

  Object.values(snapshot.cards).forEach((card) => {
    if (!card.faceDown || card.zoneId === undefined) return;
    const reveal = params.hidden.faceDownReveals[card.id];
    const canSee =
      viewerRole === "spectator" ||
      (viewerId && card.controllerId === viewerId) ||
      reveal?.toAll === true ||
      (viewerId && Array.isArray(reveal?.toPlayers) && reveal?.toPlayers.includes(viewerId));
    if (!canSee) return;
    const identity = params.hidden.faceDownBattlefield[card.id];
    if (!identity) return;
    const overlayCard = applyRevealToCard({ ...card, ...identity }, reveal);
    addOverlayCard(overlayCard);
  });

  return {
    cards: Array.from(overlayCardsById.values()),
    ...(Object.keys(zoneCardOrders).length ? { zoneCardOrders } : null),
  };
};
