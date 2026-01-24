import type { IntentHandler } from "./types";
import { cardIntentHandlers } from "./card";
import { deckIntentHandlers } from "./deck";
import { miscIntentHandlers } from "./misc";
import { playerIntentHandlers } from "./player";
import { zoneIntentHandlers } from "./zone";

export const intentHandlers: Record<string, IntentHandler> = {
  ...playerIntentHandlers,
  ...zoneIntentHandlers,
  ...cardIntentHandlers,
  ...deckIntentHandlers,
  ...miscIntentHandlers,
};

export const getIntentHandler = (type: string): IntentHandler | undefined =>
  intentHandlers[type];
