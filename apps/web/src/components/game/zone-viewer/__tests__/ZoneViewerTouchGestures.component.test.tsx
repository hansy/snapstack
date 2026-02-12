import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Card } from "@/types";

import { ZoneViewerGroupedView } from "../ZoneViewerGroupedView";
import { ZoneViewerLinearView } from "../ZoneViewerLinearView";

const createPointerEvent = (
  type: string,
  options: PointerEventInit & { pointerType?: string; pointerId?: number }
) => {
  if (typeof PointerEvent !== "undefined") {
    return new PointerEvent(type, options);
  }
  const fallback = new MouseEvent(type, options);
  Object.defineProperty(fallback, "pointerType", {
    value: options.pointerType ?? "mouse",
  });
  Object.defineProperty(fallback, "pointerId", {
    value: options.pointerId ?? 1,
  });
  return fallback as unknown as PointerEvent;
};

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

const reorderList = (ids: string[], draggingId: string, overId: string) => {
  const sourceIndex = ids.indexOf(draggingId);
  const targetIndex = ids.indexOf(overId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return ids;
  }
  const next = [...ids];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
};

const LinearHarness: React.FC<{
  cards: Card[];
  canReorder: boolean;
  onCardContextMenu: (e: React.MouseEvent, card: Card) => void;
  commitReorder: (ids: string[]) => void;
}> = ({ cards, canReorder, onCardContextMenu, commitReorder }) => {
  const [orderedCardIds, setOrderedCardIds] = React.useState<string[]>(
    cards.map((card) => card.id)
  );
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const cardsById = React.useMemo(
    () =>
      new Map<string, Card>(
        cards.map((card) => [card.id, card])
      ),
    [cards]
  );
  const orderedCards = React.useMemo(
    () =>
      orderedCardIds
        .map((id) => cardsById.get(id))
        .filter((card): card is Card => Boolean(card)),
    [cardsById, orderedCardIds]
  );

  return (
    <ZoneViewerLinearView
      orderedCards={orderedCards}
      canReorder={canReorder}
      orderedCardIds={orderedCardIds}
      setOrderedCardIds={setOrderedCardIds}
      draggingId={draggingId}
      setDraggingId={setDraggingId}
      reorderList={reorderList}
      commitReorder={commitReorder}
      displayCards={cards}
      interactionsDisabled={false}
      pinnedCardId={undefined}
      onCardContextMenu={onCardContextMenu}
      listRef={React.createRef<HTMLDivElement>()}
      cardWidthPx={220}
      cardHeightPx={308}
    />
  );
};

