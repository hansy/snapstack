const HIDDEN_ZONE_TYPES = new Set(["hand", "library"]);

export const getBorderColorClass = (color?: string) => {
  switch (color) {
    case "rose":
      return "border-rose-500/50";
    case "violet":
      return "border-violet-500/50";
    case "sky":
      return "border-sky-500/50";
    case "amber":
      return "border-amber-500/50";
    case "emerald":
      return "border-emerald-500/50";
    default:
      return "border-zinc-700/50";
  }
};

export const formatTimeAgo = (timestamp: number, nowMs: number = Date.now()): string => {
  const seconds = Math.floor((nowMs - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return "long ago";
};

export const isPublicZoneType = (zoneType?: string): boolean => {
  if (!zoneType) return false;
  return !HIDDEN_ZONE_TYPES.has(zoneType);
};

export const computeVisibleCardName = (params: {
  computedName: string;
  fallbackName?: string;
  fromZoneType?: string;
  toZoneType?: string;
}): string => {
  if (params.computedName !== "a card") return params.computedName;

  const fromPublic = isPublicZoneType(params.fromZoneType);
  const toPublic = isPublicZoneType(params.toZoneType);
  if (params.fallbackName && (fromPublic || toPublic)) return params.fallbackName;

  return params.computedName;
};

