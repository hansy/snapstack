import React from "react";
import { Search, Plus, Minus, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

import type { TokenCreationController } from "@/hooks/game/token-creation/useTokenCreationController";
import { getPreviewDimensions } from "@/hooks/game/seat/useSeatSizing";
import { useGameStore } from "@/store/gameStore";

export const TokenCreationModalView: React.FC<TokenCreationController> = ({
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
  decrementQuantity,
  incrementQuantity,
  handleCreate,
}) => {
  const baseCardWidthPx = useGameStore((state) => {
    const myPlayerId = state.myPlayerId;
    if (!myPlayerId) return undefined;
    return state.battlefieldGridSizing[myPlayerId]?.baseCardWidthPx;
  });
  const { previewWidthPx, previewHeightPx } = React.useMemo(
    () => getPreviewDimensions(baseCardWidthPx),
    [baseCardWidthPx]
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[94vw] max-w-[94vw] h-[94vh] max-h-[94vh] flex flex-col bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader className="border-b border-zinc-800 pb-4">
          <DialogTitle>Create Token</DialogTitle>
        </DialogHeader>

        <div className="border-b border-zinc-800 pb-4 bg-zinc-900/50 rounded-md px-4 py-3">
          <div className="flex items-center gap-2 bg-zinc-900 rounded-lg border border-zinc-700 px-4 py-3">
            <Search className="h-5 w-5 text-zinc-400" />
            <Input
              placeholder="Search for tokens (e.g. 'Treasure', 'Goblin')..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-zinc-100 placeholder:text-zinc-500"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mb-4 text-zinc-400 text-sm">
            {query.length > 0 && (
              <>
                {isLoading
                  ? "Searching..."
                  : `${results.length} result${results.length !== 1 ? "s" : ""} found`}
              </>
            )}
          </div>

          <div className="min-h-[300px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                <div className="text-zinc-400">Searching tokens...</div>
              </div>
            ) : results.length > 0 ? (
              <div className="flex flex-wrap gap-4 items-start">
                {results.map((token) => {
                  const imageUrl =
                    token.image_uris?.normal || token.card_faces?.[0]?.image_uris?.normal;
                  const isSelected = selectedToken?.id === token.id;

                  return (
                    <div
                      key={token.id}
                      onClick={() => setSelectedToken(token)}
                      className={`
                        relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all
                        ${isSelected ? "border-indigo-500 ring-2 ring-indigo-500/50" : "border-transparent hover:border-zinc-700"}
                      `}
                      style={{ width: previewWidthPx, height: previewHeightPx }}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={token.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center p-2 text-center text-xs text-zinc-500">
                          No Image Available
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 text-xs truncate text-center">
                        {token.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : hasSearched && query.length >= 3 ? (
              <div className="flex items-center justify-center h-full text-zinc-500">
                No tokens found.
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                Type at least 3 characters to search.
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800 bg-zinc-900/50 rounded-md px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="text-zinc-400 text-sm font-medium">Quantity:</label>
            <div className="flex items-center gap-2 bg-zinc-900 rounded-md border border-zinc-700 p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-sm hover:bg-zinc-800"
                onClick={decrementQuantity}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center text-sm font-mono">{quantity}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-sm hover:bg-zinc-800"
                onClick={incrementQuantity}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="border-zinc-700 hover:bg-zinc-800 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedToken}
              className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[100px]"
            >
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
