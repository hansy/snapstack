import React from "react";

import { AddCounterModalView } from "./AddCounterModalView";
import { useAddCounterController } from "@/hooks/game/add-counter/useAddCounterController";

export interface AddCounterModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
}

export const AddCounterModal: React.FC<AddCounterModalProps> = (props) => {
  const controller = useAddCounterController(props);
  return <AddCounterModalView {...controller} />;
};

