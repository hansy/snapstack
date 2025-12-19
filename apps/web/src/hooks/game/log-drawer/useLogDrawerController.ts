import * as React from "react";

import { useLogStore } from "@/logging/logStore";
import { useGameStore } from "@/store/gameStore";

export type LogDrawerControllerInput = {
  isOpen: boolean;
  onClose: () => void;
  playerColors: Record<string, string>;
};

export const useLogDrawerController = ({ isOpen, onClose, playerColors }: LogDrawerControllerInput) => {
  const entries = useLogStore((state) => state.entries);
  const selfPlayerId = useGameStore((state) => state.myPlayerId);
  const players = useGameStore((state) => state.players);
  const cards = useGameStore((state) => state.cards);
  const zones = useGameStore((state) => state.zones);
  const logContext = React.useMemo(() => ({ players, cards, zones }), [players, cards, zones]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, isOpen]);

  return {
    isOpen,
    handleClose: onClose,
    playerColors,
    entries,
    selfPlayerId,
    logContext,
    scrollRef,
  };
};

export type LogDrawerController = ReturnType<typeof useLogDrawerController>;

