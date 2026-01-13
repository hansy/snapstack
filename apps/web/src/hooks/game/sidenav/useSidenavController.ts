import * as React from "react";

import { useGameStore } from "@/store/gameStore";
import type { PeerCounts } from "@/hooks/game/multiplayer-sync/peerCount";

export type SyncStatus = "connecting" | "connected";

export type SidenavControllerInput = {
  onCreateToken?: () => void;
  onOpenDiceRoller?: () => void;
  onToggleLog?: () => void;
  isLogOpen?: boolean;
  onToggleRoomLock?: () => void;
  onCopyLink?: () => void;
  onLeaveGame?: () => void;
  onOpenShortcuts?: () => void;
  syncStatus?: SyncStatus;
  peerCounts?: PeerCounts;
  isHost?: boolean;
  roomLocked?: boolean;
  roomIsFull?: boolean;
  isSpectator?: boolean;
};

export const useSidenavController = ({
  onCreateToken,
  onOpenDiceRoller,
  onToggleLog,
  isLogOpen = false,
  onToggleRoomLock,
  onCopyLink,
  onLeaveGame,
  onOpenShortcuts,
  syncStatus = "connecting",
  peerCounts = { total: 1, players: 1, spectators: 0 },
  isHost = false,
  roomLocked = false,
  roomIsFull = false,
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
    onOpenDiceRoller,
    onToggleLog,
    isLogOpen,
    onToggleRoomLock,
    onCopyLink,
    onLeaveGame,
    syncStatus,
    peerCounts,
    isHost,
    roomLocked,
    roomIsFull,
    isSpectator,
    isMenuOpen,
    openMenu,
    closeMenu,
    handleUntapAll,
    handleOpenShortcuts,
  };
};

export type SidenavController = ReturnType<typeof useSidenavController>;
