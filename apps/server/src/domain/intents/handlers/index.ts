import type { IntentHandler } from "./types";
import { cardIntentHandlers } from "./card";
import { deckIntentHandlers } from "./deck";
import { miscIntentHandlers } from "./misc";
import { playerIntentHandlers } from "./player";
import { zoneIntentHandlers } from "./zone";

const handlerGroups: Array<Record<string, IntentHandler>> = [
  playerIntentHandlers,
  zoneIntentHandlers,
  cardIntentHandlers,
  deckIntentHandlers,
  miscIntentHandlers,
];

const buildIntentHandlers = () => {
  const registry: Record<string, IntentHandler> = {};
  const duplicates = new Set<string>();
  for (const group of handlerGroups) {
    for (const [type, handler] of Object.entries(group)) {
      if (registry[type]) {
        duplicates.add(type);
        continue;
      }
      registry[type] = handler;
    }
  }
  if (duplicates.size > 0) {
    const list = Array.from(duplicates).sort().join(", ");
    throw new Error(`Duplicate intent handlers: ${list}`);
  }
  return registry;
};

export const intentHandlers: Record<string, IntentHandler> = buildIntentHandlers();

export const getIntentHandler = (type: string): IntentHandler | undefined =>
  intentHandlers[type];
