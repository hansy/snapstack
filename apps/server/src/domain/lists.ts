export const hasSameMembers = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const setLeft = new Set(left);
  const setRight = new Set(right);
  if (setLeft.size !== left.length || setRight.size !== right.length) return false;
  if (setLeft.size !== setRight.size) return false;
  for (const entry of setLeft) {
    if (!setRight.has(entry)) return false;
  }
  return true;
};

export const removeFromArray = (list: string[], id: string) =>
  list.filter((value) => value !== id);

export const placeCardId = (
  list: string[],
  cardId: string,
  placement: "top" | "bottom"
) => {
  const without = removeFromArray(list, cardId);
  if (placement === "bottom") return [cardId, ...without];
  return [...without, cardId];
};
