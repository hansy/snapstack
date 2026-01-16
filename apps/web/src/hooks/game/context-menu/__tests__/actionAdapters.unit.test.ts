import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCardActionAdapters, createZoneActionAdapters } from "../actionAdapters";
import { useSelectionStore } from "@/store/selectionStore";

beforeEach(() => {
  useSelectionStore.setState({ selectedCardIds: [], selectionZoneId: null });
});

describe("gameContextMenu actionAdapters", () => {
  it("card adapters forward actions with myPlayerId", () => {
    const store = {
      cards: {
        c1: { id: "c1", zoneId: "z1", tapped: false, isToken: true },
      },
      moveCard: vi.fn(),
      moveCardToBottom: vi.fn(),
      tapCard: vi.fn(),
      transformCard: vi.fn(),
      duplicateCard: vi.fn(),
      updateCard: vi.fn(),
      setCardReveal: vi.fn(),
      addCounterToCard: vi.fn(),
      removeCounterFromCard: vi.fn(),
      setActiveModal: vi.fn(),
      removeCard: vi.fn(),
      drawCard: vi.fn(),
      shuffleLibrary: vi.fn(),
      resetDeck: vi.fn(),
      mulligan: vi.fn(),
      unloadDeck: vi.fn(),
    } as any;

    const createRelatedCard = vi.fn();
    const openTextPrompt = vi.fn();

    const adapters = createCardActionAdapters({
      store,
      myPlayerId: "me",
      createRelatedCard,
      openTextPrompt,
    });

    adapters.moveCard("c1", "z2", { x: 1, y: 2 }, "other", true, { faceDown: true });
    expect(store.moveCard).toHaveBeenCalledWith(
      "c1",
      "z2",
      { x: 1, y: 2 },
      "me",
      true,
      { faceDown: true }
    );

    adapters.moveCardToBottom("c1", "lib");
    expect(store.moveCardToBottom).toHaveBeenCalledWith("c1", "lib", "me");

    adapters.tapCard("c1");
    expect(store.tapCard).toHaveBeenCalledWith("c1", "me");

    adapters.transformCard("c1", 1);
    expect(store.transformCard).toHaveBeenCalledWith("c1", 1);

    adapters.duplicateCard("c1");
    expect(store.duplicateCard).toHaveBeenCalledWith("c1", "me");

    adapters.updateCard("c1", { name: "Updated" });
    expect(store.updateCard).toHaveBeenCalledWith("c1", { name: "Updated" }, "me");

    adapters.setCardReveal("c1", { toAll: true });
    expect(store.setCardReveal).toHaveBeenCalledWith("c1", { toAll: true }, "me");

    adapters.addCounter("c1", { type: "+1/+1", count: 1 });
    expect(store.addCounterToCard).toHaveBeenCalledWith("c1", { type: "+1/+1", count: 1 }, "me");

    adapters.removeCounter("c1", "+1/+1");
    expect(store.removeCounterFromCard).toHaveBeenCalledWith("c1", "+1/+1", "me");

    adapters.openAddCounterModal(["c1"]);
    expect(store.setActiveModal).toHaveBeenCalledWith({ type: "ADD_COUNTER", cardIds: ["c1"] });

    adapters.removeCard({ id: "c1" } as any);
    expect(store.removeCard).toHaveBeenCalledWith("c1", "me");

    const related = { name: "Token", uri: "token", component: "token" };
    adapters.createRelatedCard(store.cards.c1 as any, related as any);
    expect(createRelatedCard).toHaveBeenCalledWith(store.cards.c1, related);
    expect(adapters.openTextPrompt).toBe(openTextPrompt);
  });

  it("card adapters apply actions to selected cards", () => {
    useSelectionStore.setState({
      selectedCardIds: ["c1", "c2"],
      selectionZoneId: "z1",
    });
    const store = {
      cards: {
        c1: { id: "c1", zoneId: "z1", tapped: false, isToken: true },
        c2: { id: "c2", zoneId: "z1", tapped: false, isToken: true },
      },
      addCounterToCard: vi.fn(),
    } as any;

    const adapters = createCardActionAdapters({
      store,
      myPlayerId: "me",
      createRelatedCard: vi.fn(),
    });

    adapters.addCounter("c1", { type: "+1/+1", count: 1 });

    expect(store.addCounterToCard).toHaveBeenCalledTimes(2);
    expect(store.addCounterToCard).toHaveBeenCalledWith(
      "c1",
      { type: "+1/+1", count: 1 },
      "me"
    );
    expect(store.addCounterToCard).toHaveBeenCalledWith(
      "c2",
      { type: "+1/+1", count: 1 },
      "me"
    );
  });

  it("zone adapters forward actions with myPlayerId", () => {
    const store = {
      moveCard: vi.fn(),
      tapCard: vi.fn(),
      transformCard: vi.fn(),
      duplicateCard: vi.fn(),
      updateCard: vi.fn(),
      setCardReveal: vi.fn(),
      addCounterToCard: vi.fn(),
      removeCounterFromCard: vi.fn(),
      setActiveModal: vi.fn(),
      removeCard: vi.fn(),
      drawCard: vi.fn(),
      shuffleLibrary: vi.fn(),
      resetDeck: vi.fn(),
      mulligan: vi.fn(),
      unloadDeck: vi.fn(),
    } as any;

    const adapters = createZoneActionAdapters({ store, myPlayerId: "me" });

    adapters.drawCard("me");
    expect(store.drawCard).toHaveBeenCalledWith("me", "me");

    adapters.shuffleLibrary("me");
    expect(store.shuffleLibrary).toHaveBeenCalledWith("me", "me");

    adapters.resetDeck("me");
    expect(store.resetDeck).toHaveBeenCalledWith("me", "me");

    adapters.mulligan("me", 7);
    expect(store.mulligan).toHaveBeenCalledWith("me", 7, "me");

    adapters.unloadDeck("me");
    expect(store.unloadDeck).toHaveBeenCalledWith("me", "me");
  });
});
