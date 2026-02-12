import type { Card, PlayerId, Zone, ZoneId } from "@/types";
import { MAX_COMMANDER_ZONE_CARDS } from "@mtg/shared/constants/limits";

import { ZONE } from "@/constants/zones";
import { getZoneByType } from "@/lib/gameSelectors";
import { getRequestedCounts, type FetchScryfallResult, type ParsedCard } from "@/services/deck-import/deckImport";

export interface ProviderLike {
  wsconnected?: boolean;
  synced?: boolean;
}

export const isMultiplayerProviderReady = (params: {
  handles: unknown;
  provider: ProviderLike | null;
}): boolean => {
  return Boolean(
    params.handles && params.provider && (params.provider.wsconnected || params.provider.synced)
  );
};

export const resolveDeckZoneIds = (params: {
  zones: Record<ZoneId, Zone>;
  playerId: PlayerId;
}): { libraryZoneId: ZoneId; commanderZoneId: ZoneId; sideboardZoneId: ZoneId } => {
  const libraryZone = getZoneByType(params.zones, params.playerId, ZONE.LIBRARY);
  const commanderZone = getZoneByType(params.zones, params.playerId, ZONE.COMMANDER);
  const sideboardZone = getZoneByType(params.zones, params.playerId, ZONE.SIDEBOARD);

  return {
    libraryZoneId: (libraryZone?.id ?? `${params.playerId}-${ZONE.LIBRARY}`) as ZoneId,
    commanderZoneId: (commanderZone?.id ?? `${params.playerId}-${ZONE.COMMANDER}`) as ZoneId,
    sideboardZoneId: (sideboardZone?.id ?? `${params.playerId}-${ZONE.SIDEBOARD}`) as ZoneId,
  };
};

export const chunkArray = <T,>(items: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0) return [items];
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

export type DeckImportCardData = Partial<Card> & {
  deckSection?: "main" | "commander" | "sideboard";
  section?: string;
};

export type DeckImportCardPlan = {
  cardData: DeckImportCardData;
  zoneId: ZoneId;
  zoneType: Zone["type"];
};

const countLiveZoneCards = (params: {
  zoneId: ZoneId;
  zone: Zone;
  cards?: Record<string, Card>;
}) => {
  if (!params.cards) return params.zone.cardIds.length;
  return params.zone.cardIds.reduce((count, cardId) => {
    const card = params.cards?.[cardId];
    return card && card.zoneId === params.zoneId ? count + 1 : count;
  }, 0);
};

export const planDeckImport = async (params: {
  importText: string;
  playerId: PlayerId;
  zones: Record<ZoneId, Zone>;
  cards?: Record<string, Card>;
  parseDeckList: (text: string) => ParsedCard[];
  validateDeckListLimits: (parsedDeck: ParsedCard[]) => { ok: true } | { ok: false; error: string };
  fetchScryfallCards: (parsedDeck: ParsedCard[]) => Promise<FetchScryfallResult>;
  validateImportResult: (
    parsedDeck: ParsedCard[],
    fetchResult: FetchScryfallResult
  ) => { ok: true; warnings: string[] } | { ok: false; error: string };
  chunkSize?: number;
}): Promise<{ chunks: DeckImportCardPlan[][]; warnings: string[] }> => {
  const parsedDeck = params.parseDeckList(params.importText);
  if (parsedDeck.length === 0) {
    throw new Error("No valid cards found in the list.");
  }

  const sizeValidation = params.validateDeckListLimits(parsedDeck);
  if (!sizeValidation.ok) {
    throw new Error(sizeValidation.error);
  }

  const requestedCounts = getRequestedCounts(parsedDeck);
  if (requestedCounts.commander > 0) {
    const { commanderZoneId } = resolveDeckZoneIds({
      zones: params.zones,
      playerId: params.playerId,
    });
    const commanderZone = params.zones[commanderZoneId];
    const existingCommanderCards = commanderZone
      ? countLiveZoneCards({
          zoneId: commanderZoneId,
          zone: commanderZone,
          cards: params.cards,
        })
      : 0;

    if (existingCommanderCards + requestedCounts.commander > MAX_COMMANDER_ZONE_CARDS) {
      throw new Error(
        `Commander zone capacity exceeded: ${existingCommanderCards} currently in zone + ${requestedCounts.commander} importing, limit is ${MAX_COMMANDER_ZONE_CARDS}.`
      );
    }
  }

  const fetchResult = await params.fetchScryfallCards(parsedDeck);
  const validation = params.validateImportResult(parsedDeck, fetchResult);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const { libraryZoneId, commanderZoneId, sideboardZoneId } = resolveDeckZoneIds({
    zones: params.zones,
    playerId: params.playerId,
  });

  const planned: DeckImportCardPlan[] = fetchResult.cards.map((cardData) => {
    const zoneId =
      cardData.section === "commander"
        ? commanderZoneId
        : cardData.section === "sideboard"
          ? sideboardZoneId
          : libraryZoneId;
    const zoneType =
      zoneId === commanderZoneId ? ZONE.COMMANDER : zoneId === sideboardZoneId ? ZONE.SIDEBOARD : ZONE.LIBRARY;
    const withCommander =
      cardData.section === "commander"
        ? ({ ...cardData, isCommander: true, commanderTax: 0 } as DeckImportCardData)
        : (cardData as DeckImportCardData);
    const withFaceDown =
      zoneId === libraryZoneId
        ? ({ ...withCommander, faceDown: true, deckSection: cardData.section } as DeckImportCardData)
        : ({ ...withCommander, deckSection: cardData.section } as DeckImportCardData);
    return { cardData: withFaceDown, zoneId, zoneType };
  });

  const chunks = chunkArray(planned, params.chunkSize ?? 20);
  return { chunks, warnings: validation.warnings };
};
