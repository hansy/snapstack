import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ZONE } from "@/constants/zones";

import { SideZone } from "../SideZone";

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

const zone = {
  id: "library-me",
  ownerId: "me",
  type: ZONE.LIBRARY,
  cardIds: [],
};

describe("SideZone touch gestures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps touch double tap to onDoubleClick", () => {
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const { container } = render(
      <SideZone
        zone={zone as any}
        label="Library"
        count={0}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );

    const target = container.firstElementChild;
    if (!target) throw new Error("Expected SideZone root element");

    act(() => {
      fireEvent(
        target,
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
        target,
        createPointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          pointerType: "touch",
          pointerId: 1,
          clientX: 20,
          clientY: 20,
        })
      );
      vi.advanceTimersByTime(100);
      fireEvent(
        target,
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
        target,
        createPointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          pointerType: "touch",
          pointerId: 1,
          clientX: 20,
          clientY: 20,
        })
      );
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it("fires click when mouse events originate from a card target", () => {
    const onClick = vi.fn();
    const { getByTestId } = render(
      <SideZone
        zone={zone as any}
        label="Library"
        count={0}
        onClick={onClick}
        emptyContent={
          <button type="button" data-testid="card-target" data-card-id="card-1">
            Card
          </button>
        }
      />
    );

    fireEvent.click(getByTestId("card-target"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("maps touch double tap on a card target to onDoubleClick", () => {
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const { getByTestId } = render(
      <SideZone
        zone={zone as any}
        label="Library"
        count={0}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        emptyContent={
          <button type="button" data-testid="card-target" data-card-id="card-1">
            Card
          </button>
        }
      />
    );

    const target = getByTestId("card-target");

    act(() => {
      fireEvent(
        target,
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
        target,
        createPointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          pointerType: "touch",
          pointerId: 1,
          clientX: 20,
          clientY: 20,
        })
      );
      vi.advanceTimersByTime(100);
      fireEvent(
        target,
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
        target,
        createPointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          pointerType: "touch",
          pointerId: 1,
          clientX: 20,
          clientY: 20,
        })
      );
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });

  it("opens context menu on touch long press", () => {
    const onContextMenu = vi.fn();
    const { container } = render(
      <SideZone
        zone={zone as any}
        label="Library"
        count={0}
        onContextMenu={onContextMenu}
      />
    );

    const target = container.firstElementChild;
    if (!target) throw new Error("Expected SideZone root element");

    act(() => {
      fireEvent(
        target,
        createPointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "touch",
          pointerId: 1,
          clientX: 10,
          clientY: 10,
        })
      );
      vi.advanceTimersByTime(500);
    });

    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("opens context menu on touch long press from a card target", () => {
    const onContextMenu = vi.fn();
    const { getByTestId } = render(
      <SideZone
        zone={zone as any}
        label="Library"
        count={0}
        onContextMenu={onContextMenu}
        emptyContent={
          <button type="button" data-testid="card-target" data-card-id="card-1">
            Card
          </button>
        }
      />
    );

    const target = getByTestId("card-target");

    act(() => {
      fireEvent(
        target,
        createPointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "touch",
          pointerId: 1,
          clientX: 10,
          clientY: 10,
        })
      );
      vi.advanceTimersByTime(500);
    });

    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });
});
