import type { Card, CardId } from "@/types";

import type { ContextMenuItem } from "../types";

type Counter = Card["counters"][number];

type BuildCounterMenuItemsParams = {
  cardId: CardId;
  counters: Counter[];
  globalCounters: Record<string, string>;
  openAddCounterModal: (cardId: CardId) => void;
  addCounter: (
    cardId: CardId,
    counter: { type: string; count: number; color?: string }
  ) => void;
  removeCounter: (cardId: CardId, counterType: string) => void;
};

export const buildCounterMenuItems = ({
  cardId,
  counters,
  globalCounters,
  openAddCounterModal,
  addCounter,
  removeCounter,
}: BuildCounterMenuItemsParams): ContextMenuItem[] => {
  const items: ContextMenuItem[] = [];

  const globalCounterTypes = Object.keys(globalCounters).sort();

  if (globalCounterTypes.length === 0) {
    items.push({
      type: "action",
      label: "Add counter",
      onSelect: () => {
        openAddCounterModal(cardId);
      },
    });
  } else {
    const addCounterItems: ContextMenuItem[] = globalCounterTypes.map(
      (counterType) => ({
        type: "action",
        label: counterType,
        onSelect: () => {
          addCounter(cardId, {
            type: counterType,
            count: 1,
            color: globalCounters[counterType],
          });
        },
      })
    );

    addCounterItems.push({ type: "separator", id: "add-counter-divider" });
    addCounterItems.push({
      type: "action",
      label: "Create new...",
      onSelect: () => {
        openAddCounterModal(cardId);
      },
    });

    items.push({
      type: "action",
      label: "Add counter",
      onSelect: () => {},
      submenu: addCounterItems,
    });
  }

  if (counters.length > 0) {
    const removeCounterItems: ContextMenuItem[] = counters.map((counter) => ({
      type: "action",
      label: `${counter.type} (${counter.count})`,
      onSelect: () => removeCounter(cardId, counter.type),
    }));

    items.push({
      type: "action",
      label: "Remove counter",
      onSelect: () => {},
      submenu: removeCounterItems,
    });
  }

  return items;
};
