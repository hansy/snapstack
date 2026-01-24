import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScryfallCard } from "@/types";
import { useScryfallCards } from "../useScryfallCard";

const getCards = vi.hoisted(() => vi.fn());
const getCard = vi.hoisted(() => vi.fn());

vi.mock("@/services/scryfall/scryfallCache", () => ({
  getCards,
  getCard,
}));

describe("useScryfallCards", () => {
  beforeEach(() => {
    getCards.mockReset();
    getCard.mockReset();
  });

  it("dedupes ids before fetching", async () => {
    const cardA = { id: "a" } as ScryfallCard;
    const cardB = { id: "b" } as ScryfallCard;
    getCards.mockResolvedValue({
      cards: new Map([
        ["a", cardA],
        ["b", cardB],
      ]),
      errors: [],
    });

    const { result } = renderHook(() =>
      useScryfallCards(["b", "a", "a", "  ", "b"])
    );

    await waitFor(() => expect(getCards).toHaveBeenCalledTimes(1));
    expect(getCards).toHaveBeenCalledWith(["a", "b"]);
    await waitFor(() => {
      expect(result.current.data.get("a")).toBe(cardA);
      expect(result.current.data.get("b")).toBe(cardB);
    });
  });
});
