import type { Counter } from "@/types";

export const normalizeCounterType = (raw: string, maxLen = 64): string =>
  raw.trim().slice(0, maxLen);

export const normalizeCounterCount = (raw: number): number => {
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.floor(raw));
};

export const getAllCounterTypes = (params: {
  presetTypes: string[];
  globalCounterTypes: string[];
}): string[] => {
  return Array.from(new Set([...params.presetTypes, ...params.globalCounterTypes])).sort();
};

export const planAddCounter = (params: {
  rawType: string;
  rawCount: number;
  globalCounters: Record<string, string>;
  resolveColor: (type: string, globalCounters: Record<string, string>) => string;
}):
  | {
      counter: Counter;
      shouldAddGlobalCounter: boolean;
    }
  | null => {
  const type = normalizeCounterType(params.rawType);
  if (!type) return null;

  const count = normalizeCounterCount(params.rawCount);
  const color = params.resolveColor(type, params.globalCounters);

  return {
    counter: { type, count, color },
    shouldAddGlobalCounter: !params.globalCounters[type],
  };
};

