import type { Card, GameState } from "@/types";

import { ZONE, isCommanderZoneType } from "@/constants/zones";
import { canMoveCard } from "@/rules/permissions";
import { logPermission } from "@/rules/logger";
import { emitLog } from "@/logging/logStore";
import type { LogEventPayloadMap } from "@/logging/types";
import { enforceZoneCounterRules } from "@/lib/counters";
import { resetCardToFrontFace } from "@/lib/cardDisplay";
import {
  moveCard as yMoveCard,
  patchCard as yPatchCard,
  removeCard as yRemoveCard,
  reorderZoneCards as yReorderZoneCards,
  sharedSnapshot,
} from "@/yjs/yMutations";
import { syncCommanderDecklistForPlayer } from "@/store/gameStore/actions/deck/commanderDecklist";
import {
  computeRevealPatchAfterMove,
  resolveControllerAfterMove,
  resolveFaceDownAfterMove,
} from "../movementModel";
import {
  moveCardIdBetweenZones,
  placeCardId,
  removeCardFromZones,
} from "../movementState";
import type { Deps, GetState, SetState } from "./types";
import { useCommandLog } from "@/lib/featureFlags";
import { enqueueLocalCommand, getActiveCommandLog, buildHiddenZonePayloads, buildLibraryTopRevealPayload } from "@/commandLog";
import { v4 as uuidv4 } from "uuid";
import { extractCardIdentity, stripCardIdentity } from "@/commandLog/identity";
import { encryptPayloadForRecipient, deriveSpectatorAesKey, encryptJsonPayload } from "@/commandLog/crypto";
import { generateX25519KeyPair } from "@/crypto/x25519";
import { getSessionAccessKeys } from "@/lib/sessionKeys";
import { base64UrlToBytes } from "@/crypto/base64url";

