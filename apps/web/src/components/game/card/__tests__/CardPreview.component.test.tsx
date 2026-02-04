import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";

import type { Card as CardType, Player, Zone } from "@/types";
import { useGameStore } from "@/store/gameStore";
import { useDragStore } from "@/store/dragStore";
import { useSelectionStore } from "@/store/selectionStore";
import { ZONE } from "@/constants/zones";
import {
  PREVIEW_MAX_WIDTH_PX,
  PREVIEW_MIN_WIDTH_PX,
} from "@/hooks/game/seat/useSeatSizing";
import { Card } from "../Card";
import { CardPreview } from "../CardPreview";
import { CardPreviewProvider } from "../CardPreviewProvider";

const buildZone = (id: string, type: keyof typeof ZONE, ownerId: string, cardIds: string[] = []) =>
  ({
    id,
    type: ZONE[type],
    ownerId,
    cardIds,
  }) satisfies Zone;

const buildCard = (id: string, name: string, zoneId: string): CardType => ({
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
});

const buildPlayer = (id: string, name: string): Player => ({
  id,
  name,
  life: 20,
  counters: [],
  commanderDamage: {},
  commanderTax: 0,
});

const createPointerEvent = (type: string, options: PointerEventInit) => {
  if (typeof PointerEvent !== "undefined") {
    return new PointerEvent(type, options);
  }
  return new MouseEvent(type, options);
};

