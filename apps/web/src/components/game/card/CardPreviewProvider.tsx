import React from "react";
import { Card as CardType } from "@/types";
import { useDragStore } from "@/store/dragStore";
import { useGameStore } from "@/store/gameStore";
import { setCardPreviewLockHandler } from "@/lib/cardPreviewLock";
import { CardPreview } from "./CardPreview";

type PreviewState = {
  card: CardType;
  anchorEl: HTMLElement;
  locked: boolean;
} | null;

interface CardPreviewContextValue {
  showPreview: (card: CardType, anchorEl: HTMLElement) => void;
  hidePreview: () => void;
  toggleLock: (card: CardType, anchorEl: HTMLElement) => void;
  unlockPreview: () => void;
  isLocked: boolean;
}

const CardPreviewContext = React.createContext<CardPreviewContextValue | null>(
  null
);

export const CardPreviewProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [preview, setPreview] = React.useState<PreviewState>(null);
  const activeCardId = useDragStore((state) => state.activeCardId);

  const showPreview = React.useCallback((card: CardType, anchorEl: HTMLElement) => {
    setPreview((prev) => {
      if (prev?.locked) return prev;
      return { card, anchorEl, locked: false };
    });
  }, []);

  const hidePreview = React.useCallback(() => {
    setPreview((prev) => {
      if (prev?.locked) return prev;
      return null;
    });
  }, []);

  const toggleLock = React.useCallback((card: CardType, anchorEl: HTMLElement) => {
    setPreview((prev) => {
      // If already locked on this card, unlock it
      if (prev?.locked && prev.card.id === card.id) {
        return null;
      }
      // Otherwise lock on this card
      return { card, anchorEl, locked: true };
    });
  }, []);

  const unlockPreview = React.useCallback(() => {
    setPreview(null);
  }, []);

  React.useEffect(() => {
    if (activeCardId) {
      setPreview(null);
    }
  }, [activeCardId]);

  React.useEffect(() => {
    setCardPreviewLockHandler(({ cardId, anchorEl }) => {
      const card = useGameStore.getState().cards[cardId];
      if (!card) return;
      const resolvedAnchor =
        anchorEl && anchorEl.isConnected
          ? anchorEl
          : (document.querySelector(`[data-card-id="${cardId}"]`) as HTMLElement | null);
      if (!resolvedAnchor) return;
      toggleLock(card, resolvedAnchor);
    });
    return () => {
      setCardPreviewLockHandler(null);
    };
  }, [toggleLock]);

  const value = React.useMemo(
    () => ({ showPreview, hidePreview, toggleLock, unlockPreview, isLocked: !!preview?.locked }),
    [showPreview, hidePreview, toggleLock, unlockPreview, preview?.locked]
  );

  return (
    <CardPreviewContext.Provider value={value}>
      {children}
      {preview && (
        <CardPreview
          card={preview.card}
          anchorEl={preview.anchorEl}
          locked={preview.locked}
          onClose={unlockPreview}
        />
      )}
    </CardPreviewContext.Provider>
  );
};

export const useCardPreview = () => {
  const ctx = React.useContext(CardPreviewContext);
  if (!ctx) {
    throw new Error("useCardPreview must be used within CardPreviewProvider");
  }
  return ctx;
};
