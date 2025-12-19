import * as React from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

import type { ScryfallCard } from "@/types/scryfall";

import { useGameStore } from "@/store/gameStore";
import { ZONE } from "@/constants/zones";
import { createDebouncedTokenSearch } from "@/services/scryfall/scryfallTokens";
import { cacheCards } from "@/services/scryfall/scryfallCache";
import { isAbortError } from "@/lib/errors";
import { planTokenCards } from "@/models/game/token-creation/tokenCreationModel";

export type TokenCreationControllerInput = {
  isOpen: boolean;
  onClose: () => void;
  playerId: string;
};

export const useTokenCreationController = ({
  isOpen,
  onClose,
  playerId,
}: TokenCreationControllerInput) => {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ScryfallCard[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [selectedToken, setSelectedToken] = React.useState<ScryfallCard | null>(null);
  const [quantity, setQuantity] = React.useState(1);

  const addCard = useGameStore((state) => state.addCard);

  const [debouncedSearch] = React.useState(() => createDebouncedTokenSearch());

  const resetState = React.useCallback(() => {
    setQuery("");
    setResults([]);
    setSelectedToken(null);
    setQuantity(1);
    setHasSearched(false);
    setIsLoading(false);
  }, []);

  const handleClose = React.useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  React.useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(false);

    debouncedSearch
      .search(query)
      .then((data) => {
        if (data && data.data) {
          setResults(data.data);
        } else {
          setResults([]);
        }
        setHasSearched(true);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.error("[TokenCreationModal] Token search error:", err);
        setHasSearched(true);
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      debouncedSearch.cancel();
    };
  }, [query, debouncedSearch]);

  const handleCreate = React.useCallback(() => {
    if (!selectedToken) return;

    const battlefieldZoneId = `${playerId}-${ZONE.BATTLEFIELD}`;
    const state = useGameStore.getState();
    const battlefield = state.zones[battlefieldZoneId];

    cacheCards([selectedToken]).catch((err) => {
      console.warn("[TokenCreationModal] Failed to cache token card:", err);
    });

    const planned = planTokenCards({
      token: selectedToken,
      playerId,
      battlefieldZoneId,
      existingBattlefieldCardIds: battlefield?.cardIds ?? [],
      cardsById: state.cards,
      quantity,
      createId: uuidv4,
    });

    planned.forEach((card) => addCard(card));

    toast.success(
      `Created ${quantity} ${selectedToken.name} token${quantity > 1 ? "s" : ""}`
    );
    handleClose();
  }, [addCard, handleClose, playerId, quantity, selectedToken]);

  return {
    isOpen,
    handleClose,
    query,
    setQuery,
    results,
    isLoading,
    hasSearched,
    selectedToken,
    setSelectedToken,
    quantity,
    decrementQuantity: () => setQuantity((q) => Math.max(1, q - 1)),
    incrementQuantity: () => setQuantity((q) => q + 1),
    handleCreate,
  };
};

export type TokenCreationController = ReturnType<typeof useTokenCreationController>;