describe("CardPreview", () => {
  beforeEach(() => {
    useGameStore.setState({
      zones: {},
      cards: {},
      players: {},
      myPlayerId: "me",
    });
    useSelectionStore.setState({ selectedCardIds: [], selectionZoneId: null });
    useDragStore.setState({
      ghostCards: null,
      activeCardId: null,
      isGroupDragging: false,
      overCardScale: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not violate hook ordering during initial positioning", async () => {
    const zoneId = "me-battlefield";
    const cardId = "c1";
    const zone = buildZone(zoneId, "BATTLEFIELD", "me", [cardId]);
    const card = buildCard(cardId, "Test Card", zoneId);

    useGameStore.setState((state) => ({
      ...state,
      zones: { [zoneId]: zone },
      cards: { [cardId]: card },
      players: { me: buildPlayer("me", "Me") },
      myPlayerId: "me",
    }));

    const anchorRect = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    const anchorEl = document.createElement("div");
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue(anchorRect);
    document.body.appendChild(anchorEl);

    render(<CardPreview card={card} anchorEl={anchorEl} locked={false} />);

    expect(await screen.findByText("Test Card")).toBeTruthy();
    anchorEl.remove();
  });

  it("treats hand zones based on zone type, not zone id naming", async () => {
    const zoneId = "z123";
    const cardId = "c1";
    const zone = buildZone(zoneId, "HAND", "me", [cardId]);
    const card: CardType = { ...buildCard(cardId, "Test Card", zoneId), customText: "Hello" };

    useGameStore.setState((state) => ({
      ...state,
      zones: { [zoneId]: zone },
      cards: { [cardId]: card },
      players: { me: buildPlayer("me", "Me") },
      myPlayerId: "me",
    }));

    const anchorRect = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    const anchorEl = document.createElement("div");
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue(anchorRect);
    document.body.appendChild(anchorEl);

    render(<CardPreview card={card} anchorEl={anchorEl} locked={false} />);

    expect(await screen.findByText("Test Card")).toBeTruthy();
    expect(screen.queryByText("Hello")).toBeNull();
    anchorEl.remove();
  });

  it("uses seat preview width when available and clamps to min/max", async () => {
    const zoneId = "me-battlefield";
    const cardId = "c1";
    const zone = buildZone(zoneId, "BATTLEFIELD", "me", [cardId]);
    const card = buildCard(cardId, "Test Card", zoneId);

    useGameStore.setState((state) => ({
      ...state,
      zones: { [zoneId]: zone },
      cards: { [cardId]: card },
      players: { me: buildPlayer("me", "Me") },
      myPlayerId: "me",
    }));

    const anchorRect = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    const anchorEl = document.createElement("div");
    anchorEl.style.setProperty("--preview-w", "900px");
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue(anchorRect);
    document.body.appendChild(anchorEl);

    render(<CardPreview card={card} anchorEl={anchorEl} locked={false} />);

    expect(await screen.findByText("Test Card")).toBeTruthy();
    const previewEl = document.querySelector("[data-card-preview]") as HTMLElement | null;
    expect(previewEl).not.toBeNull();
    expect(previewEl?.style.width).toBe(`${PREVIEW_MAX_WIDTH_PX}px`);

    anchorEl.style.setProperty("--preview-w", "120px");
    act(() => {
      fireEvent(window, new Event("resize"));
    });
    expect(previewEl?.style.width).toBe(`${PREVIEW_MIN_WIDTH_PX}px`);

    anchorEl.remove();
  });

  it("shows actual PT for face-down battlefield cards when viewer can peek", async () => {
    const zoneId = "me-battlefield";
    const cardId = "c1";
    const zone = buildZone(zoneId, "BATTLEFIELD", "me", [cardId]);
    const card: CardType = {
      ...buildCard(cardId, "Test Card", zoneId),
      faceDown: true,
      faceDownMode: "morph",
      power: "6",
      toughness: "7",
      basePower: "6",
      baseToughness: "7",
    };

    useGameStore.setState((state) => ({
      ...state,
      zones: { [zoneId]: zone },
      cards: { [cardId]: card },
      players: { me: buildPlayer("me", "Me") },
      myPlayerId: "me",
      viewerRole: "player",
    }));

    const anchorRect = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    const anchorEl = document.createElement("div");
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue(anchorRect);
    document.body.appendChild(anchorEl);

    render(<CardPreview card={card} anchorEl={anchorEl} locked={false} />);

    expect(await screen.findByText("Test Card")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    anchorEl.remove();
  });

  it("shows actual PT for face-down battlefield cards revealed to the viewer", async () => {
    const zoneId = "opp-battlefield";
    const cardId = "c1";
    const zone = buildZone(zoneId, "BATTLEFIELD", "opp", [cardId]);
    const card: CardType = {
      ...buildCard(cardId, "Test Card", zoneId),
      ownerId: "opp",
      controllerId: "opp",
      faceDown: true,
      faceDownMode: "morph",
      power: "6",
      toughness: "7",
      basePower: "6",
      baseToughness: "7",
      revealedTo: ["me"],
    };

    useGameStore.setState((state) => ({
      ...state,
      zones: { [zoneId]: zone },
      cards: { [cardId]: card },
      players: { me: buildPlayer("me", "Me"), opp: buildPlayer("opp", "Opp") },
      myPlayerId: "me",
      viewerRole: "player",
    }));

    const anchorRect = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    const anchorEl = document.createElement("div");
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue(anchorRect);
    document.body.appendChild(anchorEl);

    render(<CardPreview card={card} anchorEl={anchorEl} locked={false} />);

    expect(await screen.findByText("Test Card")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    anchorEl.remove();
  });

  it("locks preview after a 400ms long press", () => {
    vi.useFakeTimers();

    const zoneId = "me-battlefield";
    const cardId = "c1";
    const zone = buildZone(zoneId, "BATTLEFIELD", "me", [cardId]);
    const card = buildCard(cardId, "Test Card", zoneId);

    useGameStore.setState((state) => ({
      ...state,
      zones: { [zoneId]: zone },
      cards: { [cardId]: card },
      players: { me: buildPlayer("me", "Me") },
      myPlayerId: "me",
    }));

    const { container } = render(
      <DndContext>
        <CardPreviewProvider>
          <Card card={card} />
        </CardPreviewProvider>
      </DndContext>
    );

    const cardElement = container.querySelector(`[data-card-id="${cardId}"]`);
    if (!cardElement) {
      throw new Error("Expected card element to be present.");
    }

    act(() => {
      fireEvent(
        cardElement,
        createPointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        })
      );
    });

    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(document.querySelector("[data-card-preview]")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector("[data-card-preview]")).not.toBeNull();
  });

  it("closes locked preview when clicking outside", () => {
    vi.useFakeTimers();

    const zoneId = "me-battlefield";
    const cardId = "c1";
    const zone = buildZone(zoneId, "BATTLEFIELD", "me", [cardId]);
    const card = buildCard(cardId, "Test Card", zoneId);

    useGameStore.setState((state) => ({
      ...state,
      zones: { [zoneId]: zone },
      cards: { [cardId]: card },
      players: { me: buildPlayer("me", "Me") },
      myPlayerId: "me",
    }));

    const { container } = render(
      <DndContext>
        <CardPreviewProvider>
          <Card card={card} />
        </CardPreviewProvider>
      </DndContext>
    );

    const cardElement = container.querySelector(`[data-card-id="${cardId}"]`);
    if (!cardElement) {
      throw new Error("Expected card element to be present.");
    }

    act(() => {
      fireEvent(
        cardElement,
        createPointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        })
      );
      vi.advanceTimersByTime(400);
    });
    expect(document.querySelector("[data-card-preview]")).not.toBeNull();

    act(() => {
      fireEvent(
        document.body,
        createPointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 0,
          clientY: 0,
        })
      );
    });

    expect(document.querySelector("[data-card-preview]")).toBeNull();
  });
});
