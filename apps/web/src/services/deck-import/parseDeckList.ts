import type { ParsedCard } from "./types";

export const parseDeckList = (text: string): ParsedCard[] => {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const cards: ParsedCard[] = [];
  let currentSection: "main" | "commander" | "sideboard" = "main";

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    const lowerLine = trimmedLine.toLowerCase();

    // Detect Section Headers
    if (lowerLine === "commander" || lowerLine.startsWith("commander:")) {
      currentSection = "commander";
      return;
    }
    if (lowerLine === "sideboard" || lowerLine.startsWith("sideboard:")) {
      currentSection = "sideboard";
      return;
    }
    if (lowerLine === "deck" || lowerLine.startsWith("deck:")) {
      currentSection = "main";
      return;
    }

    // Headers to ignore (if not section headers)
    const IGNORED_HEADERS = ["companion", "maybeboard", "about"];

    if (
      IGNORED_HEADERS.includes(lowerLine) ||
      lowerLine.startsWith("name ") ||
      lowerLine.startsWith("about ")
    ) {
      return;
    }

    // Regex Patterns

    // Pattern A: Detailed Export
    const detailedMatch = trimmedLine.match(
      /^(\d+x?)\s+(.+?)\s+\(([a-zA-Z0-9]{3,})\)\s+(\S+).*$/
    );

    if (detailedMatch) {
      cards.push({
        quantity: parseInt(detailedMatch[1].replace("x", ""), 10),
        name: detailedMatch[2].trim(),
        set: detailedMatch[3].toLowerCase(),
        collectorNumber: detailedMatch[4],
        section: currentSection,
      });
      return;
    }

    // Pattern B: Simple Quantity + Name
    const simpleMatch = trimmedLine.match(/^(\d+x?)\s+(.+)$/);

    if (simpleMatch) {
      cards.push({
        quantity: parseInt(simpleMatch[1].replace("x", ""), 10),
        name: simpleMatch[2].trim(),
        set: "",
        collectorNumber: "",
        section: currentSection,
      });
      return;
    }

    // Pattern C: Just Name
    if (trimmedLine.length > 0) {
      cards.push({
        quantity: 1,
        name: trimmedLine,
        set: "",
        collectorNumber: "",
        section: currentSection,
      });
    }
  });

  return cards;
};

