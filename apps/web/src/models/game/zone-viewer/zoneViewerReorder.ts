export const reorderZoneViewerList = (ids: string[], fromId: string, toId: string) => {
  if (fromId === toId) return ids;
  const next = [...ids];
  const fromIndex = next.indexOf(fromId);
  const toIndex = next.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1) return ids;
  next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]);
  return next;
};

export const mergeZoneCardOrder = (params: {
  zoneCardIds: string[];
  reorderedIds: string[];
}): string[] => {
  const zoneSet = new Set(params.zoneCardIds);
  const seen = new Set<string>();

  const reordered = params.reorderedIds.filter((id) => {
    if (!zoneSet.has(id)) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const reorderedSet = new Set(reordered);
  const prefix = params.zoneCardIds.filter((id) => !reorderedSet.has(id));
  return [...prefix, ...reordered];
};

