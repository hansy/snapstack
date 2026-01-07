import { createSafeStorage } from "./safeStorage";

const FEATURE_COMMAND_LOG_KEY = "mtg:feature:command-log";

const readBoolean = (value: string | null): boolean | undefined => {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const storage = createSafeStorage();
const storageValue = readBoolean(storage.getItem(FEATURE_COMMAND_LOG_KEY));
const envValue = readBoolean(import.meta.env.VITE_USE_COMMAND_LOG ?? null);

// Local storage override wins, then env, then default false.
export const useCommandLog = storageValue ?? envValue ?? false;
