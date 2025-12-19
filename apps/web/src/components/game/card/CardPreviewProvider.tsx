import React from "react";
import { Card as CardType } from "@/types";
import { useDragStore } from "@/store/dragStore";
import { CardPreview } from "./CardPreview";

type PreviewState = {
  card: CardType;
  rect: DOMRect;
  locked: boolean;
} | null;

interface CardPreviewContextValue {
  showPreview: (card: CardType, rect: DOMRect) => void;
  hidePreview: () => void;
  toggleLock: (card: CardType, rect: DOMRect) => void;
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

  const showPreview = React.useCallback((card: CardType, rect: DOMRect) => {
    setPreview((prev) => {
      if (prev?.locked) return prev;
      return { card, rect, locked: false };
    });
  }, []);

  const hidePreview = React.useCallback(() => {
    setPreview((prev) => {
      if (prev?.locked) return prev;
      return null;
    });
  }, []);

  const toggleLock = React.useCallback((card: CardType, rect: DOMRect) => {
    setPreview((prev) => {
      // If already locked on this card, unlock it
      if (prev?.locked && prev.card.id === card.id) {
        return null;
      }
      // Otherwise lock on this card
      return { card, rect, locked: true };
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
          anchorRect={preview.rect}
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
