import { describe, expect, it } from "vitest";

import { computeCommanderDamagePatch } from "../lifeBoxModel";

describe("lifeBoxModel", () => {
  it("increments commander damage and decrements life", () => {
    expect(
      computeCommanderDamagePatch({ life: 40, commanderDamage: { p2: 0 } }, "p2", 1)
    ).toEqual({
      life: 39,
      commanderDamage: { p2: 1 },
    });
  });

  it("clamps commander damage at 0 and restores life accordingly", () => {
    expect(
      computeCommanderDamagePatch({ life: 37, commanderDamage: { p2: 3 } }, "p2", -10)
    ).toEqual({
      life: 40,
      commanderDamage: { p2: 0 },
    });
  });

  it("returns null when the delta does not change the value", () => {
    expect(
      computeCommanderDamagePatch({ life: 40, commanderDamage: { p2: 0 } }, "p2", -1)
    ).toBeNull();
  });
});

