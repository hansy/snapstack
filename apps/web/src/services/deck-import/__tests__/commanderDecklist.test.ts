import { describe, expect, it } from "vitest";

import { updateDecklistCommanderSection } from "../commanderDecklist";

describe("updateDecklistCommanderSection", () => {
  it("moves commanders under a new Commander header without disturbing sideboard", () => {
    const input = ["1 Lightning Bolt", "Sideboard", "1 Dispel"].join("\n");

    const result = updateDecklistCommanderSection(input, ["Lightning Bolt"]);

    expect(result.text).toBe(
      ["Sideboard", "1 Dispel", "Commander:", "1 Lightning Bolt"].join("\n")
    );
  });

  it("keeps existing Commander header and moves non-commanders back to main", () => {
    const input = [
      "Commander:",
      "1 Atraxa, Praetors' Voice",
      "1 Sol Ring",
      "Sideboard:",
      "1 Dispel",
    ].join("\n");

    const result = updateDecklistCommanderSection(input, ["Sol Ring"]);

    expect(result.text).toBe(
      [
        "1 Atraxa, Praetors' Voice",
        "Commander:",
        "1 Sol Ring",
        "Sideboard:",
        "1 Dispel",
      ].join("\n")
    );
  });
});
