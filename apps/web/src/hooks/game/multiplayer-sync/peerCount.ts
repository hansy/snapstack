export const computePeerCount = (states: Map<number, unknown>): number => {
  const unique = new Set<string>();
  states.forEach((state: any, clientId) => {
    const userId = state?.client?.id;
    unique.add(typeof userId === "string" ? `u:${userId}` : `c:${clientId}`);
  });
  return Math.max(1, unique.size);
};

