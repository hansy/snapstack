import * as React from "react";

import { useGameStore } from "@/store/gameStore";
import { PRESET_COUNTERS, resolveCounterColor } from "@/lib/counters";
import { batchSharedMutations } from "@/yjs/docManager";

import { getAllCounterTypes, normalizeCounterCount, normalizeCounterType, planAddCounter } from "@/models/game/add-counter/addCounterModel";

export type AddCounterControllerInput = {
  isOpen: boolean;
  onClose: () => void;
  cardIds: string[];
};

const DEFAULT_COUNTER_TYPE = "+1/+1";

export const useAddCounterController = ({
  isOpen,
  onClose,
  cardIds,
}: AddCounterControllerInput) => {
  const [counterType, setCounterType] = React.useState(DEFAULT_COUNTER_TYPE);
  const [count, setCount] = React.useState(1);

  const addCounterToCard = useGameStore((state) => state.addCounterToCard);
  const addGlobalCounter = useGameStore((state) => state.addGlobalCounter);
  const globalCounters = useGameStore((state) => state.globalCounters);

  React.useEffect(() => {
    if (!isOpen) return;
    setCounterType(DEFAULT_COUNTER_TYPE);
    setCount(1);
  }, [isOpen]);

  const handleCounterTypeChange = React.useCallback((next: string) => {
    setCounterType(next);
  }, []);

  const handleSelectType = React.useCallback((type: string) => {
    setCounterType(type);
  }, []);

  const handleCountChange = React.useCallback((raw: string) => {
    const parsed = parseInt(raw, 10);
    setCount(normalizeCounterCount(Number.isNaN(parsed) ? 1 : parsed));
  }, []);

  const allCounterTypes = React.useMemo(
    () =>
      getAllCounterTypes({
        presetTypes: PRESET_COUNTERS.map((preset) => preset.type),
        globalCounterTypes: Object.keys(globalCounters),
      }),
    [globalCounters]
  );

  const quickSelect = React.useMemo(
    () =>
      allCounterTypes.map((type) => ({
        type,
        color: resolveCounterColor(type, globalCounters),
        isSelected: normalizeCounterType(counterType) === type,
      })),
    [allCounterTypes, counterType, globalCounters]
  );

  const canSubmit = Boolean(normalizeCounterType(counterType));

  const handleAdd = React.useCallback(() => {
    const planned = planAddCounter({
      rawType: counterType,
      rawCount: count,
      globalCounters,
      resolveColor: resolveCounterColor,
    });

    if (!planned) return;

    const targets = cardIds.length > 0 ? cardIds : [];
    if (targets.length === 0) return;

    batchSharedMutations(() => {
      targets.forEach((targetId) => {
        addCounterToCard(targetId, planned.counter);
      });
    });

    if (planned.shouldAddGlobalCounter) {
      addGlobalCounter(planned.counter.type, planned.counter.color);
    }

    onClose();
  }, [addCounterToCard, addGlobalCounter, cardIds, count, counterType, globalCounters, onClose]);

  return {
    isOpen,
    handleClose: onClose,
    counterType,
    handleCounterTypeChange,
    handleSelectType,
    count,
    handleCountChange,
    quickSelect,
    canSubmit,
    handleAdd,
  };
};

export type AddCounterController = ReturnType<typeof useAddCounterController>;
