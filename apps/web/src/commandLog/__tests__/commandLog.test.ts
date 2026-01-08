import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { ZONE } from "@/constants/zones";
import { bytesToBase64Url } from "@/crypto/base64url";
import { generateEd25519KeyPair } from "@/crypto/ed25519";
import { generateX25519KeyPair } from "@/crypto/x25519";

import { appendCommand, deriveActorIdFromPublicKey } from "../commands";
import { deriveOwnerAesKey, encryptJsonPayload, encryptPayloadForRecipient } from "../crypto";
import { appendSnapshot, validateSnapshot } from "../snapshots";
import {
  applyCommandLog,
  createCommandLogMeta,
  createEmptyCommandLogState,
} from "../replay";
import type { CommandEnvelope, SignedSnapshot, SignedSnapshotUnsigned } from "../types";
import { INITIAL_LOG_HASH_HEX } from "../logHash";

const buildContext = (params: { sessionId: string; viewerId: string; playerKey: Uint8Array }) => ({
  sessionId: params.sessionId,
  viewerId: params.viewerId,
  viewerRole: "player" as const,
  playerKey: params.playerKey,
  ownerAesKey: undefined,
  spectatorAesKey: undefined,
  recipientPrivateKey: undefined as Uint8Array | undefined,
});

describe("command log", () => {
  it("replays deterministically from the same log", async () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const actorId = deriveActorIdFromPublicKey(publicKey);
    const sessionId = "session-1";
    const playerKey = new Uint8Array(32).fill(1);

    const doc = new Y.Doc();
    const commands = doc.getArray<CommandEnvelope>("commands");

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: privateKey,
      envelope: {
        v: 1,
        id: "cmd-1",
        actorId,
        seq: 1,
        ts: 1,
        type: "player.join",
        payloadPublic: { playerId: actorId, name: "Player" },
        pubKey: bytesToBase64Url(publicKey),
      },
    });

    const zoneId = `${actorId}-${ZONE.BATTLEFIELD}`;
    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: privateKey,
      envelope: {
        v: 1,
        id: "cmd-2",
        actorId,
        seq: 2,
        ts: 2,
        type: "card.create.public",
        payloadPublic: {
          card: {
            id: "card-1",
            ownerId: actorId,
            controllerId: actorId,
            zoneId,
            name: "Test Card",
            tapped: false,
            faceDown: false,
            position: { x: 0, y: 0 },
            rotation: 0,
            counters: [],
          },
        },
        pubKey: bytesToBase64Url(publicKey),
      },
    });

    const replayOnce = async () => {
      let state = createEmptyCommandLogState();
      let meta = createCommandLogMeta();
      const ctx = buildContext({ sessionId, viewerId: actorId, playerKey });
      for (let i = 0; i < commands.length; i += 1) {
        const envelope = commands.get(i) as CommandEnvelope;
        const result = await applyCommandLog({ state, meta, envelope, ctx });
        state = result.state;
        meta = result.meta;
      }
      return state;
    };

    const state1 = await replayOnce();
    const state2 = await replayOnce();
    expect(state1).toEqual(state2);
  });

  it("applies selective reveal payloads for recipients", async () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const actorId = deriveActorIdFromPublicKey(publicKey);
    const sessionId = "session-2";
    const playerKey = new Uint8Array(32).fill(2);

    const recipient = generateX25519KeyPair();
    const recipientId = "recipient";

    const doc = new Y.Doc();
    const commands = doc.getArray<CommandEnvelope>("commands");

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: privateKey,
      envelope: {
        v: 1,
        id: "cmd-r1",
        actorId,
        seq: 1,
        ts: 1,
        type: "player.join",
        payloadPublic: { playerId: actorId, name: "Player" },
        pubKey: bytesToBase64Url(publicKey),
      },
    });

    const zoneId = `${actorId}-${ZONE.HAND}`;
    const identity = { name: "Secret Card" };
    const recipientsEnc = {
      [recipientId]: await encryptPayloadForRecipient({
        payload: identity,
        recipientPubKey: recipient.publicKey,
        ephemeralKeyPair: generateX25519KeyPair(),
        sessionId,
      }),
    };

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: privateKey,
      envelope: {
        v: 1,
        id: "cmd-r2",
        actorId,
        seq: 2,
        ts: 2,
        type: "card.reveal.set",
        payloadPublic: {
          cardId: "card-secret",
          zoneId,
          revealToAll: false,
          revealTo: [recipientId],
        },
        payloadRecipientsEnc: recipientsEnc,
        pubKey: bytesToBase64Url(publicKey),
      },
    });

    let state = createEmptyCommandLogState();
    let meta = createCommandLogMeta();
    const ctx = {
      sessionId,
      viewerId: recipientId,
      viewerRole: "player" as const,
      playerKey,
      ownerAesKey: undefined,
      spectatorAesKey: undefined,
      recipientPrivateKey: recipient.privateKey,
    };

    for (let i = 0; i < commands.length; i += 1) {
      const envelope = commands.get(i) as CommandEnvelope;
      const result = await applyCommandLog({ state, meta, envelope, ctx });
      state = result.state;
      meta = result.meta;
    }

    expect(state.cards["card-secret"]?.name).toBe("Secret Card");
  });

  it("signs and validates snapshots", async () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const actorId = deriveActorIdFromPublicKey(publicKey);
    const sessionId = "session-3";
    const playerKey = new Uint8Array(32).fill(3);
    const ownerKey = new Uint8Array(32).fill(9);
    const ownerAesKey = deriveOwnerAesKey({ ownerKey, sessionId });

    const publicState = createEmptyCommandLogState();
    publicState.players[actorId] = {
      id: actorId,
      name: "Player",
      life: 40,
      counters: [],
      commanderDamage: {},
      commanderTax: 0,
      deckLoaded: false,
    };

    const ownerState = {
      ...publicState,
      cards: {
        "card-1": {
          id: "card-1",
          ownerId: actorId,
          controllerId: actorId,
          zoneId: `${actorId}-${ZONE.HAND}`,
          name: "Hidden",
          tapped: false,
          faceDown: false,
          position: { x: 0, y: 0 },
          rotation: 0,
          counters: [],
        },
      },
    };

    const ownerEnc = await encryptJsonPayload(ownerAesKey, ownerState);

    const snapshot: SignedSnapshotUnsigned = {
      v: 1,
      id: "snap-1",
      actorId,
      seq: 1,
      ts: 1,
      upToIndex: 0,
      logHash: INITIAL_LOG_HASH_HEX,
      publicState,
      ownerEncByPlayer: { [actorId]: ownerEnc },
      pubKey: bytesToBase64Url(publicKey),
    };

    const doc = new Y.Doc();
    const snapshots = doc.getArray<SignedSnapshot>("snapshots");
    const signed = appendSnapshot({
      snapshots,
      snapshot,
      sessionId,
      playerKey,
      signPrivateKey: privateKey,
    });

    const validation = validateSnapshot({
      snapshot: signed,
      sessionId,
      playerKey,
      expectedActorId: actorId,
    });
    expect(validation.ok).toBe(true);

    const tampered = {
      ...signed,
      publicState: {
        ...(signed.publicState as Record<string, unknown>),
        roomLockedByHost: true,
      },
    } as typeof signed;
    const tamperedValidation = validateSnapshot({
      snapshot: tampered,
      sessionId,
      playerKey,
      expectedActorId: actorId,
    });
    expect(tamperedValidation.ok).toBe(false);
  });

  it("ignores join commands when actor does not match playerId", async () => {
    const actorAKeys = generateEd25519KeyPair();
    const actorBKeys = generateEd25519KeyPair();
    const actorA = deriveActorIdFromPublicKey(actorAKeys.publicKey);
    const actorB = deriveActorIdFromPublicKey(actorBKeys.publicKey);
    const sessionId = "session-4";
    const playerKey = new Uint8Array(32).fill(4);

    const doc = new Y.Doc();
    const commands = doc.getArray<CommandEnvelope>("commands");

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: actorAKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-j1",
        actorId: actorA,
        seq: 1,
        ts: 1,
        type: "player.join",
        payloadPublic: { playerId: actorA, name: "A" },
        pubKey: bytesToBase64Url(actorAKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: actorAKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-j2",
        actorId: actorA,
        seq: 2,
        ts: 2,
        type: "player.join",
        payloadPublic: { playerId: actorB, name: "B" },
        pubKey: bytesToBase64Url(actorAKeys.publicKey),
      },
    });

    let state = createEmptyCommandLogState();
    let meta = createCommandLogMeta();
    const ctx = buildContext({ sessionId, viewerId: actorA, playerKey });
    for (let i = 0; i < commands.length; i += 1) {
      const envelope = commands.get(i) as CommandEnvelope;
      const result = await applyCommandLog({ state, meta, envelope, ctx });
      state = result.state;
      meta = result.meta;
    }

    expect(state.players[actorA]).toBeTruthy();
    expect(state.players[actorB]).toBeUndefined();
  });

  it("ignores leave commands when actor does not match playerId", async () => {
    const actorAKeys = generateEd25519KeyPair();
    const actorBKeys = generateEd25519KeyPair();
    const actorA = deriveActorIdFromPublicKey(actorAKeys.publicKey);
    const actorB = deriveActorIdFromPublicKey(actorBKeys.publicKey);
    const sessionId = "session-4b";
    const playerKey = new Uint8Array(32).fill(6);

    const doc = new Y.Doc();
    const commands = doc.getArray<CommandEnvelope>("commands");

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: actorAKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-l1",
        actorId: actorA,
        seq: 1,
        ts: 1,
        type: "player.join",
        payloadPublic: { playerId: actorA, name: "A" },
        pubKey: bytesToBase64Url(actorAKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: actorBKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-l2",
        actorId: actorB,
        seq: 1,
        ts: 2,
        type: "player.join",
        payloadPublic: { playerId: actorB, name: "B" },
        pubKey: bytesToBase64Url(actorBKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: actorAKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-l3",
        actorId: actorA,
        seq: 2,
        ts: 3,
        type: "player.leave",
        payloadPublic: { playerId: actorB },
        pubKey: bytesToBase64Url(actorAKeys.publicKey),
      },
    });

    let state = createEmptyCommandLogState();
    let meta = createCommandLogMeta();
    const ctx = buildContext({ sessionId, viewerId: actorA, playerKey });
    for (let i = 0; i < commands.length; i += 1) {
      const envelope = commands.get(i) as CommandEnvelope;
      const result = await applyCommandLog({ state, meta, envelope, ctx });
      state = result.state;
      meta = result.meta;
    }

    expect(state.players[actorA]).toBeTruthy();
    expect(state.players[actorB]).toBeTruthy();
  });

  it("rejects non-owner commands for hidden zones and visibility", async () => {
    const ownerKeys = generateEd25519KeyPair();
    const attackerKeys = generateEd25519KeyPair();
    const ownerId = deriveActorIdFromPublicKey(ownerKeys.publicKey);
    const attackerId = deriveActorIdFromPublicKey(attackerKeys.publicKey);
    const sessionId = "session-5";
    const playerKey = new Uint8Array(32).fill(5);

    const doc = new Y.Doc();
    const commands = doc.getArray<CommandEnvelope>("commands");

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: ownerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-o1",
        actorId: ownerId,
        seq: 1,
        ts: 1,
        type: "player.join",
        payloadPublic: { playerId: ownerId, name: "Owner" },
        pubKey: bytesToBase64Url(ownerKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: attackerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-a1",
        actorId: attackerId,
        seq: 1,
        ts: 2,
        type: "player.join",
        payloadPublic: { playerId: attackerId, name: "Attacker" },
        pubKey: bytesToBase64Url(attackerKeys.publicKey),
      },
    });

    const libraryZoneId = `${ownerId}-${ZONE.LIBRARY}`;
    const handZoneId = `${ownerId}-${ZONE.HAND}`;
    const battlefieldZoneId = `${ownerId}-${ZONE.BATTLEFIELD}`;

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: ownerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-o2",
        actorId: ownerId,
        seq: 2,
        ts: 3,
        type: "card.create.public",
        payloadPublic: {
          card: {
            id: "lib-1",
            ownerId,
            controllerId: ownerId,
            zoneId: libraryZoneId,
            name: "Library Card",
            tapped: false,
            faceDown: false,
            position: { x: 0, y: 0 },
            rotation: 0,
            counters: [],
          },
        },
        pubKey: bytesToBase64Url(ownerKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: ownerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-o3",
        actorId: ownerId,
        seq: 3,
        ts: 4,
        type: "card.create.public",
        payloadPublic: {
          card: {
            id: "hand-1",
            ownerId,
            controllerId: ownerId,
            zoneId: handZoneId,
            name: "Hand Card",
            tapped: false,
            faceDown: false,
            position: { x: 0, y: 0 },
            rotation: 0,
            counters: [],
          },
        },
        pubKey: bytesToBase64Url(ownerKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: ownerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-o4",
        actorId: ownerId,
        seq: 4,
        ts: 5,
        type: "card.create.public",
        payloadPublic: {
          card: {
            id: "battle-1",
            ownerId,
            controllerId: ownerId,
            zoneId: battlefieldZoneId,
            name: "Battlefield Card",
            tapped: true,
            faceDown: false,
            position: { x: 0, y: 0 },
            rotation: 0,
            counters: [],
          },
        },
        pubKey: bytesToBase64Url(ownerKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: attackerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-a2",
        actorId: attackerId,
        seq: 2,
        ts: 6,
        type: "card.draw",
        payloadPublic: { ownerId, count: 1 },
        pubKey: bytesToBase64Url(attackerKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: attackerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-a3",
        actorId: attackerId,
        seq: 3,
        ts: 7,
        type: "library.shuffle",
        payloadPublic: { ownerId, count: 1 },
        pubKey: bytesToBase64Url(attackerKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: attackerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-a4",
        actorId: attackerId,
        seq: 4,
        ts: 8,
        type: "card.reveal.set",
        payloadPublic: {
          cardId: "hand-1",
          zoneId: handZoneId,
          revealToAll: true,
          identity: { name: "Revealed" },
        },
        pubKey: bytesToBase64Url(attackerKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: attackerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-a5",
        actorId: attackerId,
        seq: 5,
        ts: 9,
        type: "card.untapAll",
        payloadPublic: { playerId: ownerId },
        pubKey: bytesToBase64Url(attackerKeys.publicKey),
      },
    });

    appendCommand({
      commands,
      sessionId,
      playerKey,
      signPrivateKey: attackerKeys.privateKey,
      envelope: {
        v: 1,
        id: "cmd-a6",
        actorId: attackerId,
        seq: 6,
        ts: 10,
        type: "library.topReveal.set",
        payloadPublic: { ownerId, mode: "all", cardId: "lib-1", identity: { name: "Top" } },
        pubKey: bytesToBase64Url(attackerKeys.publicKey),
      },
    });

    const replay = async (limit: number) => {
      let state = createEmptyCommandLogState();
      let meta = createCommandLogMeta();
      const ctx = buildContext({ sessionId, viewerId: ownerId, playerKey });
      for (let i = 0; i < limit; i += 1) {
        const envelope = commands.get(i) as CommandEnvelope;
        const result = await applyCommandLog({ state, meta, envelope, ctx });
        state = result.state;
        meta = result.meta;
      }
      return state;
    };

    const stateValid = await replay(5);
    const stateWithInvalid = await replay(commands.length);

    expect(stateWithInvalid).toEqual(stateValid);
  });
});
