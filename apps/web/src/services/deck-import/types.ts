import type { Card } from "@/types";

export interface ParsedCard {
  quantity: number;
  name: string;
  set: string;
  collectorNumber: string;
  section: "main" | "commander" | "sideboard";
}

export interface FetchScryfallResult {
  cards: (Partial<Card> & { section: string })[];
  missing: ParsedCard[];
  warnings: string[];
}

