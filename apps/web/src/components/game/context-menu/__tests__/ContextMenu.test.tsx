import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { ContextMenuItem } from "../ContextMenu";
import { ContextMenu } from "../ContextMenu";

const createItems = (overrides: Partial<ContextMenuItem> = {}): ContextMenuItem[] => [
  {
    type: "action",
    label: "Action 1",
    onSelect: vi.fn(),
    ...overrides,
  } as ContextMenuItem,
];

describe("ContextMenu", () => {
  it("renders items and triggers selection", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();

    render(
      <ContextMenu
        x={10}
        y={10}
        items={[{ type: "action", label: "Do thing", onSelect }]}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Do thing" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on click outside (root menu only)", () => {
    const onClose = vi.fn();

    render(<ContextMenu x={10} y={10} items={createItems()} onClose={onClose} />);

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when mousedown happens inside the menu", () => {
    const onClose = vi.fn();

    render(<ContextMenu x={10} y={10} items={createItems()} onClose={onClose} />);

    const root = document.querySelector("[data-context-menu-root]");
    expect(root).toBeTruthy();

    fireEvent.mouseDown(root!);
    expect(onClose).toHaveBeenCalledTimes(0);
  });
});

