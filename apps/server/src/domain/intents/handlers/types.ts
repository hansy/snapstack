import type {
  HiddenReveal,
  HiddenState,
  Intent,
  InnerApplyResult,
  Maps,
} from "../../types";

export type IntentHandlerContext = {
  intent: Intent;
  payload: Record<string, unknown>;
  actorId: string;
  maps: Maps;
  hidden: HiddenState;
  pushLogEvent: (eventId: string, payload: Record<string, unknown>) => void;
  markHiddenChanged: (impact?: {
    ownerId?: string;
    zoneId?: string;
    reveal?: HiddenReveal;
    prevReveal?: HiddenReveal;
  }) => void;
};

export type IntentHandler = (context: IntentHandlerContext) => InnerApplyResult;
