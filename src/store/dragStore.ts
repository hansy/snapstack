import { create } from 'zustand';

interface GhostCardState {
    zoneId: string;
    position: { x: number; y: number };
    tapped?: boolean;
}

interface DragStore {
    ghostCard: GhostCardState | null;
    activeCardId: string | null;
    overCardScale: number;
    setGhostCard: (ghostCard: GhostCardState | null) => void;
    setActiveCardId: (activeCardId: string | null) => void;
    setOverCardScale: (scale: number) => void;
}

export const useDragStore = create<DragStore>((set) => ({
    ghostCard: null,
    activeCardId: null,
    overCardScale: 1,
    setGhostCard: (ghostCard) => set({ ghostCard }),
    setActiveCardId: (activeCardId) => set({ activeCardId }),
    setOverCardScale: (overCardScale) => set({ overCardScale }),
}));
