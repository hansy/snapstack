import React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { cn } from "@/lib/utils";

import type { LoadDeckController } from "@/hooks/game/load-deck/useLoadDeckController";

export const LoadDeckModalView: React.FC<LoadDeckController> = ({
  isOpen,
  handleClose,
  textareaRef,
  importText,
  handleImportTextChange,
  prefilledFromLastImport,
  error,
  isImporting,
  handleImport,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Load Deck</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Paste your decklist below (e.g., &quot;4 Lightning Bolt&quot;).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <textarea
            ref={textareaRef}
            value={importText}
            onChange={(e) => handleImportTextChange(e.target.value)}
            placeholder={"4 Lightning Bolt\n20 Mountain..."}
            className={cn(
              "w-full h-64 bg-zinc-900 border border-zinc-800 rounded-md p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none placeholder:text-zinc-600",
              prefilledFromLastImport && "ring-2 ring-amber-500/30 border-amber-500/50"
            )}
          />

          {prefilledFromLastImport && (
            <div className="text-amber-200/80 text-xs bg-amber-950/30 p-2 rounded border border-amber-900/50">
              Loaded your last imported deck — paste to replace.
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm bg-red-950/30 p-2 rounded border border-red-900/50">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300"
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || !importText.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            {isImporting ? "Loading..." : "Load Deck"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

