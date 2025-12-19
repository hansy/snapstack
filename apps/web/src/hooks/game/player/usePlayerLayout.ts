import { useGameStore } from "@/store/gameStore";
import type { Player } from "@/types";
import {
  computePlayerColors,
  isPlayerColor,
  type PlayerColor,
  PLAYER_COLOR_PALETTE,
} from "@/lib/playerColors";

export type SeatPosition = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export type LayoutMode = "single" | "split" | "quadrant";

export type PlayerLayoutSlot = {
  player: Player | undefined;
  position: SeatPosition;
  color: PlayerColor;
};

export const usePlayerLayout = () => {
  const players = useGameStore((state) => state.players);
  const playerOrder = useGameStore((state) => state.playerOrder);
  const myPlayerId = useGameStore((state) => state.myPlayerId);

  const seen = new Set<string>();
  const orderedByShared = playerOrder
    .map((id) => players[id])
    .filter((player): player is NonNullable<typeof player> => {
      if (!player) return false;
      if (seen.has(player.id)) return false;
      seen.add(player.id);
      return true;
    });
  const fallback = Object.values(players)
    .filter((p) => !seen.has(p.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const sortedPlayers = [...orderedByShared, ...fallback];
  const myIndex = myPlayerId
    ? sortedPlayers.findIndex((p) => p.id === myPlayerId)
    : -1;
  const layoutPlayers =
    myIndex > 0
      ? [...sortedPlayers.slice(myIndex), ...sortedPlayers.slice(0, myIndex)]
      : sortedPlayers;

  // Determine Layout Mode
  const playerCount = layoutPlayers.length;
  let layoutMode: LayoutMode = "single";
  if (playerCount >= 3) layoutMode = "quadrant";
  else if (playerCount === 2) layoutMode = "split";

  // Generate Slots based on Mode
  let slots: PlayerLayoutSlot[] = [];

  // Colors are assigned to players (not seats) so they remain consistent regardless of view rotation.
  const canonicalIds = sortedPlayers.map((p) => p.id);
  const canonicalColors = computePlayerColors(canonicalIds);
  const resolveColor = (playerId: string, fallbackIndex = 0): PlayerColor => {
    const player = players[playerId];
    if (player && isPlayerColor(player.color)) return player.color;
    return canonicalColors[playerId] ?? PLAYER_COLOR_PALETTE[fallbackIndex];
  };

  const getPlayerAt = (index: number) => layoutPlayers[index];

  if (layoutMode === "single") {
    // 1 Player: Full Screen anchored bottom-left
    const player0 = getPlayerAt(0);
    slots = [
      {
        player: player0,
        position: "bottom-left",
        color: player0 ? resolveColor(player0.id, 0) : PLAYER_COLOR_PALETTE[0],
      },
    ];
  } else if (layoutMode === "split") {
    // 2 Players: Top/Bottom using shared order
    const player0 = getPlayerAt(0);
    const player1 = getPlayerAt(1);
    slots = [
      {
        player: player1,
        position: "top-left",
        color: player1 ? resolveColor(player1.id, 1) : PLAYER_COLOR_PALETTE[1],
      },
      {
        player: player0,
        position: "bottom-left",
        color: player0 ? resolveColor(player0.id, 0) : PLAYER_COLOR_PALETTE[0],
      },
    ];
  } else {
    // 3+ Players: Quadrants
    // Row 1: TL, TR
    // Row 2: BL, BR
    // Slots follow the shared order so all clients see the same seating.

    const player0 = getPlayerAt(0);
    const player1 = getPlayerAt(1);
    const player2 = getPlayerAt(2);
    const player3 = getPlayerAt(3);

    slots = [
      {
        player: player1,
        position: "top-left",
        color: player1 ? resolveColor(player1.id, 1) : PLAYER_COLOR_PALETTE[1],
      },
      {
        player: player2,
        position: "top-right",
        color: player2 ? resolveColor(player2.id, 2) : PLAYER_COLOR_PALETTE[2],
      },
      {
        player: player0,
        position: "bottom-left",
        color: player0 ? resolveColor(player0.id, 0) : PLAYER_COLOR_PALETTE[0],
      },
      {
        player: player3,
        position: "bottom-right",
        color: player3 ? resolveColor(player3.id, 3) : PLAYER_COLOR_PALETTE[3],
      },
    ];
  }

  return {
    slots,
    layoutMode,
    myPlayerId,
  };
};
