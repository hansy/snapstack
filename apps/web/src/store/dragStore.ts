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
    isGroupDragging: boolean;
    overCardScale: number;
    zoomEdge: 'top' | 'bottom' | 'left' | 'right' | null;
    setGhostCards: (ghostCards: GhostCardState[] | null) => void;
    setActiveCardId: (activeCardId: string | null) => void;
    setIsGroupDragging: (isGroupDragging: boolean) => void;
    setOverCardScale: (scale: number) => void;
    setZoomEdge: (edge: 'top' | 'bottom' | 'left' | 'right' | null) => void;
}

export const useDragStore = create<DragStore>((set) => ({
    ghostCards: null,
    activeCardId: null,
    isGroupDragging: false,
    overCardScale: 1,
    zoomEdge: null,
    setGhostCards: (ghostCards) => set({ ghostCards }),
    setActiveCardId: (activeCardId) => set({ activeCardId }),
    setIsGroupDragging: (isGroupDragging) => set({ isGroupDragging }),
    setOverCardScale: (overCardScale) => set({ overCardScale }),
    setZoomEdge: (zoomEdge) => set({ zoomEdge }),
}));
