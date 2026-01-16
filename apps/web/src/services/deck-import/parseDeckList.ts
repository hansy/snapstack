import { detectSectionHeader, isIgnoredHeader, type DeckSection } from "./decklistParsing";
import type { ParsedCard } from "./types";

const DETAILED_PATTERN =
  /^(\d+x?)\s+(.+?)\s+\(([a-zA-Z0-9]{3,})\)\s+(\S+).*$/;
const SIMPLE_PATTERN = /^(\d+x?)\s+(.+)$/;

const parseQuantity = (token: string) => {
  const parsed = parseInt(token.replace("x", ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildCard = (
  quantity: number,
  name: string,
  section: DeckSection,
  set = "",
  collectorNumber = ""
): ParsedCard => ({
  quantity,
  name,
  set,
  collectorNumber,
  section,
});

export const parseDeckList = (text: string): ParsedCard[] => {
  const lines = text.split("\n");
  const cards: ParsedCard[] = [];
  let currentSection: DeckSection = "main";

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === "") continue;

    // Detect Section Headers
    const header = detectSectionHeader(trimmedLine);
    if (header) {
      currentSection = header;
      continue;
    }

    // Headers to ignore (if not section headers)
    if (isIgnoredHeader(trimmedLine)) continue;

    // Regex Patterns

    // Pattern A: Detailed Export
    const detailedMatch = trimmedLine.match(DETAILED_PATTERN);

    if (detailedMatch) {
      cards.push(
        buildCard(
          parseQuantity(detailedMatch[1]),
          detailedMatch[2].trim(),
          currentSection,
          detailedMatch[3].toLowerCase(),
          detailedMatch[4]
        )
      );
      continue;
    }

    // Pattern B: Simple Quantity + Name
    const simpleMatch = trimmedLine.match(SIMPLE_PATTERN);

    if (simpleMatch) {
      cards.push(
        buildCard(parseQuantity(simpleMatch[1]), simpleMatch[2].trim(), currentSection)
      );
      continue;
    }

    // Pattern C: Just Name
    if (trimmedLine.length > 0) {
      cards.push(buildCard(1, trimmedLine, currentSection));
    }
  }

  return cards;
};
