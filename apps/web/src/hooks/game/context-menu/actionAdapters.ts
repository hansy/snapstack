import type { Card, CardId, GameState, PlayerId, ZoneId } from "@/types";
import type { ScryfallRelatedCard } from "@/types/scryfall";

type MoveCardFn = (
  cardId: CardId,
  toZoneId: ZoneId,
  position?: { x: number; y: number },
  actorId?: PlayerId,
  isRemote?: boolean,
  opts?: { suppressLog?: boolean; faceDown?: boolean }
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
  | "tapCard"
  | "transformCard"
  | "duplicateCard"
  | "updateCard"
  | "setCardReveal"
  | "addCounterToCard"
  | "removeCounterFromCard"
  | "setActiveModal"
  | "removeCard"
  | "drawCard"
  | "shuffleLibrary"
  | "resetDeck"
  | "unloadDeck"
>;

export const createCardActionAdapters = (params: {
  store: StoreForContextMenu;
  myPlayerId: PlayerId;
  createRelatedCard: (card: Card, related: ScryfallRelatedCard) => void;
  openTextPrompt?: OpenTextPromptFn;
}) => {
  const moveCard: MoveCardFn = (
    cardId,
    toZoneId,
    position,
    _actorId,
    isRemote,
    opts
  ) => {
    params.store.moveCard(
      cardId,
      toZoneId,
      position,
      params.myPlayerId,
      isRemote,
      opts
    );
  };

  return {
    moveCard,
    tapCard: (cardId: CardId) => params.store.tapCard(cardId, params.myPlayerId),
    transformCard: (cardId: CardId, faceIndex?: number) =>
      params.store.transformCard(cardId, faceIndex),
    duplicateCard: (cardId: CardId) =>
      params.store.duplicateCard(cardId, params.myPlayerId),
    createRelatedCard: params.createRelatedCard,
    updateCard: (cardId: CardId, updates: Partial<Card>) =>
      params.store.updateCard(cardId, updates, params.myPlayerId),
    setCardReveal: (
      cardId: CardId,
      reveal: { toAll?: boolean; to?: PlayerId[] } | null
    ) => params.store.setCardReveal(cardId, reveal, params.myPlayerId),
    addCounter: (cardId: CardId, counter: { type: string; count: number; color?: string }) =>
      params.store.addCounterToCard(cardId, counter, params.myPlayerId),
    removeCounter: (cardId: CardId, counterType: string) =>
      params.store.removeCounterFromCard(cardId, counterType, params.myPlayerId),
    openAddCounterModal: (cardId: CardId) =>
      params.store.setActiveModal({ type: "ADD_COUNTER", cardId }),
    removeCard: (card: Card) =>
      params.store.removeCard(card.id, params.myPlayerId),
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
    shuffleLibrary: (playerId: PlayerId) =>
      params.store.shuffleLibrary(playerId, params.myPlayerId),
    resetDeck: (playerId: PlayerId) =>
      params.store.resetDeck(playerId, params.myPlayerId),
    unloadDeck: (playerId: PlayerId) =>
      params.store.unloadDeck(playerId, params.myPlayerId),
  };
};

