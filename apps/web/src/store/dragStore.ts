import { create } from 'zustand';

interface GhostCardState {
    cardId: string;
    zoneId: string;
    position: { x: number; y: number };
    tapped?: boolean;
}

interface DragStore {
    ghostCards: GhostCardState[] | null;
    activeCardId: string | null;
    activeCardScale: number;
    isGroupDragging: boolean;
    overCardScale: number;
    setGhostCards: (ghostCards: GhostCardState[] | null) => void;
    setActiveCardId: (activeCardId: string | null) => void;
    setActiveCardScale: (scale: number) => void;
    setIsGroupDragging: (isGroupDragging: boolean) => void;
    setOverCardScale: (scale: number) => void;
}

export const useDragStore = create<DragStore>((set) => ({
    ghostCards: null,
    activeCardId: null,
    activeCardScale: 1,
    isGroupDragging: false,
    overCardScale: 1,
    setGhostCards: (ghostCards) => set({ ghostCards }),
    setActiveCardId: (activeCardId) => set({ activeCardId }),
    setActiveCardScale: (activeCardScale) => set({ activeCardScale }),
    setIsGroupDragging: (isGroupDragging) => set({ isGroupDragging }),
    setOverCardScale: (overCardScale) => set({ overCardScale }),
}));
