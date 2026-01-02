import type { Card, CardId, GameState, PlayerId, ZoneId } from "@/types";
import type { ScryfallRelatedCard } from "@/types/scryfall";
import { useSelectionStore } from "@/store/selectionStore";
import { batchSharedMutations } from "@/yjs/docManager";
import { resolveSelectedCardIds } from "@/models/game/selection/selectionModel";

type MoveCardFn = (
  cardId: CardId,
  toZoneId: ZoneId,
  position?: { x: number; y: number },
  actorId?: PlayerId,
  isRemote?: boolean,
  opts?: { suppressLog?: boolean; faceDown?: boolean; skipCollision?: boolean }
) => void;

type OpenTextPromptFn = (opts: {
  title: string;
  message?: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
}) => void;

type StoreForContextMenu = Pick<
  GameState,
  | "moveCard"
  | "moveCardToBottom"
  | "tapCard"
  | "transformCard"
  | "duplicateCard"
  | "updateCard"
  | "setCardReveal"
  | "addCounterToCard"
  | "removeCounterFromCard"
  | "setActiveModal"
  | "removeCard"
  | "cards"
  | "drawCard"
  | "shuffleLibrary"
  | "discardFromLibrary"
  | "resetDeck"
  | "mulligan"
  | "unloadDeck"
>;

export const createCardActionAdapters = (params: {
  store: StoreForContextMenu;
  myPlayerId: PlayerId;
  createRelatedCard: (card: Card, related: ScryfallRelatedCard) => void;
  openTextPrompt?: OpenTextPromptFn;
}) => {
  const resolveTargetIds = (seedId?: CardId): CardId[] => {
    if (!seedId) return [];
    const selection = useSelectionStore.getState();
    return resolveSelectedCardIds({
      seedCardId: seedId,
      cardsById: params.store.cards,
      selection,
      minCount: 1,
      fallbackToSeed: true,
    });
  };

  const applyToTargets = (seedId: CardId, action: (card: Card) => void) => {
    const targetIds = resolveTargetIds(seedId);
    if (targetIds.length === 0) return;

    const run = () => {
      targetIds.forEach((id) => {
        const card = params.store.cards[id];
        if (card) action(card);
      });
    };

    if (targetIds.length === 1) {
      run();
      return;
    }

    batchSharedMutations(run);
  };

  const moveCard: MoveCardFn = (
    cardId,
    toZoneId,
    position,
    _actorId,
    isRemote,
    opts
  ) => {
    applyToTargets(cardId, (card) => {
      params.store.moveCard(
        card.id,
        toZoneId,
        position,
        params.myPlayerId,
        isRemote,
        opts
      );
    });
  };

  return {
    moveCard,
    moveCardToBottom: (cardId: CardId, toZoneId: ZoneId) => {
      applyToTargets(cardId, (card) =>
        params.store.moveCardToBottom(card.id, toZoneId, params.myPlayerId)
      );
    },
    tapCard: (cardId: CardId) => {
      const seedCard = params.store.cards[cardId];
      if (!seedCard) return;
      const targetIds = resolveTargetIds(cardId);
      if (targetIds.length === 0) return;
      const targetTapped = !seedCard.tapped;

      const run = () => {
        targetIds.forEach((id) => {
          const card = params.store.cards[id];
          if (!card) return;
          if (card.tapped === targetTapped) return;
          params.store.tapCard(card.id, params.myPlayerId);
        });
      };

      if (targetIds.length === 1) {
        run();
        return;
      }

      batchSharedMutations(run);
    },
    transformCard: (cardId: CardId, faceIndex?: number) => {
      const targetIds = resolveTargetIds(cardId);
      if (targetIds.length === 0) return;
      if (targetIds.length === 1) {
        params.store.transformCard(cardId, faceIndex);
        return;
      }
      batchSharedMutations(() => {
        targetIds.forEach((id) => {
          params.store.transformCard(id, faceIndex);
        });
      });
    },
    duplicateCard: (cardId: CardId) =>
      applyToTargets(cardId, (card) =>
        params.store.duplicateCard(card.id, params.myPlayerId)
      ),
    createRelatedCard: (card: Card, related: ScryfallRelatedCard) => {
      const targetIds = resolveTargetIds(card.id);
      if (targetIds.length === 0) return;
      if (targetIds.length === 1) {
        params.createRelatedCard(card, related);
        return;
      }
      targetIds.forEach((id) => {
        const targetCard = params.store.cards[id];
        if (targetCard) params.createRelatedCard(targetCard, related);
      });
    },
    updateCard: (cardId: CardId, updates: Partial<Card>) =>
      applyToTargets(cardId, (card) =>
        params.store.updateCard(card.id, updates, params.myPlayerId)
      ),
    setCardReveal: (
      cardId: CardId,
      reveal: { toAll?: boolean; to?: PlayerId[] } | null
    ) =>
      applyToTargets(cardId, (card) =>
        params.store.setCardReveal(card.id, reveal, params.myPlayerId)
      ),
    addCounter: (cardId: CardId, counter: { type: string; count: number; color?: string }) =>
      applyToTargets(cardId, (card) =>
        params.store.addCounterToCard(card.id, counter, params.myPlayerId)
      ),
    removeCounter: (cardId: CardId, counterType: string) =>
      applyToTargets(cardId, (card) =>
        params.store.removeCounterFromCard(card.id, counterType, params.myPlayerId)
      ),
    openAddCounterModal: (cardIds: CardId[]) => {
      const seedId = cardIds[0];
      const targetIds =
        cardIds.length > 1 ? cardIds : resolveTargetIds(seedId);
      if (targetIds.length === 0) return;
      params.store.setActiveModal({ type: "ADD_COUNTER", cardIds: targetIds });
    },
    removeCard: (card: Card) => {
      const targetIds = resolveTargetIds(card.id);
      if (targetIds.length === 0) return;
      const run = () => {
        targetIds.forEach((id) => {
          params.store.removeCard(id, params.myPlayerId);
        });
      };
      if (targetIds.length === 1) {
        run();
        return;
      }
      batchSharedMutations(run);
    },
    openTextPrompt: params.openTextPrompt,
  };
};

export const createZoneActionAdapters = (params: {
  store: StoreForContextMenu;
  myPlayerId: PlayerId;
}) => {
  return {
    drawCard: (playerId: PlayerId) =>
      params.store.drawCard(playerId, params.myPlayerId),
    discardFromLibrary: (playerId: PlayerId, count?: number) =>
      params.store.discardFromLibrary(playerId, count, params.myPlayerId),
    shuffleLibrary: (playerId: PlayerId) =>
      params.store.shuffleLibrary(playerId, params.myPlayerId),
    resetDeck: (playerId: PlayerId) =>
      params.store.resetDeck(playerId, params.myPlayerId),
    mulligan: (playerId: PlayerId, count: number) =>
      params.store.mulligan(playerId, count, params.myPlayerId),
    unloadDeck: (playerId: PlayerId) =>
      params.store.unloadDeck(playerId, params.myPlayerId),
  };
};
