import type { Card, CardId, Player, PlayerId } from "@/types";

import type { ContextMenuItem } from "./types";

type SetCardReveal = (
  cardId: CardId,
  reveal: { toAll?: boolean; to?: PlayerId[] } | null
) => void;

export const buildRevealMenu = (opts: {
  card: Card;
  players?: Record<PlayerId, Player>;
  actorId: PlayerId;
  setCardReveal: SetCardReveal;
}): ContextMenuItem => {
  const { card, players, actorId, setCardReveal } = opts;
  const others = players
    ? Object.values(players).filter((p) => p.id !== actorId)
    : [];

  const revealItems: ContextMenuItem[] = [];

  revealItems.push({
    type: "action",
    label: "Reveal to all",
    checked: card.revealedToAll,
    onSelect: () => setCardReveal(card.id, { toAll: true }),
  });

  revealItems.push({ type: "separator" });

  others.forEach((p) => {
    const isRevealed = card.revealedToAll || card.revealedTo?.includes(p.id);
    revealItems.push({
      type: "action",
      label: p.name || p.id,
      checked: isRevealed,
      onSelect: () => {
        if (card.revealedToAll) {
          const newTo = others.filter((o) => o.id !== p.id).map((o) => o.id);
          setCardReveal(card.id, { to: newTo });
        } else {
          const current = card.revealedTo ?? [];
          let newTo: string[];
          if (current.includes(p.id)) {
            newTo = current.filter((id) => id !== p.id);
          } else {
            newTo = [...current, p.id];
          }
          setCardReveal(card.id, { to: newTo });
        }
      },
    });
  });

  revealItems.push({ type: "separator" });

  revealItems.push({
    type: "action",
    label: "Hide for all",
    onSelect: () => setCardReveal(card.id, null),
  });

  return {
    type: "action",
    label: "Reveal to ...",
    onSelect: () => {},
    submenu: revealItems,
  };
};
