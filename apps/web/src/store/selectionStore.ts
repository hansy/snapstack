import { create } from "zustand";

type SelectionState = {
  selectedCardIds: string[];
  selectionZoneId: string | null;
  setSelection: (ids: string[], zoneId: string | null) => void;
  clearSelection: () => void;
  selectOnly: (cardId: string, zoneId: string) => void;
  toggleCard: (cardId: string, zoneId: string) => void;
};

const uniqueIds = (ids: string[]) => Array.from(new Set(ids));

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedCardIds: [],
  selectionZoneId: null,
  setSelection: (ids, zoneId) => {
    const nextIds = uniqueIds(ids);
    set({ selectedCardIds: nextIds, selectionZoneId: nextIds.length ? zoneId : null });
  },
  clearSelection: () => set({ selectedCardIds: [], selectionZoneId: null }),
  selectOnly: (cardId, zoneId) => set({ selectedCardIds: [cardId], selectionZoneId: zoneId }),
  toggleCard: (cardId, zoneId) =>
    set((state) => {
      if (state.selectionZoneId && state.selectionZoneId !== zoneId) {
        return { selectedCardIds: [cardId], selectionZoneId: zoneId };
      }
      const selected = new Set(state.selectedCardIds);
      if (selected.has(cardId)) {
        selected.delete(cardId);
      } else {
        selected.add(cardId);
      }
      const nextIds = Array.from(selected);
      return { selectedCardIds: nextIds, selectionZoneId: nextIds.length ? zoneId : null };
    }),
}));
