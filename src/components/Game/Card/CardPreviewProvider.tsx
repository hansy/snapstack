import React from "react";
import { Card as CardType } from "../../../types";
import { useDragStore } from "../../../store/dragStore";
import { CardPreview } from "./CardPreview";

type PreviewState = { card: CardType; rect: DOMRect } | null;

interface CardPreviewContextValue {
  showPreview: (card: CardType, rect: DOMRect) => void;
  hidePreview: () => void;
}

const CardPreviewContext = React.createContext<CardPreviewContextValue | null>(
  null
);

export const CardPreviewProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [preview, setPreview] = React.useState<PreviewState>(null);
  const activeCardId = useDragStore((state) => state.activeCardId);

  const showPreview = React.useCallback(
    (card: CardType, rect: DOMRect) => setPreview({ card, rect }),
    []
  );

  const hidePreview = React.useCallback(() => setPreview(null), []);

  React.useEffect(() => {
    if (activeCardId) {
      setPreview(null);
    }
  }, [activeCardId]);

  const value = React.useMemo(
    () => ({ showPreview, hidePreview }),
    [showPreview, hidePreview]
  );

  return (
    <CardPreviewContext.Provider value={value}>
      {children}
      {preview && <CardPreview card={preview.card} anchorRect={preview.rect} />}
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
