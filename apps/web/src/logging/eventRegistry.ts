import type { LogEventRegistry } from "./types";

import { cardEvents } from "./eventRegistry/cardEvents";
import { coinEvents } from "./eventRegistry/coinEvents";
import { counterEvents } from "./eventRegistry/counterEvents";
import { diceEvents } from "./eventRegistry/diceEvents";
import { deckEvents } from "./eventRegistry/deckEvents";
import { libraryEvents } from "./eventRegistry/libraryEvents";
import { playerEvents } from "./eventRegistry/playerEvents";
import { connectionEvents } from "./eventRegistry/connectionEvents";

export const logEventRegistry: LogEventRegistry = {
  ...playerEvents,
  ...libraryEvents,
  ...deckEvents,
  ...cardEvents,
  ...coinEvents,
  ...counterEvents,
  ...diceEvents,
  ...connectionEvents,
};
