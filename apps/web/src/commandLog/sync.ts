import type * as Y from "yjs";

import type { ViewerRole } from "@/types";
import { v4 as uuidv4 } from "uuid";

import type { CommandEnvelope, SignedSnapshot, SignedSnapshotUnsigned } from "./types";
import {
  applyCommandLog,
  createCommandLogContext,
  createCommandLogMeta,
  createEmptyCommandLogState,
  type CommandLogState,
} from "./replay";
import {
  appendSnapshot,
  validateSnapshot,
  validateSnapshotRoomSig,
} from "./snapshots";
import { computeNextLogHashHex, INITIAL_LOG_HASH_HEX } from "./logHash";
import {
  validateCommand,
  validateCommandRoomSig,
} from "./commands";
import { base64UrlToBytes } from "@/crypto/base64url";
import { decryptJsonPayload, deriveOwnerAesKey, deriveSpectatorAesKey, encryptJsonPayload } from "./crypto";
import { getSessionAccessKeys } from "@/lib/sessionKeys";
import { getOrCreateSessionIdentity, getSessionIdentityBytes } from "@/lib/sessionIdentity";
import { getNextCommandSeq } from "./localWriter";

type CommandLogSyncParams = {
  sessionId: string;
  commands: Y.Array<CommandEnvelope>;
  snapshots?: Y.Array<SignedSnapshot>;
  getViewerRole: () => ViewerRole;
  getViewerId: () => string;
  setState: (next: CommandLogState) => void;
};

const computeCommandMetaUpToIndex = (params: {
  commands: Y.Array<CommandEnvelope>;
  sessionId: string;
  playerKey?: Uint8Array;
  roomSigPublicKey?: Uint8Array;
  upToIndex: number;
}): { logHash: string; lastSeqByActor: Record<string, number> } => {
  const lastSeqByActor: Record<string, number> = {};
  let logHash = INITIAL_LOG_HASH_HEX;
  for (let i = 0; i < params.upToIndex; i += 1) {
    const envelope = params.commands.get(i) as CommandEnvelope | undefined;
    if (!envelope) continue;
    const expectedSeq = (lastSeqByActor[envelope.actorId] ?? 0) + 1;
    let valid = false;
    if (params.playerKey) {
      const validation = validateCommand({
        envelope,
        sessionId: params.sessionId,
        playerKey: params.playerKey,
        expectedSeq,
      });
      valid = validation.ok;
    } else if (params.roomSigPublicKey) {
      const validation = validateCommandRoomSig({
        envelope,
        roomPublicKey: params.roomSigPublicKey,
        expectedSeq,
      });
      valid = validation.ok;
    }

    if (valid) {
      lastSeqByActor[envelope.actorId] = envelope.seq;
      logHash = computeNextLogHashHex({ prevLogHash: logHash, envelope });
    }
  }
  return { logHash, lastSeqByActor };
};

