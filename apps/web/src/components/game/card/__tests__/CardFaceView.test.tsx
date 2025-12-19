import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { CardFaceModel } from "@/models/game/card/cardFaceModel";
import { CardFaceView } from "../CardFaceView";

const buildModel = (overrides: Partial<CardFaceModel> = {}): CardFaceModel => ({
  displayImageUrl: overrides.displayImageUrl,
  displayName: overrides.displayName ?? "Test Card",
  showPT: overrides.showPT ?? false,
  displayPower: overrides.displayPower ?? "2",
  displayToughness: overrides.displayToughness ?? "3",
  powerClassName: overrides.powerClassName ?? "text-white",
  toughnessClassName: overrides.toughnessClassName ?? "text-white",
  showNameLabel: overrides.showNameLabel ?? false,
  counters: overrides.counters ?? [],
  reveal: overrides.reveal ?? null,
});

describe("CardFaceView", () => {
  it("renders the artwork image when available", () => {
    render(
      <CardFaceView
        model={buildModel({
          displayName: "Island",
          displayImageUrl: "https://example.com/island.jpg",
        })}
      />
    );

    const img = screen.getByRole("img", { name: "Island" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://example.com/island.jpg");
  });

  it("renders fallback text when no image is available", () => {
    render(<CardFaceView model={buildModel({ displayName: "Mystery Card" })} />);
    expect(screen.getByText("Mystery Card")).toBeTruthy();
  });

  it("calls onPTDelta when interacting with power/toughness controls", () => {
    const onPTDelta = vi.fn();
    render(
      <CardFaceView
        model={buildModel({
          showPT: true,
          displayPower: "1",
          displayToughness: "1",
        })}
        interactive
        onPTDelta={onPTDelta}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase power" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease toughness" }));

    expect(onPTDelta).toHaveBeenCalledWith("power", 1);
    expect(onPTDelta).toHaveBeenCalledWith("toughness", -1);
  });

  it("calls counter callbacks when interactive", () => {
    const onIncrementCounter = vi.fn();
    const onDecrementCounter = vi.fn();

    render(
      <CardFaceView
        model={buildModel({
          counters: [
            { type: "+1/+1", count: 2, renderColor: "rgb(0, 0, 0)" },
          ],
        })}
        interactive
        showCounterLabels
        onIncrementCounter={onIncrementCounter}
        onDecrementCounter={onDecrementCounter}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Increment +1/+1 counter" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Decrement +1/+1 counter" })
    );

    expect(onIncrementCounter).toHaveBeenCalledTimes(1);
    expect(onIncrementCounter).toHaveBeenCalledWith(
      expect.objectContaining({ type: "+1/+1" })
    );
    expect(onDecrementCounter).toHaveBeenCalledTimes(1);
    expect(onDecrementCounter).toHaveBeenCalledWith("+1/+1");
  });

  it("renders the reveal badge when provided", () => {
    render(
      <CardFaceView
        model={buildModel({
          displayName: "Revealed Card",
          reveal: { toAll: true, title: "Revealed to everyone", playerNames: [] },
        })}
      />
    );

    expect(screen.getByTitle("Revealed to everyone")).toBeTruthy();
  });
});

