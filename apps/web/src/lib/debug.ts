export const DEBUG_FLAGS = {
  faceDownDrag: false,
} as const;

export type DebugFlagKey = keyof typeof DEBUG_FLAGS;

export const isDebugEnabled = (key: DebugFlagKey): boolean => DEBUG_FLAGS[key];

export const debugLog = (key: DebugFlagKey, ...args: unknown[]) => {
  if (!isDebugEnabled(key)) return;
  console.log(`[${key}]`, ...args);
};
