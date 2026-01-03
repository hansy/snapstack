type Section = "main" | "commander" | "sideboard";

type Segment = {
  headerLine: string | null;
  section: Section;
  lines: LineInfo[];
};

type LineInfo = {
  raw: string;
  type: "blank" | "other" | "card";
  card?: CardLine;
};

type CardLine = {
  raw: string;
  leading: string;
  quantity: number;
  name: string;
  normalizedName: string;
  hasQuantityToken: boolean;
  qtyToken?: string;
  rest: string;
};

type UpdateResult = {
  text: string;
  changed: boolean;
};

const IGNORED_HEADERS = new Set(["companion", "maybeboard", "about"]);

const normalizeDecklistName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s*\/\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

const detectSectionHeader = (line: string): Section | null => {
  const lower = line.toLowerCase();
  if (lower === "commander" || lower.startsWith("commander:")) return "commander";
  if (lower === "sideboard" || lower.startsWith("sideboard:")) return "sideboard";
  if (lower === "deck" || lower.startsWith("deck:")) return "main";
  return null;
};

const isIgnoredHeader = (line: string) => {
  const lower = line.toLowerCase();
  if (IGNORED_HEADERS.has(lower)) return true;
  if (lower.startsWith("name ") || lower.startsWith("about ")) return true;
  return false;
};

const parseCardLine = (line: string): CardLine | null => {
  const leadingMatch = line.match(/^(\s*)/);
  const leading = leadingMatch?.[1] ?? "";
  const trimmed = line.trim();
  if (!trimmed) return null;

  const qtyMatch = trimmed.match(/^(\d+x?)\s+(.+)$/);
  if (qtyMatch) {
    const qtyToken = qtyMatch[1];
    const rest = qtyMatch[2];
    const detailedMatch = trimmed.match(
      /^(\d+x?)\s+(.+?)\s+\(([a-zA-Z0-9]{3,})\)\s+(\S+).*$/
    );
    const name = (detailedMatch ? detailedMatch[2] : rest).trim();
    const quantity = parseInt(qtyToken.replace("x", ""), 10);
    return {
      raw: line,
      leading,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      name,
      normalizedName: normalizeDecklistName(name),
      hasQuantityToken: true,
      qtyToken,
      rest,
    };
  }

  return {
    raw: line,
    leading,
    quantity: 1,
    name: trimmed,
    normalizedName: normalizeDecklistName(trimmed),
    hasQuantityToken: false,
    rest: trimmed,
  };
};

const formatCardLine = (card: CardLine, quantity: number) => {
  if (!card.hasQuantityToken && quantity === card.quantity) return card.raw;
  const suffix = card.qtyToken?.endsWith("x") ? "x" : "";
  const rest = card.rest.trim();
  return `${card.leading}${quantity}${suffix} ${rest}`.trimEnd();
};

const buildSegments = (text: string): Segment[] => {
  const segments: Segment[] = [{ headerLine: null, section: "main", lines: [] }];
  let current = segments[0];

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      current.lines.push({ raw: line, type: "blank" });
      return;
    }

    const header = detectSectionHeader(trimmed);
    if (header) {
      current = { headerLine: line, section: header, lines: [] };
      segments.push(current);
      return;
    }

    if (isIgnoredHeader(trimmed)) {
      current.lines.push({ raw: line, type: "other" });
      return;
    }

    const card = parseCardLine(line);
    if (!card) {
      current.lines.push({ raw: line, type: "other" });
      return;
    }

    current.lines.push({ raw: line, type: "card", card });
  });

  return segments;
};

const buildCommanderCounts = (names: string[]) => {
  const counts = new Map<string, { name: string; count: number }>();
  names.forEach((name) => {
    const key = normalizeDecklistName(name);
    if (!key) return;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { name, count: 1 });
    }
  });
  return counts;
};

