import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { GameState } from '@/types';
import type { SharedMaps } from '@/yjs/yMutations';

import { createSafeStorage } from '@/lib/safeStorage';
import { runWithSharedDoc } from '@/yjs/docManager';
import { isApplyingRemoteUpdate } from '@/yjs/sync';

import { createCardActions } from './gameStore/actions/cards';
import { createCounterActions } from './gameStore/actions/counters';
import { createDeckActions } from './gameStore/actions/deck';
import { createMovementActions } from './gameStore/actions/movement';
import { createPlayerActions } from './gameStore/actions/players';
import { createRoomActions } from './gameStore/actions/room';
import { createSessionActions } from './gameStore/actions/session';
import { createUiActions } from './gameStore/actions/ui';
import { createZoneActions } from './gameStore/actions/zones';

interface GameStore extends GameState {
    // Additional actions or computed properties can go here
}

type PersistedGameStoreState = Pick<GameStore, 'playerIdsBySession' | 'sessionVersions'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const readStringRecord = (value: unknown): Record<string, string> => {
    if (!isRecord(value)) return {};
    const result: Record<string, string> = {};
    Object.entries(value).forEach(([key, val]) => {
        if (typeof val === 'string') result[key] = val;
    });
    return result;
};

const readNumberRecord = (value: unknown): Record<string, number> => {
    if (!isRecord(value)) return {};
    const result: Record<string, number> = {};
    Object.entries(value).forEach(([key, val]) => {
        if (typeof val === 'number' && Number.isFinite(val)) result[key] = val;
    });
    return result;
};

export const useGameStore = create<GameStore>()(
    persist<GameStore, [], [], PersistedGameStoreState>(
        (set, get) => {
            // Apply mutation to Yjs, but skip if we're processing a remote update
            // (prevents feedback loop: Yjs -> Zustand -> Yjs)
            const applyShared = (fn: (maps: SharedMaps) => void) => {
                if (isApplyingRemoteUpdate()) {
                    // Skip Yjs mutation - this change came FROM Yjs
                    return false;
                }
                return runWithSharedDoc(fn);
            };

            const buildLogContext = () => {
                const snapshot = get();
                return {
                    players: snapshot.players,
                    cards: snapshot.cards,
                    zones: snapshot.zones,
                };
            };

            return ({
                players: {},
                playerOrder: [],
                cards: {},
                zones: {},
                battlefieldViewScale: {},
                roomHostId: null,
                roomLockedByHost: false,
                positionFormat: 'normalized',
                globalCounters: {},
                activeModal: null,

                ...createSessionActions(set, get),
                ...createPlayerActions(set, get, { applyShared, buildLogContext }),
                ...createZoneActions(set, get, { applyShared }),
                ...createCardActions(set, get, { applyShared, buildLogContext }),
                ...createMovementActions(set, get, { applyShared, buildLogContext }),
                ...createDeckActions(set, get, { applyShared, buildLogContext }),
                ...createCounterActions(set, get, { applyShared, buildLogContext }),
                ...createRoomActions(set, get, { applyShared }),
                ...createUiActions(set, get, { applyShared }),
            });
        },
        {
            name: 'snapstack-storage',
            version: 2,
            migrate: (persistedState: unknown, _version) => {
                // v2: only persist identity/session bookkeeping; game state comes from Yjs.
                const persisted = isRecord(persistedState) ? persistedState : {};
                return {
                    playerIdsBySession: readStringRecord(persisted.playerIdsBySession),
                    sessionVersions: readNumberRecord(persisted.sessionVersions),
                };
            },
            partialize: (state) => ({
                playerIdsBySession: state.playerIdsBySession,
                sessionVersions: state.sessionVersions,
            }),
            storage: createJSONStorage(createSafeStorage),
            onRehydrateStorage: () => (state) => {
                if (!state) return;

                if (!state.playerIdsBySession) {
                    state.playerIdsBySession = {};
                }
                if (!state.sessionVersions) {
                    state.sessionVersions = {};
                }
                state.setHasHydrated(true);
            },
        }
    )
);
