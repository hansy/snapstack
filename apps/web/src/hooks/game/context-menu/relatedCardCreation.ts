import type { Card, PlayerId, Zone, ZoneId } from "@/types";
import type { ScryfallCard, ScryfallRelatedCard } from "@/types/scryfall";

import { ZONE } from "@/constants/zones";
import { canModifyCardState } from "@/rules/permissions";

import { buildRelatedBattlefieldCard } from "./model";

export type RelatedCardCreationResult =
  | { ok: true; card: Card }
  | {
      ok: false;
      reason: "not_battlefield" | "permission_denied" | "fetch_failed" | "no_plan";
      message?: string;
      error?: unknown;
    };

export const planRelatedBattlefieldCardCreation = async (params: {
  sourceCard: Card;
  related: ScryfallRelatedCard;
  actorId: PlayerId;
  zonesById: Record<ZoneId, Zone>;
  cardsById: Record<string, Pick<Card, "position">>;
  fetchScryfallCardByUri: (uri: string) => Promise<ScryfallCard>;
  createId: () => string;
}): Promise<RelatedCardCreationResult> => {
  const battlefield = params.zonesById[params.sourceCard.zoneId];
  if (!battlefield || battlefield.type !== ZONE.BATTLEFIELD) {
    return { ok: false, reason: "not_battlefield" };
  }

  const permission = canModifyCardState({ actorId: params.actorId }, params.sourceCard, battlefield);
  if (!permission.allowed) {
    return {
      ok: false,
      reason: "permission_denied",
      message: permission.reason ?? "Not allowed to create related card here",
    };
  }

  let scryfallCard: ScryfallCard;
  try {
    scryfallCard = await params.fetchScryfallCardByUri(params.related.uri);
  } catch (error) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: "Failed to fetch related card",
      error,
    };
  }

  const planned = buildRelatedBattlefieldCard({
    sourceCard: params.sourceCard,
    battlefield,
    playerId: params.actorId,
    related: params.related,
    scryfallCard,
    cardsById: params.cardsById,
    createId: params.createId,
  });

  if (!planned) return { ok: false, reason: "no_plan" };
  return { ok: true, card: planned };
};
