import { describe, expect, it } from "vitest";

import { ZONE } from "@/constants/zones";
import { canViewerSeeCardIdentity, shouldRenderFaceDown } from "../reveal";

describe("reveal", () => {
  it("lets the owner always see card identity", () => {
    expect(
      canViewerSeeCardIdentity(
        {
          ownerId: "me",
          controllerId: "me",
          faceDown: true,
          knownToAll: false,
          revealedToAll: false,
          revealedTo: [],
        },
        ZONE.HAND,
        "me"
      )
    ).toBe(true);
  });

  it("hides identity in hidden zones unless revealed", () => {
    const baseCard = {
      ownerId: "p1",
      controllerId: "p1",
      faceDown: false,
      knownToAll: false,
      revealedToAll: false,
      revealedTo: [] as string[],
    };

    expect(canViewerSeeCardIdentity(baseCard, ZONE.HAND, "p2")).toBe(false);
    expect(shouldRenderFaceDown(baseCard, ZONE.HAND, "p2")).toBe(true);

    expect(
      shouldRenderFaceDown({ ...baseCard, knownToAll: true }, ZONE.HAND, "p2")
    ).toBe(false);

    expect(
      shouldRenderFaceDown({ ...baseCard, revealedToAll: true }, ZONE.HAND, "p2")
    ).toBe(false);

    expect(
      shouldRenderFaceDown({ ...baseCard, revealedTo: ["p2"] }, ZONE.HAND, "p2")
    ).toBe(false);
  });

  it("renders face-down on battlefield when faceDown is true", () => {
    expect(
      shouldRenderFaceDown(
        {
          ownerId: "p1",
          controllerId: "p2",
          faceDown: true,
          knownToAll: false,
          revealedToAll: false,
          revealedTo: [],
        },
        ZONE.BATTLEFIELD,
        "p3"
      )
    ).toBe(true);
  });

  it("does not render face-down in public zones when not faceDown", () => {
    expect(
      shouldRenderFaceDown(
        {
          ownerId: "p1",
          controllerId: "p2",
          faceDown: false,
          knownToAll: false,
          revealedToAll: false,
          revealedTo: [],
        },
        ZONE.GRAVEYARD,
        "p3"
      )
    ).toBe(false);
  });
});
