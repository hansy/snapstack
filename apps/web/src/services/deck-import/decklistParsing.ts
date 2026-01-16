export type DeckSection = "main" | "commander" | "sideboard";

const IGNORED_HEADERS = new Set(["companion", "maybeboard", "about"]);

export const normalizeDecklistName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s*\/\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

export const detectSectionHeader = (line: string): DeckSection | null => {
  const lower = line.toLowerCase();
  if (lower === "commander" || lower.startsWith("commander:")) return "commander";
  if (lower === "sideboard" || lower.startsWith("sideboard:")) return "sideboard";
  if (lower === "deck" || lower.startsWith("deck:")) return "main";
  return null;
};

export const isIgnoredHeader = (line: string) => {
  const lower = line.toLowerCase();
  if (IGNORED_HEADERS.has(lower)) return true;
  if (lower.startsWith("name ") || lower.startsWith("about ")) return true;
  return false;
};