export const updateDecklistCommanderSection = (
  text: string,
  commanderNames: string[]
): UpdateResult => {
  if (!text.trim()) return { text, changed: false };

  const segments = buildSegments(text);
  const commanderCounts = buildCommanderCounts(commanderNames);
  const keepRemaining = new Map(
    Array.from(commanderCounts.entries(), ([key, entry]) => [key, entry.count])
  );
  const moveRemaining = new Map(
    Array.from(commanderCounts.entries(), ([key, entry]) => [key, entry.count])
  );

  const processedSegments = segments.map((segment) => ({
    ...segment,
    processedLines: [] as string[],
  }));

  const movedToMain: string[] = [];
  const movedToCommander: string[] = [];

  // Process commander sections first to avoid double-moving from main.
  processedSegments.forEach((segment) => {
    if (segment.section !== "commander") return;

    segment.lines.forEach((line) => {
      if (line.type !== "card" || !line.card) {
        segment.processedLines.push(line.raw);
        return;
      }

      const card = line.card;
      const desired = keepRemaining.get(card.normalizedName) ?? 0;
      if (desired <= 0) {
        movedToMain.push(card.raw);
        return;
      }

      const keepCount = Math.min(card.quantity, desired);
      const moveCount = card.quantity - keepCount;
      if (keepCount > 0) {
        segment.processedLines.push(formatCardLine(card, keepCount));
        keepRemaining.set(card.normalizedName, desired - keepCount);
        const remainingMove = (moveRemaining.get(card.normalizedName) ?? 0) - keepCount;
        moveRemaining.set(card.normalizedName, Math.max(0, remainingMove));
      }
      if (moveCount > 0) movedToMain.push(formatCardLine(card, moveCount));
    });
  });

  // Process other sections in original order.
  processedSegments.forEach((segment) => {
    if (segment.section === "commander") return;

    segment.lines.forEach((line) => {
      if (line.type !== "card" || !line.card) {
        segment.processedLines.push(line.raw);
        return;
      }

      const card = line.card;
      if (segment.section !== "main" || commanderCounts.size === 0) {
        segment.processedLines.push(card.raw);
        return;
      }

      const needed = moveRemaining.get(card.normalizedName) ?? 0;
      if (needed <= 0) {
        segment.processedLines.push(card.raw);
        return;
      }

      const moveCount = Math.min(card.quantity, needed);
      const keepCount = card.quantity - moveCount;
      if (moveCount > 0) {
        movedToCommander.push(formatCardLine(card, moveCount));
        moveRemaining.set(card.normalizedName, needed - moveCount);
      }
      if (keepCount > 0) {
        segment.processedLines.push(formatCardLine(card, keepCount));
      }
    });
  });

  moveRemaining.forEach((remaining, key) => {
    if (remaining <= 0) return;
    const entry = commanderCounts.get(key);
    if (!entry) return;
    for (let i = 0; i < remaining; i += 1) {
      movedToCommander.push(`1 ${entry.name}`.trim());
    }
  });

  if (movedToMain.length > 0) {
    const lastMain = [...processedSegments].reverse().find((segment) => segment.section === "main");
    if (lastMain) {
      lastMain.processedLines.push(...movedToMain);
    } else {
      processedSegments.unshift({
        headerLine: null,
        section: "main",
        lines: [],
        processedLines: [...movedToMain],
      });
    }
  }

  if (movedToCommander.length > 0) {
    const commanderSegment = processedSegments.find(
      (segment) => segment.section === "commander"
    );
    if (commanderSegment) {
      commanderSegment.processedLines.push(...movedToCommander);
    } else {
      processedSegments.push({
        headerLine: "Commander:",
        section: "commander",
        lines: [],
        processedLines: [...movedToCommander],
      });
    }
  }

  const nextLines: string[] = [];
  processedSegments.forEach((segment, index) => {
    if (index > 0 || segment.headerLine) {
      if (segment.headerLine) nextLines.push(segment.headerLine);
    }
    nextLines.push(...segment.processedLines);
  });

  const nextText = nextLines.join("\n");
  return { text: nextText, changed: nextText !== text };
};

export { normalizeDecklistName };
