export const PLAYER_COLOR_PALETTE = ["rose", "violet", "sky", "amber"] as const;

export type PlayerColor = (typeof PLAYER_COLOR_PALETTE)[number];

export const isPlayerColor = (value: unknown): value is PlayerColor => {
  return (
    typeof value === "string" &&
    (PLAYER_COLOR_PALETTE as readonly string[]).includes(value)
  );
};

export const resolveOrderedPlayerIds = (
  playersById: Record<string, { id: string } | undefined>,
  playerOrder: string[]
): string[] => {
  const seen = new Set<string>();
  const orderedByShared = playerOrder
    .map((id) => playersById[id])
    .filter((player): player is NonNullable<typeof player> => {
      if (!player) return false;
      if (seen.has(player.id)) return false;
      seen.add(player.id);
      return true;
    })
    .map((player) => player.id);

  const fallback = Object.values(playersById)
    .filter((p): p is { id: string } => Boolean(p && typeof p.id === "string"))
    .map((p) => p.id)
    .filter((id) => !seen.has(id))
    .sort((a, b) => a.localeCompare(b));

  return [...orderedByShared, ...fallback];
};

export const computePlayerColors = (playerIds: string[]) => {
  const colors: Record<string, PlayerColor> = {};
  playerIds.forEach((id, index) => {
    colors[id] = PLAYER_COLOR_PALETTE[index % PLAYER_COLOR_PALETTE.length];
  });
  return colors;
};

