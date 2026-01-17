import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ZONE } from "@/constants/zones";
import type { Card, Zone } from "@/types";

import { ZoneViewerModalView } from "../ZoneViewerModalView";

const buildZone = (overrides: Partial<Zone>): Zone =>
  ({
    id: overrides.id ?? "z1",
    type: overrides.type ?? ZONE.GRAVEYARD,
    ownerId: overrides.ownerId ?? "me",
    cardIds: overrides.cardIds ?? [],
  }) as any;

const buildCard = (id: string, name: string, zoneId: string): Card =>
  ({
    id,
    name,
    ownerId: "me",
    controllerId: "me",
    zoneId,
    tapped: false,
    faceDown: false,
    position: { x: 0, y: 0 },
    rotation: 0,
    counters: [],
  }) as any;

describe("ZoneViewerModalView", () => {
  it("renders a linear view with a top-card label", () => {
    const zone = buildZone({ type: ZONE.GRAVEYARD, id: "gy-me" });
    const cards = [
      buildCard("c1", "Card1", zone.id),
      buildCard("c2", "Card2", zone.id),
    ];

    render(
      <ZoneViewerModalView
        isOpen
        onClose={vi.fn()}
        zone={zone}
        count={undefined}
        isLoading={false}
        expectedViewCount={null}
        filterText=""
        setFilterText={vi.fn()}
        containerRef={React.createRef<HTMLDivElement>()}
        listRef={React.createRef<HTMLDivElement>()}
        displayCards={cards}
        viewMode="linear"
        groupedCards={{}}
        sortedKeys={[]}
        canReorder={false}
        orderedCards={cards}
        orderedCardIds={cards.map((c) => c.id)}
        setOrderedCardIds={vi.fn() as any}
        draggingId={null}
        setDraggingId={vi.fn() as any}
        reorderList={(ids) => ids}
        commitReorder={vi.fn()}
        handleContextMenu={vi.fn()}
        contextMenu={null}
        closeContextMenu={vi.fn()}
        interactionsDisabled={false}
        pinnedCardId={undefined}
      />
    );

    expect(screen.getByText("graveyard Viewer")).toBeTruthy();
    expect(screen.getByText("Top card")).toBeTruthy();
    expect(screen.getByText("Card1")).toBeTruthy();
    expect(screen.getByText("Card2")).toBeTruthy();
  });

  it("renders grouped columns for the library", () => {
    const zone = buildZone({ type: ZONE.LIBRARY, id: "lib-me" });
    const land = buildCard("l1", "Land", zone.id);
    const spell = buildCard("s1", "Spell", zone.id);

    render(
      <ZoneViewerModalView
        isOpen
        onClose={vi.fn()}
        zone={zone}
        count={undefined}
        isLoading={false}
        expectedViewCount={null}
        filterText=""
        setFilterText={vi.fn()}
        containerRef={React.createRef<HTMLDivElement>()}
        listRef={React.createRef<HTMLDivElement>()}
        displayCards={[land, spell]}
        viewMode="grouped"
        groupedCards={{ Lands: [land], "Cost 1": [spell] }}
        sortedKeys={["Lands", "Cost 1"]}
        canReorder={false}
        orderedCards={[]}
        orderedCardIds={[]}
        setOrderedCardIds={vi.fn() as any}
        draggingId={null}
        setDraggingId={vi.fn() as any}
        reorderList={(ids) => ids}
        commitReorder={vi.fn()}
        handleContextMenu={vi.fn()}
        contextMenu={null}
        closeContextMenu={vi.fn()}
        interactionsDisabled={false}
        pinnedCardId={undefined}
      />
    );

    expect(screen.getByText("library Viewer")).toBeTruthy();
    expect(screen.getByText("Lands (1)")).toBeTruthy();
    expect(screen.getByText("Cost 1 (1)")).toBeTruthy();
    expect(screen.getByText("Land")).toBeTruthy();
    expect(screen.getByText("Spell")).toBeTruthy();
  });
});
