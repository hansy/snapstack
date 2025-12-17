import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createSafeStorage } from "../lib/safeStorage";

const STORAGE_KEY = "mtg:client-prefs";
export const USERNAME_MAX_LENGTH = 12;

const ADJECTIVES = [
  "Arcane",
  "Brave",
  "Clever",
  "Cosmic",
  "Crimson",
  "Daring",
  "Electric",
  "Emerald",
  "Fabled",
  "Frosty",
  "Gilded",
  "Glorious",
  "Hidden",
  "Jolly",
  "Keen",
  "Lucky",
  "Mighty",
  "Misty",
  "Nimble",
  "Noble",
  "Primal",
  "Quiet",
  "Radiant",
  "Rugged",
  "Shadow",
  "Silver",
  "Stellar",
  "Swift",
  "Velvet",
  "Wandering",
];

const CREATURES = [
  "Aetherling",
  "Basilisk",
  "Bear",
  "Drake",
  "Dragon",
  "Dryad",
  "Elemental",
  "Faerie",
  "Frog",
  "Golem",
  "Griffin",
  "Hydra",
  "Kavu",
  "Knight",
  "Kraken",
  "Merfolk",
  "Myr",
  "Ninja",
  "Otter",
  "Phoenix",
  "Rat",
  "Sphinx",
  "Spirit",
  "Sprite",
  "Thopter",
  "Treant",
  "Vampire",
  "Wizard",
  "Wolf",
  "Wurm",
];

const randomInt = (maxExclusive: number) => {
  const max = Math.max(1, Math.floor(maxExclusive));
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
};

const normalizeUsername = (input: string | null | undefined): string | null => {
  if (!input) return null;
  const collapsed = input.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const capped =
    collapsed.length > USERNAME_MAX_LENGTH
      ? collapsed.slice(0, USERNAME_MAX_LENGTH).trim()
      : collapsed;
  return capped.length ? capped : null;
};

export const normalizeUsernameInput = normalizeUsername;

const takeAlpha = (value: string, maxLen: number) => {
  const alpha = value.replace(/[^a-z]/gi, "");
  return alpha.slice(0, Math.max(1, Math.floor(maxLen)));
};

const generateRandomUsername = () => {
  const adjective = takeAlpha(ADJECTIVES[randomInt(ADJECTIVES.length)], 5);
  const creature = takeAlpha(CREATURES[randomInt(CREATURES.length)], 5);
  const suffix = String(randomInt(100)).padStart(2, "0");
  return `${adjective}${creature}${suffix}`;
};

export const createSuggestedUsername = () => {
  return normalizeUsername(generateRandomUsername()) ?? "Player";
};

type ClientPrefsState = {
  hasHydrated: boolean;
  username: string | null;
  lastImportedDeckText: string | null;

  setHasHydrated: (next: boolean) => void;
  setUsername: (next: string | null) => void;
  ensureUsername: () => string;
  clearUsername: () => void;

  setLastImportedDeckText: (next: string | null) => void;
  clearLastImportedDeckText: () => void;
};

export const useClientPrefsStore = create<ClientPrefsState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      username: null,
      lastImportedDeckText: null,

      setHasHydrated: (next) => set({ hasHydrated: next }),
      setUsername: (next) => {
        set({ username: normalizeUsername(next) });
      },
      ensureUsername: () => {
        const current = get().username;
        const existing = normalizeUsername(current);
        if (existing) {
          if (existing !== current) set({ username: existing });
          return existing;
        }

        const generated = normalizeUsername(generateRandomUsername());
        const fallback = "Player";
        const next = generated ?? fallback;
        set({ username: next });
        return next;
      },
      clearUsername: () => set({ username: null }),

      setLastImportedDeckText: (next) => {
        const normalized = (next ?? "").trim();
        set({ lastImportedDeckText: normalized.length ? normalized : null });
      },
      clearLastImportedDeckText: () => set({ lastImportedDeckText: null }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      migrate: (persisted: any) => {
        const username = normalizeUsername(persisted?.username);
        const lastImportedDeckTextRaw = String(
          persisted?.lastImportedDeckText ?? ""
        ).trim();
        return {
          username,
          lastImportedDeckText: lastImportedDeckTextRaw.length
            ? lastImportedDeckTextRaw
            : null,
        };
      },
      partialize: (state) => ({
        username: state.username,
        lastImportedDeckText: state.lastImportedDeckText,
      }),
      storage: createJSONStorage(createSafeStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