describe("ZoneViewer touch gestures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens linear card context menu on single touch hold", () => {
    const cards = [buildCard("c1", "Card 1", "zone-1")];
    const onCardContextMenu = vi.fn();
    const commitReorder = vi.fn();

    const { container } = render(
      <LinearHarness
        cards={cards}
        canReorder={false}
        onCardContextMenu={onCardContextMenu}
        commitReorder={commitReorder}
      />
    );

    const cardNode = container.querySelector('[data-zone-viewer-card-id="c1"]');
    if (!cardNode) throw new Error("Expected card node");

    act(() => {
      fireEvent(
        cardNode,
        createPointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "touch",
          pointerId: 1,
          clientX: 20,
          clientY: 20,
        })
      );
      vi.advanceTimersByTime(500);
    });

    expect(onCardContextMenu).toHaveBeenCalledTimes(1);
    expect(commitReorder).not.toHaveBeenCalled();
  });

  it("opens grouped card context menu on single touch hold", () => {
    const card = buildCard("c1", "Card 1", "zone-1");
    const onCardContextMenu = vi.fn();

    const { container } = render(
      <ZoneViewerGroupedView
        sortedKeys={["Lands"]}
        groupedCards={{ Lands: [card] }}
        cardWidthPx={220}
        cardHeightPx={308}
        interactionsDisabled={false}
        pinnedCardId={undefined}
        onCardContextMenu={onCardContextMenu}
      />
    );

    const cardNode = container.querySelector('[data-zone-viewer-card-id="c1"]');
    if (!cardNode) throw new Error("Expected grouped card node");

    act(() => {
      fireEvent(
        cardNode,
        createPointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "touch",
          pointerId: 1,
          clientX: 20,
          clientY: 20,
        })
      );
      vi.advanceTimersByTime(500);
    });

    expect(onCardContextMenu).toHaveBeenCalledTimes(1);
  });

  it("reorders cards with touch drag in linear mode and commits order", () => {
    const cards = [
      buildCard("c1", "Card 1", "zone-1"),
      buildCard("c2", "Card 2", "zone-1"),
      buildCard("c3", "Card 3", "zone-1"),
    ];
    const onCardContextMenu = vi.fn();
    const commitReorder = vi.fn();

    const { container } = render(
      <LinearHarness
        cards={cards}
        canReorder
        onCardContextMenu={onCardContextMenu}
        commitReorder={commitReorder}
      />
    );

    const dragNode = container.querySelector('[data-zone-viewer-card-id="c3"]');
    const overNode = container.querySelector('[data-zone-viewer-card-id="c1"]');
    if (!dragNode || !overNode) throw new Error("Expected linear card nodes");

    const originalDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "elementFromPoint"
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => overNode as Element),
    });

    try {
      act(() => {
        fireEvent(
          dragNode,
          createPointerEvent("pointerdown", {
            bubbles: true,
            button: 0,
            pointerType: "touch",
            pointerId: 1,
            clientX: 20,
            clientY: 20,
          })
        );
        fireEvent(
          dragNode,
          createPointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            pointerType: "touch",
            pointerId: 1,
            clientX: 44,
            clientY: 40,
          })
        );
        fireEvent(
          dragNode,
          createPointerEvent("pointerup", {
            bubbles: true,
            pointerType: "touch",
            pointerId: 1,
            clientX: 44,
            clientY: 40,
          })
        );
      });

      expect(onCardContextMenu).not.toHaveBeenCalled();
      expect(commitReorder).toHaveBeenCalledTimes(1);
      expect(commitReorder).toHaveBeenCalledWith(["c3", "c1", "c2"]);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, "elementFromPoint", originalDescriptor);
      } else {
        Reflect.deleteProperty(
          document as Document & Record<string, unknown>,
          "elementFromPoint"
        );
      }
    }
  });

  it("uses center-focused cover-flow styling in mobile linear mode", () => {
    const cards = [
      buildCard("c1", "Card 1", "zone-1"),
      buildCard("c2", "Card 2", "zone-1"),
      buildCard("c3", "Card 3", "zone-1"),
    ];

    const { container } = render(
      <ZoneViewerLinearView
        orderedCards={cards}
        canReorder
        orderedCardIds={cards.map((card) => card.id)}
        setOrderedCardIds={vi.fn() as any}
        draggingId={null}
        setDraggingId={vi.fn() as any}
        reorderList={reorderList}
        commitReorder={vi.fn()}
        displayCards={cards}
        interactionsDisabled={false}
        pinnedCardId={undefined}
        onCardContextMenu={vi.fn()}
        listRef={React.createRef<HTMLDivElement>()}
        cardWidthPx={220}
        cardHeightPx={308}
        mobileCoverFlow
      />
    );

    const topCard = container.querySelector('[data-zone-viewer-card-id="c3"]');
    if (!topCard) throw new Error("Expected top card node");
    expect(topCard.getAttribute("data-zone-viewer-focused")).toBe("true");
    expect(container.firstElementChild?.className).toContain("snap-x");
  });

  it("uses vertical grouped layout with per-row cover-flow on mobile", () => {
    const land = buildCard("l1", "Land", "zone-1");
    const spell = buildCard("s1", "Spell", "zone-1");

    const { container } = render(
      <ZoneViewerGroupedView
        sortedKeys={["Lands", "Cost 1"]}
        groupedCards={{ Lands: [land], "Cost 1": [spell] }}
        cardWidthPx={220}
        cardHeightPx={308}
        interactionsDisabled={false}
        pinnedCardId={undefined}
        onCardContextMenu={vi.fn()}
        mobileCoverFlow
      />
    );

    const root = container.firstElementChild as HTMLElement | null;
    expect(root?.className).toContain("overflow-y-auto");

    const landNode = container.querySelector('[data-zone-viewer-card-id="l1"]');
    const spellNode = container.querySelector('[data-zone-viewer-card-id="s1"]');
    if (!landNode || !spellNode) throw new Error("Expected grouped mobile card nodes");
    expect(landNode.getAttribute("data-zone-viewer-focused")).toBe("true");
    expect(spellNode.getAttribute("data-zone-viewer-focused")).toBe("true");
  });
});