export const createMoveCardToBottom =
  (
    set: SetState,
    get: GetState,
    { applyShared, buildLogContext }: Deps
  ): GameState["moveCardToBottom"] =>
  (cardId, toZoneId, actorId, _isRemote) => {
    const actor = actorId ?? get().myPlayerId;
    const role = actor === get().myPlayerId ? get().viewerRole : "player";
    const snapshot = get();
    const card = snapshot.cards[cardId];
    if (!card) return;

    const fromZoneId = card.zoneId;
    const fromZone = snapshot.zones[fromZoneId];
    const toZone = snapshot.zones[toZoneId];
    if (!fromZone || !toZone) return;

    const nextControllerId = resolveControllerAfterMove(card, fromZone, toZone);
    const controlWillChange = nextControllerId !== card.controllerId;
    const permission = canMoveCard({
      actorId: actor,
      role,
      card,
      fromZone,
      toZone,
    });
    if (!permission.allowed) {
      logPermission({
        action: "moveCardToBottom",
        actorId: actor,
        allowed: false,
        reason: permission.reason,
        details: { cardId, fromZoneId, toZoneId },
      });
      return;
    }
    logPermission({
      action: "moveCardToBottom",
      actorId: actor,
      allowed: true,
      details: { cardId, fromZoneId, toZoneId },
    });

    const isCommanderDestination = isCommanderZoneType(toZone.type);
    const shouldMarkCommander =
      isCommanderDestination && card.ownerId === toZone.ownerId && !card.isCommander && !card.isToken;
    const shouldSyncCommander =
      shouldMarkCommander && actor === get().myPlayerId && card.ownerId === actor;

    const bothBattlefields =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type === ZONE.BATTLEFIELD;
    const sameBattlefield = bothBattlefields && fromZoneId === toZoneId;
    const controlShift = controlWillChange && toZone.type === ZONE.BATTLEFIELD;
    const faceDownResolution = resolveFaceDownAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      currentFaceDown: card.faceDown,
      requestedFaceDown: undefined,
    });
    const revealPatch = computeRevealPatchAfterMove({
      fromZoneType: fromZone.type,
      toZoneType: toZone.type,
      effectiveFaceDown: faceDownResolution.effectiveFaceDown,
    });

    if (!sameBattlefield) {
      const movePayload: LogEventPayloadMap["card.move"] = {
        actorId: actor,
        cardId,
        fromZoneId,
        toZoneId,
        cardName:
          toZone.type === ZONE.BATTLEFIELD && faceDownResolution.effectiveFaceDown
            ? "a card"
            : card.name,
        fromZoneType: fromZone.type,
        toZoneType: toZone.type,
        faceDown: faceDownResolution.effectiveFaceDown,
      };
      if (controlShift) movePayload.gainsControlBy = nextControllerId;
      emitLog("card.move", movePayload, buildLogContext());
    }

    if (useCommandLog) {
      const active = getActiveCommandLog();
      if (active) {
        const buildFaceDownPayloads = async (cardForPayload: Card) => {
          const identity = extractCardIdentity(cardForPayload);
          const payloadRecipientsEnc: Record<string, any> = {};
          const owner = get().players[cardForPayload.ownerId];
          if (owner?.encPubKey) {
            const recipientPubKey = base64UrlToBytes(owner.encPubKey);
            const ephemeral = generateX25519KeyPair();
            payloadRecipientsEnc[cardForPayload.ownerId] = await encryptPayloadForRecipient({
              payload: identity,
              recipientPubKey,
              ephemeralKeyPair: ephemeral,
              sessionId: active.sessionId,
            });
          }

          let payloadSpectatorEnc: string | undefined;
          const keys = getSessionAccessKeys(active.sessionId);
          if (keys.spectatorKey) {
            const spectatorKey = deriveSpectatorAesKey({
              spectatorKey: base64UrlToBytes(keys.spectatorKey),
              sessionId: active.sessionId,
            });
            payloadSpectatorEnc = await encryptJsonPayload(spectatorKey, identity);
          }

          return {
            payloadRecipientsEnc:
              Object.keys(payloadRecipientsEnc).length > 0 ? payloadRecipientsEnc : undefined,
            payloadSpectatorEnc,
          };
        };

        const isHidden = (zoneType: string) =>
          zoneType === ZONE.HAND || zoneType === ZONE.LIBRARY || zoneType === ZONE.SIDEBOARD;
        const fromHidden = isHidden(fromZone.type);
        const toHidden = isHidden(toZone.type);
        const shouldRevealToAllInHand =
          toHidden &&
          !fromHidden &&
          toZone.type === ZONE.HAND &&
          card.faceDown === false;

        let revealCardId: string | null = null;

        if (fromHidden || toHidden) {
          const queued: Array<{ zone: typeof fromZone; order: string[]; cards: Card[] }> = [];

          if (fromHidden) {
            const fromOrder = fromZone.cardIds.filter((id) => id !== cardId);
            const fromCards = fromOrder
              .map((id) => get().cards[id])
              .filter((c): c is Card => Boolean(c));
            queued.push({ zone: fromZone, order: fromOrder, cards: fromCards });
          }

          if (toHidden) {
            const shouldResetIdentity = !fromHidden;
            const nextCardId = shouldResetIdentity ? uuidv4() : cardId;
            if (shouldRevealToAllInHand) {
              revealCardId = nextCardId;
            }
            const toOrder = [nextCardId, ...toZone.cardIds.filter((id) => id !== cardId)];
            const visibility = {
              knownToAll: card.knownToAll ?? false,
              revealedToAll: card.revealedToAll ?? false,
              revealedTo: card.revealedTo ?? [],
            };
            if (revealPatch) {
              if ("knownToAll" in revealPatch) {
                visibility.knownToAll = revealPatch.knownToAll ?? false;
              }
              if ("revealedToAll" in revealPatch) {
                visibility.revealedToAll = revealPatch.revealedToAll ?? false;
              }
              if ("revealedTo" in revealPatch) {
                visibility.revealedTo = revealPatch.revealedTo ?? [];
              }
            }
            const movingCard = {
              ...resetCardToFrontFace(card),
              zoneId: toZone.id,
              id: nextCardId,
              controllerId: card.ownerId,
              faceDown: false,
              knownToAll: visibility.knownToAll,
              revealedToAll: visibility.revealedToAll,
              revealedTo: visibility.revealedTo,
              counters: enforceZoneCounterRules(card.counters, toZone),
              position: { x: 0, y: 0 },
              rotation: 0,
              customText: undefined,
            };
            const toCards = toOrder
              .map((id) => (id === nextCardId ? movingCard : get().cards[id]))
              .filter((c): c is Card => Boolean(c));
            queued.push({ zone: toZone, order: toOrder, cards: toCards });
          }

          for (const item of queued) {
            enqueueLocalCommand({
              sessionId: active.sessionId,
              commands: active.commands,
              type: "zone.set.hidden",
              buildPayloads: async () => {
                const payloads = await buildHiddenZonePayloads({
                  sessionId: active.sessionId,
                  ownerId: item.zone.ownerId,
                  zoneType: item.zone.type,
                  cards: item.cards,
                  order: item.order,
                });
                return {
                  payloadPublic: payloads.payloadPublic,
                  payloadOwnerEnc: payloads.payloadOwnerEnc,
                  payloadSpectatorEnc: payloads.payloadSpectatorEnc,
                };
              },
            });
          }

          const libraryUpdate = queued.find((item) => item.zone.type === ZONE.LIBRARY);
          if (
            libraryUpdate &&
            get().players[libraryUpdate.zone.ownerId]?.libraryTopReveal === "all"
          ) {
            const cardsById = Object.fromEntries(
              libraryUpdate.cards.map((c) => [c.id, c]),
            );
            enqueueLocalCommand({
              sessionId: active.sessionId,
              commands: active.commands,
              type: "library.topReveal.set",
              buildPayloads: () =>
                buildLibraryTopRevealPayload({
                  ownerId: libraryUpdate.zone.ownerId,
                  order: libraryUpdate.order,
                  cardsById,
                }),
            });
          }

          if (!toHidden) {
            const leavingBattlefield =
              fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;
            const resetToFront = leavingBattlefield ? resetCardToFrontFace(card) : card;
            const nextCounters = enforceZoneCounterRules(card.counters, toZone);
            const publicCard = {
              ...resetToFront,
              ...(revealPatch ?? {}),
              zoneId: toZoneId,
              tapped: toZone.type === ZONE.BATTLEFIELD ? card.tapped : false,
              counters: nextCounters,
              faceDown: faceDownResolution.effectiveFaceDown,
              controllerId: controlWillChange ? nextControllerId : resetToFront.controllerId,
              customText: leavingBattlefield ? undefined : resetToFront.customText,
            };
            const shouldHideIdentity =
              toZone.type === ZONE.BATTLEFIELD && faceDownResolution.effectiveFaceDown;
            enqueueLocalCommand({
              sessionId: active.sessionId,
              commands: active.commands,
              type: "card.create.public",
              buildPayloads: async () => {
                let payloadRecipientsEnc: Record<string, any> | undefined;
                let payloadSpectatorEnc: string | undefined;
                if (shouldHideIdentity) {
                  const payloads = await buildFaceDownPayloads(publicCard);
                  payloadRecipientsEnc = payloads.payloadRecipientsEnc;
                  payloadSpectatorEnc = payloads.payloadSpectatorEnc;
                }
                return {
                  payloadPublic: {
                    card: shouldHideIdentity ? stripCardIdentity(publicCard) : publicCard,
                  },
                  payloadRecipientsEnc,
                  payloadSpectatorEnc,
                };
              },
            });
          }

          if (!fromHidden) {
            enqueueLocalCommand({
              sessionId: active.sessionId,
              commands: active.commands,
              type: "card.remove.public",
              buildPayloads: () => ({
                payloadPublic: { cardId, zoneId: fromZoneId },
              }),
            });
          }

          if (shouldRevealToAllInHand && revealCardId) {
            enqueueLocalCommand({
              sessionId: active.sessionId,
              commands: active.commands,
              type: "card.reveal.set",
              buildPayloads: () => ({
                payloadPublic: {
                  cardId: revealCardId,
                  zoneId: toZone.id,
                  revealToAll: true,
                  identity: { ...extractCardIdentity(card), knownToAll: true },
                },
              }),
            });
          }

          return;
        }

        enqueueLocalCommand({
          sessionId: active.sessionId,
          commands: active.commands,
          type: "card.move.public",
          buildPayloads: async () => {
            const shouldHideIdentity =
              toZone.type === ZONE.BATTLEFIELD && faceDownResolution.effectiveFaceDown;
            let payloadRecipientsEnc: Record<string, any> | undefined;
            let payloadSpectatorEnc: string | undefined;
            if (shouldHideIdentity) {
              const payloads = await buildFaceDownPayloads(card);
              payloadRecipientsEnc = payloads.payloadRecipientsEnc;
              payloadSpectatorEnc = payloads.payloadSpectatorEnc;
            }
            return {
              payloadPublic: {
                cardId,
                fromZoneId,
                toZoneId,
                placement: "bottom",
                faceDown: faceDownResolution.effectiveFaceDown,
                controllerId: controlWillChange ? nextControllerId : undefined,
              },
              payloadRecipientsEnc,
              payloadSpectatorEnc,
            };
          },
        });
        const shouldRevealIdentity =
          card.faceDown === true &&
          faceDownResolution.effectiveFaceDown === false;
        if (shouldRevealIdentity) {
          enqueueLocalCommand({
            sessionId: active.sessionId,
            commands: active.commands,
            type: "card.update.public",
            buildPayloads: () => ({
              payloadPublic: {
                cardId,
                updates: {
                  knownToAll: true,
                  ...extractCardIdentity(card),
                },
              },
            }),
          });
        }
        return;
      }
    }

    applyShared((maps) => {
      const tokenLeavingBattlefield =
        card.isToken && toZone.type !== ZONE.BATTLEFIELD;
      if (tokenLeavingBattlefield) {
        yRemoveCard(maps, cardId);
        return;
      }

      yMoveCard(maps, cardId, toZoneId);

      if (fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD) {
        yPatchCard(maps, cardId, { customText: undefined });
      }

      if (shouldMarkCommander) {
        yPatchCard(maps, cardId, { isCommander: true });
      }

      if (controlWillChange) {
        yPatchCard(maps, cardId, { controllerId: nextControllerId });
      }

      if (faceDownResolution.patchFaceDown !== undefined) {
        yPatchCard(maps, cardId, { faceDown: faceDownResolution.patchFaceDown });
      }

      const snapshot = sharedSnapshot(maps);
      const toOrder = snapshot.zones[toZoneId]?.cardIds ?? [];
      const reordered = placeCardId(toOrder, cardId, "bottom");
      yReorderZoneCards(maps, toZoneId, reordered);

      if (revealPatch) {
        yPatchCard(maps, cardId, revealPatch);
      }
    });

    const leavingBattlefield =
      fromZone.type === ZONE.BATTLEFIELD && toZone.type !== ZONE.BATTLEFIELD;

    const tokenLeavingBattlefield =
      card.isToken && toZone.type !== ZONE.BATTLEFIELD;
    if (tokenLeavingBattlefield) {
      set((state) => {
        const nextCards = { ...state.cards };
        Reflect.deleteProperty(nextCards, cardId);
        return {
          cards: nextCards,
          zones: removeCardFromZones(state.zones, cardId, [fromZoneId, toZoneId]),
        };
      });
      return;
    }

    set((state) => {
      const cardsCopy = { ...state.cards };

      const nextTapped = toZone.type === ZONE.BATTLEFIELD ? card.tapped : false;
      const nextCounters = enforceZoneCounterRules(card.counters, toZone);
      const resetToFront = resetCardToFrontFace(card);
      const nextCommanderFlag = shouldMarkCommander ? true : card.isCommander;

      const nextCard = leavingBattlefield ? resetToFront : card;
      cardsCopy[cardId] = {
        ...nextCard,
        zoneId: toZoneId,
        tapped: nextTapped,
        counters: nextCounters,
        faceDown: faceDownResolution.effectiveFaceDown,
        controllerId: controlWillChange ? nextControllerId : nextCard.controllerId,
        ...(revealPatch ?? {}),
        isCommander: nextCommanderFlag,
        customText: leavingBattlefield ? undefined : nextCard.customText,
      };

      return {
        cards: cardsCopy,
        zones: moveCardIdBetweenZones({
          zones: state.zones,
          cardId,
          fromZoneId,
          toZoneId,
          placement: "bottom",
        }),
      };
    });

    if (shouldSyncCommander) {
      syncCommanderDecklistForPlayer({
        state: get(),
        playerId: actor,
        override: { cardId: card.id, isCommander: true, name: card.name, ownerId: card.ownerId },
      });
    }
  };
