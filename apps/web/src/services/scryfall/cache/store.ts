import type { ScryfallCard } from "@/types/scryfall";

export type CachedCard = {
  scryfallId: string;
  data: ScryfallCard;
  cachedAt: number;
};

export type ScryfallCardStore = {
  get: (scryfallId: string) => Promise<CachedCard | null>;
  put: (entry: CachedCard) => Promise<void>;
  delete: (scryfallId: string) => Promise<void>;
  clear: () => Promise<void>;
  cleanupBefore: (cutoffMs: number) => Promise<number>;
  count: () => Promise<number>;
};

