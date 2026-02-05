import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  HAND_DEFAULT_HEIGHT,
  HAND_MAX_HEIGHT,
  HAND_MIN_HEIGHT,
  HAND_SNAP_RELEASE_PX,
  HAND_SNAP_THRESHOLD_PX,
} from "../handSizing";
import { BottomBar } from "../BottomBar";

describe("BottomBar", () => {
  let onHeightChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onHeightChange = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders children correctly", () => {
      render(
        <BottomBar isTop={false} isRight={false}>
          <div data-testid="test-child">Test Content</div>
        </BottomBar>
      );

      expect(screen.getByTestId("test-child")).toBeTruthy();
      expect(screen.getByTestId("test-child").textContent).toBe("Test Content");
    });

    it("applies default height when not specified", () => {
      const { container } = render(
        <BottomBar isTop={false} isRight={false}>
          <div>Content</div>
        </BottomBar>
      );

      const bottomBar = container.querySelector(".flex.w-full.shrink-0");
      expect(bottomBar).toBeTruthy();
      expect((bottomBar as HTMLElement).style.height).toBe(
        `var(--hand-h, ${HAND_DEFAULT_HEIGHT}px)`
      );
    });

    it("applies custom height when specified", () => {
      const { container } = render(
        <BottomBar isTop={false} isRight={false} height={250}>
          <div>Content</div>
        </BottomBar>
      );

      const bottomBar = container.querySelector(".flex.w-full.shrink-0");
      expect(bottomBar).toBeTruthy();
      expect((bottomBar as HTMLElement).style.height).toBe(
        "var(--hand-h, 250px)"
      );
    });

    it("applies flex-row-reverse when isRight is true", () => {
      const { container } = render(
        <BottomBar isTop={false} isRight={true}>
          <div>Content</div>
        </BottomBar>
      );

      const bottomBar = container.querySelector(".flex-row-reverse");
      expect(bottomBar).toBeTruthy();
    });

    it("applies flex-row when isRight is false", () => {
      const { container } = render(
        <BottomBar isTop={false} isRight={false}>
          <div>Content</div>
        </BottomBar>
      );

      const bottomBar = container.querySelector(".flex-row");
      expect(bottomBar).toBeTruthy();
    });
  });

  describe("Resize Handle Positioning", () => {
    it("positions resize handle at top when isTop is false", () => {
      const { container } = render(
        <BottomBar isTop={false} isRight={false} onHeightChange={onHeightChange}>
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");
      expect(resizeHandle).toBeTruthy();
      expect(resizeHandle?.classList.contains("top-0")).toBe(true);
      expect(resizeHandle?.classList.contains("bottom-0")).toBe(false);
    });

    it("positions resize handle at bottom when isTop is true", () => {
      const { container } = render(
        <BottomBar isTop={true} isRight={false} onHeightChange={onHeightChange}>
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");
      expect(resizeHandle).toBeTruthy();
      expect(resizeHandle?.classList.contains("bottom-0")).toBe(true);
      expect(resizeHandle?.classList.contains("top-0")).toBe(false);
    });
  });

  describe("Mouse Interactions", () => {
    it("changes cursor to ns-resize when hovering over resize handle", () => {
      const { container } = render(
        <BottomBar isTop={false} isRight={false} onHeightChange={onHeightChange}>
          <div>Content</div>
        </BottomBar>
      );

      const hitArea = container.querySelector(".cursor-ns-resize");
      expect(hitArea).toBeTruthy();
    });

    it("calls onHeightChange when dragging from bottom position", () => {
      const { container } = render(
        <BottomBar
          isTop={false}
          isRight={false}
          height={160}
          onHeightChange={onHeightChange}
        >
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");
      expect(resizeHandle).toBeTruthy();

      // Simulate mousedown on resize handle
      fireEvent.mouseDown(resizeHandle!, { clientY: 100 });

      // Simulate mousemove to drag up (increase height)
      fireEvent.mouseMove(document, { clientY: 50 });

      // onHeightChange should have been called
      expect(onHeightChange).toHaveBeenCalled();

      // Simulate mouseup to end drag
      fireEvent.mouseUp(document);
    });

    it("calls onHeightChange when dragging from top position", () => {
      const { container } = render(
        <BottomBar
          isTop={true}
          isRight={false}
          height={160}
          onHeightChange={onHeightChange}
        >
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");
      expect(resizeHandle).toBeTruthy();

      // Simulate mousedown on resize handle
      fireEvent.mouseDown(resizeHandle!, { clientY: 100 });

      // Simulate mousemove to drag down (increase height)
      fireEvent.mouseMove(document, { clientY: 150 });

      // onHeightChange should have been called
      expect(onHeightChange).toHaveBeenCalled();

      // Simulate mouseup to end drag
      fireEvent.mouseUp(document);
    });

    it("does not render a resize handle when onHeightChange is not provided", () => {
      const { container } = render(
        <BottomBar isTop={false} isRight={false} height={160}>
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");
      const hitArea = container.querySelector(".cursor-ns-resize");
      expect(resizeHandle).toBeNull();
      expect(hitArea).toBeNull();
    });

    it("stops calling onHeightChange after mouseup", () => {
      const { container } = render(
        <BottomBar
          isTop={false}
          isRight={false}
          height={160}
          onHeightChange={onHeightChange}
        >
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");

      // Start drag
      fireEvent.mouseDown(resizeHandle!, { clientY: 100 });
      fireEvent.mouseMove(document, { clientY: 50 });

      const callCountDuringDrag = onHeightChange.mock.calls.length;
      expect(callCountDuringDrag).toBeGreaterThan(0);

      // End drag
      fireEvent.mouseUp(document);

      // Move mouse again - should not trigger onHeightChange
      onHeightChange.mockClear();
      fireEvent.mouseMove(document, { clientY: 30 });

      expect(onHeightChange).not.toHaveBeenCalled();
    });
  });

  describe("Height Constraints", () => {
    it("enforces minimum height of 120px", () => {
      const { container } = render(
        <BottomBar
          isTop={false}
          isRight={false}
          height={160}
          onHeightChange={onHeightChange}
        >
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");

      // Start drag
      fireEvent.mouseDown(resizeHandle!, { clientY: 100 });

      // Try to drag to very small height (would be < 120)
      fireEvent.mouseMove(document, { clientY: 1000 });

      // Should enforce minimum of 120
      const lastCall = onHeightChange.mock.calls[onHeightChange.mock.calls.length - 1];
      if (lastCall) {
        expect(lastCall[0]).toBeGreaterThanOrEqual(HAND_MIN_HEIGHT);
      }

      fireEvent.mouseUp(document);
    });

    it("enforces maximum height of 400px", () => {
      const { container } = render(
        <BottomBar
          isTop={false}
          isRight={false}
          height={160}
          onHeightChange={onHeightChange}
        >
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");

      // Start drag
      fireEvent.mouseDown(resizeHandle!, { clientY: 100 });

      // Try to drag to very large height (would be > 400)
      fireEvent.mouseMove(document, { clientY: -1000 });

      // Should enforce maximum of 400
      const lastCall = onHeightChange.mock.calls[onHeightChange.mock.calls.length - 1];
      if (lastCall) {
        expect(lastCall[0]).toBeLessThanOrEqual(HAND_MAX_HEIGHT);
      }

      fireEvent.mouseUp(document);
    });
  });

  describe("Visual Feedback", () => {
    it("shows hover state on resize indicator", () => {
      const { container } = render(
        <BottomBar isTop={false} isRight={false} onHeightChange={onHeightChange}>
          <div>Content</div>
        </BottomBar>
      );

      const visualIndicator = container.querySelector(
        ".absolute.left-0.right-0.transition-all"
      );
      expect(visualIndicator).toBeTruthy();

      const resizeHandle = container.querySelector(".cursor-ns-resize");
      fireEvent.mouseEnter(resizeHandle!);
      expect(visualIndicator?.classList.contains("bg-indigo-400/50")).toBe(true);
      fireEvent.mouseLeave(resizeHandle!);
    });

    it("shows dragging state on resize indicator", () => {
      const { container } = render(
        <BottomBar
          isTop={false}
          isRight={false}
          height={160}
          onHeightChange={onHeightChange}
        >
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");

      // Start dragging
      fireEvent.mouseDown(resizeHandle!, { clientY: 100 });

      // Query the visual indicator after the state change
      const visualIndicator = container.querySelector(
        ".bg-indigo-500"
      );

      // Check that dragging state is applied (visual indicator should exist with dragging classes)
      expect(visualIndicator).toBeTruthy();

      // End dragging
      fireEvent.mouseUp(document);
    });
  });

  describe("Snap to Default", () => {
    it("snaps to default height within the snap threshold", () => {
      const { container } = render(
        <BottomBar
          isTop={true}
          isRight={false}
          height={HAND_DEFAULT_HEIGHT}
          onHeightChange={onHeightChange}
        >
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");

      fireEvent.mouseDown(resizeHandle!, { clientY: 100 });
      fireEvent.mouseMove(document, {
        clientY: 100 + (HAND_SNAP_THRESHOLD_PX - 1),
      });

      const lastCall = onHeightChange.mock.calls[onHeightChange.mock.calls.length - 1];
      expect(lastCall?.[0]).toBe(HAND_DEFAULT_HEIGHT);

      fireEvent.mouseUp(document);
    });

    it("releases snap after exceeding the release threshold", () => {
      const { container } = render(
        <BottomBar
          isTop={true}
          isRight={false}
          height={HAND_DEFAULT_HEIGHT}
          onHeightChange={onHeightChange}
        >
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");

      fireEvent.mouseDown(resizeHandle!, { clientY: 100 });
      fireEvent.mouseMove(document, {
        clientY: 100 + (HAND_SNAP_THRESHOLD_PX - 1),
      });
      fireEvent.mouseMove(document, {
        clientY: 100 + HAND_SNAP_RELEASE_PX + 5,
      });

      const lastCall = onHeightChange.mock.calls[onHeightChange.mock.calls.length - 1];
      expect(lastCall?.[0]).toBe(
        HAND_DEFAULT_HEIGHT + HAND_SNAP_RELEASE_PX + 5
      );

      fireEvent.mouseUp(document);
    });
  });

  describe("Cleanup", () => {
    it("removes event listeners when component unmounts during drag", () => {
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

      const { container, unmount } = render(
        <BottomBar
          isTop={false}
          isRight={false}
          height={160}
          onHeightChange={onHeightChange}
        >
          <div>Content</div>
        </BottomBar>
      );

      const resizeHandle = container.querySelector(".absolute.left-0.right-0.z-30");

      // Start dragging
      fireEvent.mouseDown(resizeHandle!, { clientY: 100 });

      // Unmount while dragging
      unmount();

      // Should have removed event listeners
      expect(removeEventListenerSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });
});
