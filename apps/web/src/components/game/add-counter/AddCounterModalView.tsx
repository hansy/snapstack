import React from "react";

import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { cn } from "@/lib/utils";

import type { AddCounterController } from "@/hooks/game/add-counter/useAddCounterController";

export const AddCounterModalView: React.FC<AddCounterController> = ({
  isOpen,
  handleClose,
  counterType,
  handleCounterTypeChange,
  handleSelectType,
  count,
  handleCountChange,
  quickSelect,
  canSubmit,
  handleAdd,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="ds-dialog-size-xs bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Add Counter</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-1 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <div className="flex-1">
              <label
                htmlFor="customName"
                className="text-xs font-medium text-zinc-400 mb-1 block"
              >
                Counter Name
              </label>
              <Input
                id="customName"
                value={counterType}
                onChange={(e) => handleCounterTypeChange(e.target.value)}
                maxLength={64}
                className="bg-zinc-800 border-zinc-700 w-full"
                placeholder="e.g. +1/+1, Poison"
                autoFocus
              />
            </div>

            <div className="w-full sm:w-24">
              <label htmlFor="count" className="text-xs font-medium text-zinc-400 mb-1 block">
                Count
              </label>
              <Input
                id="count"
                type="number"
                min={1}
                value={count}
                onChange={(e) => handleCountChange(e.target.value)}
                className="bg-zinc-800 border-zinc-700 w-full"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 mb-2 block">Quick Select</label>
            <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto p-1">
              {quickSelect.map((item) => (
                <Button
                  key={item.type}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectType(item.type)}
                  className={cn(
                    "capitalize border-zinc-700 text-zinc-200 bg-zinc-800 hover:bg-zinc-700 hover:text-white",
                    item.isSelected && "ring-2 ring-indigo-500 border-transparent bg-zinc-700"
                  )}
                >
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.type}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            className="bg-transparent border-zinc-700 hover:bg-zinc-800 text-zinc-300"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!canSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Add Counter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
