import * as React from "react";

import { useGameStore } from "@/store/gameStore";

export type SyncStatus = "connecting" | "connected";

export type SidenavControllerInput = {
  onCreateToken?: () => void;
  onOpenDiceRoller?: () => void;
  onToggleLog?: () => void;
  onToggleRoomLock?: () => void;
  onCopyLink?: () => void;
  onLeaveGame?: () => void;
  onOpenShortcuts?: () => void;
  syncStatus?: SyncStatus;
  peerCount?: number;
  isHost?: boolean;
  roomLocked?: boolean;
  roomIsFull?: boolean;
};

export const useSidenavController = ({
  onCreateToken,
  onOpenDiceRoller,
  onToggleLog,
  onToggleRoomLock,
  onCopyLink,
  onLeaveGame,
  onOpenShortcuts,
  syncStatus = "connecting",
  peerCount = 1,
  isHost = false,
  roomLocked = false,
  roomIsFull = false,
}: SidenavControllerInput) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const untapAll = useGameStore((state) => state.untapAll);

  const handleUntapAll = React.useCallback(() => {
    untapAll(myPlayerId);
  }, [myPlayerId, untapAll]);

  const openMenu = React.useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = React.useCallback(() => setIsMenuOpen(false), []);

  const handleOpenShortcuts = React.useCallback(() => {
    onOpenShortcuts?.();
    setIsMenuOpen(false);
  }, [onOpenShortcuts]);

  return {
    onCreateToken,
    onOpenDiceRoller,
    onToggleLog,
    onToggleRoomLock,
    onCopyLink,
    onLeaveGame,
    syncStatus,
    peerCount,
    isHost,
    roomLocked,
    roomIsFull,
    isMenuOpen,
    openMenu,
    closeMenu,
    handleUntapAll,
    handleOpenShortcuts,
  };
};

export type SidenavController = ReturnType<typeof useSidenavController>;
