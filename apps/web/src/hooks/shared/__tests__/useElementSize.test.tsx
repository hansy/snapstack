import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";

import { useElementSize, type UseElementSizeOptions } from "../useElementSize";

type ResizeObserverCallback = (entries: ResizeObserverEntry[]) => void;

const observers: MockResizeObserver[] = [];

class MockResizeObserver {
  private callback: ResizeObserverCallback;
  private observed = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  disconnect() {
    this.observed.clear();
  }

  trigger({ width, height }: { width: number; height: number }) {
    const target = this.observed.values().next().value ?? document.createElement("div");
    const entry = {
      target,
      contentRect: { width, height },
    } as unknown as ResizeObserverEntry;
    this.callback([entry]);
  }
}

const Probe: React.FC<{ options?: UseElementSizeOptions }> = ({ options }) => {
  const { ref, size } = useElementSize<HTMLDivElement>(options);
  return (
    <div>
      <div ref={ref} />
      <div data-testid="size">
        {size.width}x{size.height}
      </div>
    </div>
  );
};

describe("useElementSize", () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", MockResizeObserver as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates the size when ResizeObserver fires", async () => {
    render(<Probe options={{ debounceMs: 0 }} />);

    await waitFor(() => {
      expect(observers).toHaveLength(1);
    });

    act(() => {
      observers[0].trigger({ width: 200, height: 100 });
    });

    await waitFor(() => {
      expect(screen.getByTestId("size").textContent).toBe("200x100");
    });
  });

  it("does not update for small changes under the threshold", async () => {
    render(<Probe options={{ debounceMs: 0, thresholdPx: 1 }} />);

    await waitFor(() => {
      expect(observers).toHaveLength(1);
    });

    act(() => {
      observers[0].trigger({ width: 10, height: 10 });
    });

    await waitFor(() => {
      expect(screen.getByTestId("size").textContent).toBe("10x10");
    });

    act(() => {
      observers[0].trigger({ width: 10.5, height: 10.5 });
    });

    await waitFor(() => {
      expect(screen.getByTestId("size").textContent).toBe("10x10");
    });
  });
});