export const createCommandLogSync = (params: CommandLogSyncParams) => {
  let state = createEmptyCommandLogState();
  let meta = createCommandLogMeta();
  let lastViewerRole: ViewerRole | null = null;
  let lastViewerId: string | null = null;
  let applyQueue = Promise.resolve();
  let lastSnapshotAt = 0;
  let lastSnapshotIndex = 0;

  const buildContext = () =>
    createCommandLogContext({
      sessionId: params.sessionId,
      viewerId: params.getViewerId(),
      viewerRole: params.getViewerRole(),
    });

  const replayCommands = async (ctx: ReturnType<typeof createCommandLogContext>, upToIndex?: number) => {
    let replayState = createEmptyCommandLogState();
    let replayMeta = createCommandLogMeta();
    const limit = upToIndex ?? params.commands.length;
    for (let i = 0; i < limit; i += 1) {
      const envelope = params.commands.get(i) as CommandEnvelope | undefined;
      if (!envelope) continue;
      const result = await applyCommandLog({
        state: replayState,
        meta: replayMeta,
        envelope,
        ctx,
      });
      replayState = result.state;
      replayMeta = result.meta;
      replayMeta.lastAppliedIndex = i + 1;
    }
    return { state: replayState, meta: replayMeta };
  };

  const reset = () => {
    state = createEmptyCommandLogState();
    meta = createCommandLogMeta();
  };

  const applyFromIndex = async (startIndex: number) => {
    const ctx = buildContext();
    for (let i = startIndex; i < params.commands.length; i += 1) {
      const envelope = params.commands.get(i) as CommandEnvelope | undefined;
      if (!envelope) continue;
      const result = await applyCommandLog({ state, meta, envelope, ctx });
      state = result.state;
      meta = result.meta;
      meta.lastAppliedIndex = i + 1;
    }
    params.setState(state);
  };

  const ensureViewerContext = () => {
    const viewerRole = params.getViewerRole();
    const viewerId = params.getViewerId();
    if (viewerRole !== lastViewerRole || viewerId !== lastViewerId) {
      lastViewerRole = viewerRole;
      lastViewerId = viewerId;
      reset();
    }
  };

  const loadSnapshot = async (): Promise<{ state: CommandLogState; meta: ReturnType<typeof createCommandLogMeta> } | null> => {
    if (!params.snapshots || params.snapshots.length === 0) return null;
    const viewerRole = params.getViewerRole();
    const viewerId = params.getViewerId();
    const ctx = buildContext();
    const playerKey = ctx.playerKey;
    const roomSigPublicKey = ctx.roomSigPublicKey;
    const snapshots = params.snapshots.toArray() as SignedSnapshot[];
    const sorted = [...snapshots].sort((a, b) => {
      if (b.upToIndex !== a.upToIndex) return b.upToIndex - a.upToIndex;
      return (b.ts ?? 0) - (a.ts ?? 0);
    });

    for (const snapshot of sorted) {
      if (snapshot.upToIndex > params.commands.length) continue;
      let valid = false;
      if (playerKey) {
        const validation = validateSnapshot({
          snapshot,
          sessionId: params.sessionId,
          playerKey,
        });
        valid = validation.ok;
      } else if (roomSigPublicKey) {
        const validation = validateSnapshotRoomSig({
          snapshot,
          roomPublicKey: roomSigPublicKey,
        });
        valid = validation.ok;
      }
      if (!valid) continue;

      const metaAtIndex = computeCommandMetaUpToIndex({
        commands: params.commands,
        sessionId: params.sessionId,
        playerKey,
        roomSigPublicKey,
        upToIndex: snapshot.upToIndex,
      });
      if (metaAtIndex.logHash !== snapshot.logHash) continue;

      let snapshotState: CommandLogState | null = null;
      try {
        if (viewerRole === "spectator") {
          if (!snapshot.spectatorEnc || !ctx.spectatorAesKey) continue;
          snapshotState = (await decryptJsonPayload(
            ctx.spectatorAesKey,
            snapshot.spectatorEnc,
          )) as CommandLogState;
        } else {
          const ownerEnc = snapshot.ownerEncByPlayer?.[viewerId];
          if (!ownerEnc || !ctx.ownerAesKey) continue;
          snapshotState = (await decryptJsonPayload(
            ctx.ownerAesKey,
            ownerEnc,
          )) as CommandLogState;
        }
      } catch (_err) {
        snapshotState = null;
      }

      if (!snapshotState) continue;

      const nextMeta = createCommandLogMeta();
      nextMeta.lastAppliedIndex = snapshot.upToIndex;
      nextMeta.logHash = snapshot.logHash;
      nextMeta.lastSeqByActor = metaAtIndex.lastSeqByActor;

      return { state: snapshotState, meta: nextMeta };
    }

    return null;
  };

  const maybeEmitSnapshot = async () => {
    try {
      if (!params.snapshots) return;
      if (params.getViewerRole() === "spectator") return;
      const commandsLength = params.commands.length;
      if (commandsLength === 0) return;
      if (meta.lastAppliedIndex !== commandsLength) return;

      const now = Date.now();
      const SNAPSHOT_COMMAND_INTERVAL = 200;
      const SNAPSHOT_TIME_INTERVAL_MS = 60_000;
      if (
        commandsLength - lastSnapshotIndex < SNAPSHOT_COMMAND_INTERVAL &&
        now - lastSnapshotAt < SNAPSHOT_TIME_INTERVAL_MS
      ) {
        return;
      }

      const keys = getSessionAccessKeys(params.sessionId);
      if (!keys.playerKey) return;

      const identity = getOrCreateSessionIdentity(params.sessionId);
      const identityBytes = getSessionIdentityBytes(params.sessionId);
      if (!identityBytes.signPrivateKey || !identityBytes.ownerKey) return;

      const playerKey = base64UrlToBytes(keys.playerKey);
      const ownerAesKey = deriveOwnerAesKey({
        ownerKey: identityBytes.ownerKey,
        sessionId: params.sessionId,
      });
      const spectatorKeyBytes = keys.spectatorKey
        ? base64UrlToBytes(keys.spectatorKey)
        : undefined;
      const spectatorAesKey = spectatorKeyBytes
        ? deriveSpectatorAesKey({
            spectatorKey: spectatorKeyBytes,
            sessionId: params.sessionId,
          })
        : undefined;

      const baseCtx = createCommandLogContext({
        sessionId: params.sessionId,
        viewerId: identity.playerId,
        viewerRole: "player",
      });
      const publicCtx = {
        ...baseCtx,
        viewerId: "__public__",
        viewerRole: "spectator" as ViewerRole,
        ownerAesKey: undefined,
        spectatorAesKey: undefined,
        recipientPrivateKey: undefined,
      };
      const ownerCtx = baseCtx;
      const spectatorCtx = spectatorAesKey
        ? {
            ...baseCtx,
            viewerId: "__spectator__",
            viewerRole: "spectator" as ViewerRole,
            ownerAesKey: undefined,
            spectatorAesKey,
            recipientPrivateKey: undefined,
          }
        : null;

      const publicReplay = await replayCommands(publicCtx);
      const ownerReplay = await replayCommands(ownerCtx);
      const spectatorReplay = spectatorCtx ? await replayCommands(spectatorCtx) : null;

      const ownerEnc = await encryptJsonPayload(ownerAesKey, ownerReplay.state);
      const spectatorEnc =
        spectatorAesKey && spectatorReplay
          ? await encryptJsonPayload(spectatorAesKey, spectatorReplay.state)
          : undefined;

      const snapshot: SignedSnapshotUnsigned = {
        v: 1,
        id: uuidv4(),
        actorId: identity.playerId,
        seq: getNextCommandSeq(params.commands, identity.playerId),
        ts: now,
        upToIndex: publicReplay.meta.lastAppliedIndex,
        logHash: publicReplay.meta.logHash,
        publicState: publicReplay.state,
        ownerEncByPlayer: {
          [identity.playerId]: ownerEnc,
        },
        spectatorEnc,
        pubKey: identity.signPublicKey,
      };

      appendSnapshot({
        snapshots: params.snapshots,
        snapshot,
        sessionId: params.sessionId,
        playerKey,
        signPrivateKey: identityBytes.signPrivateKey,
      });

      lastSnapshotAt = now;
      lastSnapshotIndex = commandsLength;

      const current = params.snapshots.toArray() as SignedSnapshot[];
      const keepIds = new Set<string>();
      const byActor: Record<string, SignedSnapshot[]> = {};
      current.forEach((snap) => {
        (byActor[snap.actorId] ??= []).push(snap);
      });
      Object.values(byActor).forEach((snaps) => {
        snaps
          .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
          .slice(0, 3)
          .forEach((snap) => keepIds.add(snap.id));
      });

      for (let i = params.snapshots.length - 1; i >= 0; i -= 1) {
        const snap = params.snapshots.get(i) as SignedSnapshot | undefined;
        if (!snap || keepIds.has(snap.id)) continue;
        params.snapshots.delete(i, 1);
      }
    } catch (err) {
      console.warn("[command-log] failed to emit snapshot", err);
    }
  };

  const fullSync = () => {
    applyQueue = applyQueue.then(async () => {
      ensureViewerContext();
      reset();
      const snapshotResult = await loadSnapshot();
      if (snapshotResult) {
        state = snapshotResult.state;
        meta = snapshotResult.meta;
      }
      await applyFromIndex(meta.lastAppliedIndex);
      await maybeEmitSnapshot();
    });
    return applyQueue;
  };

  const applyNewCommands = () => {
    applyQueue = applyQueue.then(async () => {
      ensureViewerContext();
      if (params.commands.length < meta.lastAppliedIndex) {
        reset();
        const snapshotResult = await loadSnapshot();
        if (snapshotResult) {
          state = snapshotResult.state;
          meta = snapshotResult.meta;
        }
      }
      await applyFromIndex(meta.lastAppliedIndex);
      await maybeEmitSnapshot();
    });
    return applyQueue;
  };

  return { fullSync, applyNewCommands, reset };
};
