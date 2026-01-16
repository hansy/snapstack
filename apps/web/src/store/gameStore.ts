import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { GameState } from '@/types';
import { createSafeStorage } from '@/lib/safeStorage';
import { createIntentDispatcher } from './gameStore/dispatchIntent';

import { createCardActions } from './gameStore/actions/cards';
import { createCounterActions } from './gameStore/actions/counters';
import { createDeckActions } from './gameStore/actions/deck';
import { createMovementActions } from './gameStore/actions/movement';
import { createPrivateOverlayActions } from './gameStore/actions/privateOverlay';
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
            const dispatchIntent = createIntentDispatcher(set);

            return ({
                players: {},
                playerOrder: [],
                cards: {},
                zones: {},
                handRevealsToAll: {},
                libraryRevealsToAll: {},
                faceDownRevealsToAll: {},
                battlefieldViewScale: {},
                roomHostId: null,
                roomLockedByHost: false,
                roomOverCapacity: false,
                positionFormat: 'normalized',
                globalCounters: {},
                activeModal: null,

                ...createSessionActions(set, get, { dispatchIntent }),
                ...createPrivateOverlayActions(set, get),
                ...createPlayerActions(set, get, { dispatchIntent }),
                ...createZoneActions(set, get, { dispatchIntent }),
                ...createCardActions(set, get, { dispatchIntent }),
                ...createMovementActions(set, get, { dispatchIntent }),
                ...createDeckActions(set, get, { dispatchIntent }),
                ...createCounterActions(set, get, { dispatchIntent }),
                ...createRoomActions(set, get, { dispatchIntent }),
                ...createUiActions(set, get, { dispatchIntent }),
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
