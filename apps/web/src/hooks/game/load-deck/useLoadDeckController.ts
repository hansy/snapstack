import * as React from "react";
import { toast } from "sonner";

import {
  createCardFromImport,
  fetchScryfallCards,
  parseDeckList,
  validateDeckListLimits,
  validateImportResult,
} from "@/services/deck-import/deckImport";
import { useGameStore } from "@/store/gameStore";
import { batchSharedMutations, getYDocHandles, getYProvider } from "@/yjs/docManager";
import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { isMultiplayerProviderReady, planDeckImport } from "@/models/game/load-deck/loadDeckModel";

export type LoadDeckControllerInput = {
  isOpen: boolean;
  onClose: () => void;
  playerId: string;
};

export const useLoadDeckController = ({
  isOpen,
  onClose,
  playerId,
}: LoadDeckControllerInput) => {
  const [importText, setImportText] = React.useState("");
  const [isImporting, setIsImporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [prefilledFromLastImport, setPrefilledFromLastImport] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const wasOpenRef = React.useRef(false);

  const addCard = useGameStore((state) => state.addCard);
  const addZone = useGameStore((state) => state.addZone);
  const setDeckLoaded = useGameStore((state) => state.setDeckLoaded);
  const shuffleLibrary = useGameStore((state) => state.shuffleLibrary);
  const zones = useGameStore((state) => state.zones);
  const viewerRole = useGameStore((state) => state.viewerRole);

  const lastImportedDeckText = useClientPrefsStore((state) => state.lastImportedDeckText);
  const setLastImportedDeckText = useClientPrefsStore((state) => state.setLastImportedDeckText);

  React.useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!justOpened) return;

    setError(null);

    const stored = (lastImportedDeckText ?? "").trim();
    if (stored) {
      setImportText(stored);
      setPrefilledFromLastImport(true);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 0);
    } else {
      setPrefilledFromLastImport(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isOpen, lastImportedDeckText]);

  const handleImportTextChange = React.useCallback(
    (next: string) => {
      if (prefilledFromLastImport) setPrefilledFromLastImport(false);
      setImportText(next);
    },
    [prefilledFromLastImport]
  );

  const handleImport = React.useCallback(async () => {
    if (viewerRole === "spectator") return;
    if (!importText.trim()) return;

    const handles = getYDocHandles();
    const provider = getYProvider();
    if (!isMultiplayerProviderReady({ handles, provider })) {
      toast.error("Connecting to multiplayer, please wait a moment then try again.");
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const planned = await planDeckImport({
        importText,
        playerId,
        zones,
        parseDeckList,
        validateDeckListLimits,
        fetchScryfallCards,
        validateImportResult,
      });

      if (planned.warnings.length) {
        toast.warning("Imported with warnings", {
          description: planned.warnings.join("\n"),
        });
      }

      const missingZones = new Map<string, (typeof planned.chunks)[number][number]["zoneType"]>();
      planned.chunks.forEach((chunk) => {
        chunk.forEach(({ zoneId, zoneType }) => {
          if (!zones[zoneId] && !missingZones.has(zoneId)) {
            missingZones.set(zoneId, zoneType);
          }
        });
      });

      if (missingZones.size) {
        batchSharedMutations(() => {
          missingZones.forEach((zoneType, zoneId) => {
            addZone({ id: zoneId, ownerId: playerId, type: zoneType, cardIds: [] });
          });
        });
      }

      planned.chunks.forEach((chunk) => {
        batchSharedMutations(() => {
          chunk.forEach(({ cardData, zoneId }) => {
            const newCard = createCardFromImport(cardData, playerId, zoneId);
            addCard(newCard);
          });
        });
      });

      batchSharedMutations(() => {
        setDeckLoaded(playerId, true);
        shuffleLibrary(playerId, playerId);
      });

      toast.success("Deck successfully loaded");
      setLastImportedDeckText(importText);
      setImportText("");
      onClose();
    } catch (err: any) {
      console.error("[LoadDeckModal] Import failed:", err);
      setError(err?.message || "Failed to import deck. Please check the format.");
    } finally {
      setIsImporting(false);
    }
  }, [
    addCard,
    importText,
    onClose,
    playerId,
    setDeckLoaded,
    setLastImportedDeckText,
    shuffleLibrary,
    viewerRole,
    zones,
  ]);

  return {
    isOpen,
    handleClose: onClose,
    textareaRef,
    importText,
    handleImportTextChange,
    prefilledFromLastImport,
    error,
    isImporting,
    handleImport,
  };
};

export type LoadDeckController = ReturnType<typeof useLoadDeckController>;
