import type {
  DuplicatePayload,
  FaceUpPayload,
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
import type {
  ConnectionAuthFailurePayload,
  ConnectionReconnectAbandonedPayload,
  ConnectionReconnectPayload,
} from "./eventRegistry/connectionEvents";

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
  "card.faceUp": FaceUpPayload;
  "card.transform": TransformPayload;
  "card.duplicate": DuplicatePayload;
  "card.remove": RemoveCardPayload;
  "card.pt": PTPayload;
  "card.tokenCreate": TokenCreatePayload;
  "counter.add": CounterPayload;
  "counter.remove": CounterPayload;
  "counter.global.add": GlobalCounterPayload;
  "connection.reconnect": ConnectionReconnectPayload;
  "connection.reconnectAbandoned": ConnectionReconnectAbandonedPayload;
  "connection.authFailure": ConnectionAuthFailurePayload;
};
