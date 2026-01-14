import * as React from "react";

import { useGameStore } from "@/store/gameStore";
import type { PeerCounts } from "@/hooks/game/multiplayer-sync/peerCount";

export type SyncStatus = "connecting" | "connected";

export type SidenavControllerInput = {
  onCreateToken?: () => void;
  onOpenCoinFlipper?: () => void;
  onOpenDiceRoller?: () => void;
  onToggleLog?: () => void;
  isLogOpen?: boolean;
  onOpenShareDialog?: () => void;
  onLeaveGame?: () => void;
  onOpenShortcuts?: () => void;
  syncStatus?: SyncStatus;
  peerCounts?: PeerCounts;
  isSpectator?: boolean;
};

export const useSidenavController = ({
  onCreateToken,
  onOpenCoinFlipper,
  onOpenDiceRoller,
  onToggleLog,
  isLogOpen = false,
  onOpenShareDialog,
  onLeaveGame,
  onOpenShortcuts,
  syncStatus = "connecting",
  peerCounts = { total: 1, players: 1, spectators: 0 },
  isSpectator = false,
}: SidenavControllerInput) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const untapAll = useGameStore((state) => state.untapAll);

  const handleUntapAll = React.useCallback(() => {
    if (isSpectator) return;
    untapAll(myPlayerId);
  }, [isSpectator, myPlayerId, untapAll]);

  const openMenu = React.useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = React.useCallback(() => setIsMenuOpen(false), []);

  const handleOpenShortcuts = React.useCallback(() => {
    onOpenShortcuts?.();
    setIsMenuOpen(false);
  }, [onOpenShortcuts]);

  return {
    onCreateToken,
    onOpenCoinFlipper,
    onOpenDiceRoller,
    onToggleLog,
    isLogOpen,
    onOpenShareDialog,
    onLeaveGame,
    syncStatus,
    peerCounts,
    isSpectator,
    isMenuOpen,
    openMenu,
    closeMenu,
    handleUntapAll,
    handleOpenShortcuts,
  };
};

export type SidenavController = ReturnType<typeof useSidenavController>;
