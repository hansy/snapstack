import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, render, waitFor } from "@testing-library/react";

import type { Card } from "@/types";
import { useSelectionStore } from "@/store/selectionStore";

import { useBattlefieldSelection } from "../useBattlefieldSelection";

let latestSelection: ReturnType<typeof useBattlefieldSelection> | null = null;
let latestZoneNode: HTMLDivElement | null = null;

const buildCard = (overrides: Partial<Card>): Card =>
  ({
    id: overrides.id ?? "c1",
    name: overrides.name ?? "Card",
    ownerId: overrides.ownerId ?? "me",
    controllerId: overrides.controllerId ?? "me",
    zoneId: overrides.zoneId ?? "zone-1",
    tapped: overrides.tapped ?? false,
    faceDown: overrides.faceDown ?? false,
    position: overrides.position ?? { x: 0.5, y: 0.5 },
    rotation: overrides.rotation ?? 0,
    counters: overrides.counters ?? [],
  }) as Card;

type HarnessProps = {
  cards: Card[];
  zoneSize: { width: number; height: number };
  zoneId?: string;
  scale?: number;
  viewScale?: number;
  mirrorBattlefieldY?: boolean;
  isSelectionEnabled?: boolean;
};

const Harness: React.FC<HarnessProps> = ({
  cards,
  zoneSize,
  zoneId = "zone-1",
  scale = 1,
  viewScale = 1,
  mirrorBattlefieldY = false,
  isSelectionEnabled = true,
}) => {
  const zoneNodeRef = React.useRef<HTMLDivElement | null>(null);
  const selection = useBattlefieldSelection({
    zoneId,
    cards,
    zoneSize,
    scale,
    viewScale,
    mirrorBattlefieldY,
    zoneNodeRef,
    isSelectionEnabled,
  });

  React.useEffect(() => {
    latestSelection = selection;
  }, [selection]);

  const setZoneRef = React.useCallback((node: HTMLDivElement | null) => {
    zoneNodeRef.current = node;
    latestZoneNode = node;
  }, []);

  return <div data-testid="zone" ref={setZoneRef} />;
};

const setZoneRect = (node: HTMLDivElement, rect?: Partial<DOMRect>) => {
  const base: DOMRect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 600,
    width: 1000,
    height: 600,
    toJSON: () => ({}),
  } as DOMRect;

  const next = { ...base, ...rect };
  Object.defineProperty(node, "getBoundingClientRect", {
    value: () => next,
  });
};

const stubPointerCapture = (node: HTMLDivElement) => {
  (node as any).setPointerCapture = vi.fn();
  (node as any).releasePointerCapture = vi.fn();
};

const buildPointerEvent = (
  target: HTMLDivElement,
  params: {
    pointerId: number;
    clientX: number;
    clientY: number;
    shiftKey?: boolean;
    button?: number;
  }
): React.PointerEvent<HTMLDivElement> =>
  ({
    button: params.button ?? 0,
    pointerId: params.pointerId,
    clientX: params.clientX,
    clientY: params.clientY,
    shiftKey: params.shiftKey ?? false,
    target,
    currentTarget: target,
  } as unknown as React.PointerEvent<HTMLDivElement>);

describe("useBattlefieldSelection", () => {
  beforeEach(() => {
    latestSelection = null;
    latestZoneNode = null;
    useSelectionStore.setState({ selectedCardIds: [], selectionZoneId: null });

    let rafId = 1;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return rafId++;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignores pointer moves from other pointers", async () => {
    const card = buildCard({ id: "c1", position: { x: 0.5, y: 0.5 } });

    render(<Harness cards={[card]} zoneSize={{ width: 1000, height: 600 }} />);

    await waitFor(() => expect(latestSelection).not.toBeNull());
    expect(latestZoneNode).not.toBeNull();

    const zone = latestZoneNode!;
    setZoneRect(zone);
    stubPointerCapture(zone);

    act(() => {
      latestSelection!.handlePointerDown(
        buildPointerEvent(zone, {
          pointerId: 1,
          clientX: 100,
          clientY: 100,
          shiftKey: false,
        })
      );
    });

    act(() => {
      latestSelection!.handlePointerMove(
        buildPointerEvent(zone, {
          pointerId: 2,
          clientX: 800,
          clientY: 500,
          shiftKey: true,
        })
      );
    });

    expect(useSelectionStore.getState().selectedCardIds).toEqual([]);

    act(() => {
      latestSelection!.handlePointerMove(
        buildPointerEvent(zone, {
          pointerId: 1,
          clientX: 800,
          clientY: 500,
          shiftKey: true,
        })
      );
    });

    expect(useSelectionStore.getState().selectedCardIds).toEqual(["c1"]);
  });

  it("locks shift mode to pointer down", async () => {
    const cardA = buildCard({ id: "c1", position: { x: 0.8, y: 0.8 } });
    const cardB = buildCard({ id: "c2", position: { x: 0.2, y: 0.2 } });

    useSelectionStore.setState({
      selectedCardIds: ["c1"],
      selectionZoneId: "zone-1",
    });

    render(
      <Harness
        cards={[cardA, cardB]}
        zoneSize={{ width: 1000, height: 600 }}
      />
    );

    await waitFor(() => expect(latestSelection).not.toBeNull());
    expect(latestZoneNode).not.toBeNull();

    const zone = latestZoneNode!;
    setZoneRect(zone);
    stubPointerCapture(zone);

    act(() => {
      latestSelection!.handlePointerDown(
        buildPointerEvent(zone, {
          pointerId: 1,
          clientX: 100,
          clientY: 50,
          shiftKey: false,
        })
      );
    });

    act(() => {
      latestSelection!.handlePointerMove(
        buildPointerEvent(zone, {
          pointerId: 1,
          clientX: 300,
          clientY: 200,
          shiftKey: true,
        })
      );
    });

    expect(useSelectionStore.getState().selectedCardIds).toEqual(["c2"]);
  });
});
