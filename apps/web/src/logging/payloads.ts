import type {
  DuplicatePayload,
  MovePayload,
  PTPayload,
  RemoveCardPayload,
  TapPayload,
  TokenCreatePayload,
  TransformPayload,
  UntapAllPayload,
} from "./eventRegistry/cardEvents";
import type { CoinFlipPayload } from "./eventRegistry/coinEvents";
import type {
  CounterPayload,
  GlobalCounterPayload,
} from "./eventRegistry/counterEvents";
import type { DeckPayload } from "./eventRegistry/deckEvents";
import type { DiceRollPayload } from "./eventRegistry/diceEvents";
import type {
  DiscardPayload,
  DrawPayload,
  LibraryTopRevealPayload,
  LibraryViewPayload,
  ShufflePayload,
} from "./eventRegistry/libraryEvents";
import type {
  CommanderTaxPayload,
  LifePayload,
} from "./eventRegistry/playerEvents";

export type LogEventPayloadMap = {
  "player.life": LifePayload;
  "player.commanderTax": CommanderTaxPayload;
  "coin.flip": CoinFlipPayload;
  "dice.roll": DiceRollPayload;
  "card.draw": DrawPayload;
  "card.discard": DiscardPayload;
  "library.shuffle": ShufflePayload;
  "library.view": LibraryViewPayload;
  "library.topReveal": LibraryTopRevealPayload;
  "deck.reset": DeckPayload;
  "deck.unload": DeckPayload;
  "card.move": MovePayload;
  "card.tap": TapPayload;
  "card.untapAll": UntapAllPayload;
  "card.transform": TransformPayload;
  "card.duplicate": DuplicatePayload;
  "card.remove": RemoveCardPayload;
  "card.pt": PTPayload;
  "card.tokenCreate": TokenCreatePayload;
  "counter.add": CounterPayload;
  "counter.remove": CounterPayload;
  "counter.global.add": GlobalCounterPayload;
};
