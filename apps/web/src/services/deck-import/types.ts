import type { Card } from "@/types";
import type { ScryfallFetchError } from "@/services/scryfall/scryfallErrors";

export interface ParsedCard {
  quantity: number;
  name: string;
  set: string;
  collectorNumber: string;
  section: "main" | "commander" | "sideboard";
}

export interface FetchScryfallResult {
  cards: (Partial<Card> & { section: ParsedCard["section"] })[];
  missing: ParsedCard[];
  warnings: string[];
  errors: ScryfallFetchError[];
}
