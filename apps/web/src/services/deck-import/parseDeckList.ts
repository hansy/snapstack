import type { ParsedCard } from "./types";

export const parseDeckList = (text: string): ParsedCard[] => {
  const lines = text.split("\n");
  const cards: ParsedCard[] = [];
  let currentSection: "main" | "commander" | "sideboard" = "main";
  let blankLineSwitchedToSideboard = false;
  let hasSeenMainCard = false;

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    const lowerLine = trimmedLine.toLowerCase();

    if (trimmedLine === "") {
      if (!blankLineSwitchedToSideboard && currentSection === "main" && hasSeenMainCard) {
        currentSection = "sideboard";
        blankLineSwitchedToSideboard = true;
      }
      return;
    }

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
      const card = {
        quantity: parseInt(detailedMatch[1].replace("x", ""), 10),
        name: detailedMatch[2].trim(),
        set: detailedMatch[3].toLowerCase(),
        collectorNumber: detailedMatch[4],
        section: currentSection,
      } as ParsedCard;
      cards.push(card);
      if (card.section === "main") hasSeenMainCard = true;
      return;
    }

    // Pattern B: Simple Quantity + Name
    const simpleMatch = trimmedLine.match(/^(\d+x?)\s+(.+)$/);

    if (simpleMatch) {
      const card = {
        quantity: parseInt(simpleMatch[1].replace("x", ""), 10),
        name: simpleMatch[2].trim(),
        set: "",
        collectorNumber: "",
        section: currentSection,
      } as ParsedCard;
      cards.push(card);
      if (card.section === "main") hasSeenMainCard = true;
      return;
    }

    // Pattern C: Just Name
    if (trimmedLine.length > 0) {
      const card = {
        quantity: 1,
        name: trimmedLine,
        set: "",
        collectorNumber: "",
        section: currentSection,
      } as ParsedCard;
      cards.push(card);
      if (card.section === "main") hasSeenMainCard = true;
    }
  });

  return cards;
};

