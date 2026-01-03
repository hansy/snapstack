import type { Card, CardId, GameState, PlayerId } from "@/types";

import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { updateDecklistCommanderSection } from "@/services/deck-import/commanderDecklist";

type CommanderOverride = {
  cardId: CardId;
  isCommander: boolean;
  name?: string;
  ownerId?: PlayerId;
};

const buildCommanderNames = (
  cards: Record<CardId, Card>,
  playerId: PlayerId,
  override?: CommanderOverride
) => {
  const names: string[] = [];
  Object.values(cards).forEach((card) => {
    if (card.ownerId !== playerId) return;
    if (override && card.id === override.cardId) return;
    if (card.isCommander) names.push(card.name);
  });

  if (override && (override.ownerId ?? playerId) === playerId) {
    const name = override.name ?? cards[override.cardId]?.name;
    if (override.isCommander && name) names.push(name);
  }

  return names;
};

export const syncCommanderDecklistForPlayer = (params: {
  state: Pick<GameState, "cards">;
  playerId: PlayerId;
  override?: CommanderOverride;
}) => {
  const stored = useClientPrefsStore.getState().lastImportedDeckText;
  if (!stored) return;

  const commanderNames = buildCommanderNames(params.state.cards, params.playerId, params.override);
  const next = updateDecklistCommanderSection(stored, commanderNames);
  if (next.changed) {
    useClientPrefsStore.getState().setLastImportedDeckText(next.text);
  }
};
