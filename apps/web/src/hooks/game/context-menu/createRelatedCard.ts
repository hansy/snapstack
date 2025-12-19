import type { Card, GameState, PlayerId } from "@/types";
import type { ScryfallCard, ScryfallRelatedCard } from "@/types/scryfall";

import { planRelatedBattlefieldCardCreation } from "./relatedCardCreation";

export type ToastLike = {
  success: (message: string) => void;
  error: (message: string) => void;
};

export type LoggerLike = Pick<Console, "error">;

type StoreLike = Pick<GameState, "zones" | "cards" | "addCard">;

export const createRelatedCardHandler = (params: {
  actorId: PlayerId;
  getState: () => StoreLike;
  toast: ToastLike;
  fetchScryfallCardByUri: (uri: string) => Promise<ScryfallCard>;
  createId: () => string;
  logger?: LoggerLike;
}) => {
  const logger = params.logger ?? console;

  return async (card: Card, related: ScryfallRelatedCard) => {
    const state = params.getState();

    const planned = await planRelatedBattlefieldCardCreation({
      sourceCard: card,
      related,
      actorId: params.actorId,
      zonesById: state.zones,
      cardsById: state.cards,
      fetchScryfallCardByUri: params.fetchScryfallCardByUri,
      createId: params.createId,
    });

    if (!planned.ok) {
      if (planned.reason === "permission_denied") {
        params.toast.error(
          planned.message ?? "Not allowed to create related card here"
        );
      }

      if (planned.reason === "fetch_failed") {
        if (planned.error) {
          logger.error("Failed to fetch related card from Scryfall", planned.error);
        }
        params.toast.error("Failed to create related card");
      }

      return;
    }

    state.addCard(planned.card);
    params.toast.success(
      `Created ${related.name}${planned.card.isToken ? " token" : ""}`
    );
  };
};
