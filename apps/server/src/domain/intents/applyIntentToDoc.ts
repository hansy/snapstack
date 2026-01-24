import type * as Y from "yjs";

import type {
  ApplyResult,
  HiddenReveal,
  HiddenState,
  InnerApplyResult,
  Intent,
  LogEvent,
} from "../types";
import { getMaps } from "../yjsStore";
import { getIntentHandler } from "./handlers";
import { readActorId, readPayload } from "./validation";

const PUBLIC_DOC_NOOP_INTENTS = new Set([
  "library.view",
  "library.view.close",
  "library.view.ping",
  "coin.flip",
  "dice.roll",
]);

export const applyIntentToDoc = (doc: Y.Doc, intent: Intent, hidden: HiddenState): ApplyResult => {
  if (!intent || typeof intent.type !== "string") {
    return { ok: false, error: "invalid intent" };
  }
  const payload = readPayload(intent.payload);
  const actorId = readActorId(payload);
  const maps = getMaps(doc);
  const logEvents: LogEvent[] = [];
  let hiddenChanged = false;
  const changedOwners = new Set<string>();
  const changedZones = new Set<string>();
  const changedRevealPlayers = new Set<string>();
  let changedRevealAll = false;
  let changedPublicDoc = false;
  const pushLogEvent = (eventId: string, logPayload: Record<string, unknown>) => {
    logEvents.push({ eventId, payload: logPayload });
  };
  const markHiddenChanged = (impact?: {
    ownerId?: string;
    zoneId?: string;
    reveal?: HiddenReveal;
    prevReveal?: HiddenReveal;
  }) => {
    hiddenChanged = true;
    const hasScope = Boolean(
      impact?.ownerId || impact?.zoneId || impact?.reveal || impact?.prevReveal
    );
    if (!hasScope) {
      changedRevealAll = true;
    }
    if (impact?.ownerId) changedOwners.add(impact.ownerId);
    if (impact?.zoneId) changedZones.add(impact.zoneId);
    const revealScopes = [impact?.reveal, impact?.prevReveal].filter(
      Boolean
    ) as HiddenReveal[];
    for (const reveal of revealScopes) {
      if (reveal?.toAll) changedRevealAll = true;
      if (Array.isArray(reveal?.toPlayers)) {
        reveal.toPlayers.forEach((playerId) => {
          if (typeof playerId === "string") changedRevealPlayers.add(playerId);
        });
      }
    }
  };

  const apply = (): InnerApplyResult => {
    if (!actorId) return { ok: false, error: "missing actor" };
    const handler = getIntentHandler(intent.type);
    if (!handler) return { ok: false, error: `unhandled intent: ${intent.type}` };
    return handler({ intent, payload, actorId, maps, hidden, pushLogEvent, markHiddenChanged });
  };

  try {
    let result: InnerApplyResult = { ok: false, error: "unknown" };
    doc.transact(() => {
      result = apply();
    });
    if (result.ok) {
      if (!changedPublicDoc) {
        changedPublicDoc = !PUBLIC_DOC_NOOP_INTENTS.has(intent.type);
      }
      const impact = {
        changedOwners: Array.from(changedOwners),
        changedZones: Array.from(changedZones),
        changedRevealScopes: {
          toAll: changedRevealAll,
          toPlayers: Array.from(changedRevealPlayers),
        },
        changedPublicDoc,
      };
      return {
        ok: true,
        logEvents,
        ...(hiddenChanged ? { hiddenChanged: true } : null),
        impact,
      };
    }
    return result;
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "intent failed" };
  }
};
