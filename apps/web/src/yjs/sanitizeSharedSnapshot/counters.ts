import type { Counter } from "@/types";

import { MAX_COUNTERS } from "../sanitizeLimits";
import { clampNumber } from "./utils";

export const sanitizeCounters = (value: any): Counter[] => {
  if (!Array.isArray(value)) return [];
  const result: Counter[] = [];
  for (const c of value) {
    if (!c || typeof c.type !== "string") continue;
    const count = clampNumber(c.count, 0, 999, 0);
    const counter: Counter = { type: c.type.slice(0, 64), count };
    if (typeof c.color === "string") counter.color = c.color.slice(0, 32);
    result.push(counter);
    if (result.length >= MAX_COUNTERS) break;
  }
  return result;
};

