// Utilities for mana costs and converted mana cost derivation.

// Parse a mana cost string like "{2}{R}{G}{W}" into its converted mana cost.
// X (and similar variable costs) are treated as 0; hybrid/phyrexian/snow/colorless symbols count as 1;
// numeric hybrids like {2/W} count their numeric portion. Empty/undefined returns 0.
export const parseConvertedManaCost = (manaCost?: string | null): number => {
  if (!manaCost) return 0;

  let total = 0;
  const regex = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(manaCost)) !== null) {
    const symbol = match[1].toUpperCase();

    // Pure numeric symbols (e.g., "2")
    if (/^\d+$/.test(symbol)) {
      total += parseInt(symbol, 10);
      continue;
    }

    // Hybrid with leading numeric (e.g., "2/W")
    const numericHybrid = symbol.match(/^(\d+)\//);
    if (numericHybrid) {
      total += parseInt(numericHybrid[1], 10);
      continue;
    }

    // Variable or infinite costs count as 0 for CMC
    if (symbol === 'X' || symbol === '∞') {
      continue;
    }

    // Default case: colored, phyrexian, snow, colorless, hybrid, etc. all count as 1
    total += 1;
  }

  return total;
};

