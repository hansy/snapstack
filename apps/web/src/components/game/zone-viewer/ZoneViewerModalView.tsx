import React from "react";
import { Dialog, DialogContent } from "../../ui/dialog";
import { ContextMenu } from "../context-menu/ContextMenu";

import type { ZoneViewerController } from "@/hooks/game/zone-viewer/useZoneViewerController";
import { getPreviewDimensions, useIsLg } from "@/hooks/game/seat/useSeatSizing";
import { useGameStore } from "@/store/gameStore";
import { ZoneViewerModalHeader } from "./ZoneViewerModalHeader";
import { ZoneViewerGroupedView } from "./ZoneViewerGroupedView";
import { ZoneViewerLinearView } from "./ZoneViewerLinearView";

export const ZoneViewerModalView: React.FC<ZoneViewerController> = ({
  isOpen,
  onClose,
  zone,
  count,
  isLoading,
  expectedViewCount,
  filterText,
  setFilterText,
  containerRef,
  listRef,
  displayCards,
  viewMode,
  groupedCards,
  sortedKeys,
  canReorder,
  orderedCards,
  orderedCardIds,
  setOrderedCardIds,
  draggingId,
  setDraggingId,
  reorderList,
  commitReorder,
  handleContextMenu,
  contextMenu,
  closeContextMenu,
  interactionsDisabled,
  pinnedCardId,
}) => {
  const baseCardWidthPx = useGameStore((state) =>
    zone ? state.battlefieldGridSizing[zone.ownerId]?.baseCardWidthPx : undefined
  );
  const isLg = useIsLg();
  const isPreviewReady = !isLg || Boolean(baseCardWidthPx);
  const { previewWidthPx, previewHeightPx } = React.useMemo(
    () => getPreviewDimensions(baseCardWidthPx),
    [baseCardWidthPx]
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[94vw] max-w-[94vw] h-[94vh] max-h-[94vh] bg-zinc-950 border-zinc-800 text-zinc-100 flex flex-col">
        <div ref={containerRef} className="w-full h-full flex flex-col relative">
          <div className="pb-4 border-b border-zinc-800">
            <ZoneViewerModalHeader
              zoneType={zone.type}
              totalCards={
                isLoading && typeof expectedViewCount === "number"
                  ? expectedViewCount
                  : displayCards.length
              }
              count={count}
              filterText={filterText}
              onFilterTextChange={setFilterText}
            />
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-hidden pt-4 bg-zinc-950/50">
            {!isPreviewReady ? (
              <div className="h-full flex items-center justify-center text-zinc-500">
                Preparing card previews...
              </div>
            ) : displayCards.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500">
                {isLoading ? "Loading cards..." : "No cards found matching your filter."}
              </div>
            ) : viewMode === "grouped" ? (
              <ZoneViewerGroupedView
                sortedKeys={sortedKeys}
                groupedCards={groupedCards}
                cardWidthPx={previewWidthPx}
                cardHeightPx={previewHeightPx}
                interactionsDisabled={interactionsDisabled}
                pinnedCardId={pinnedCardId}
                onCardContextMenu={handleContextMenu}
              />
            ) : (
              // Linear View
              <ZoneViewerLinearView
                orderedCards={orderedCards}
                canReorder={canReorder}
                orderedCardIds={orderedCardIds}
                setOrderedCardIds={setOrderedCardIds}
                draggingId={draggingId}
                setDraggingId={setDraggingId}
                reorderList={reorderList}
                commitReorder={commitReorder}
                displayCards={displayCards}
                interactionsDisabled={interactionsDisabled}
                pinnedCardId={pinnedCardId}
                onCardContextMenu={handleContextMenu}
                listRef={listRef}
                cardWidthPx={previewWidthPx}
                cardHeightPx={previewHeightPx}
              />
            )}
          </div>
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={contextMenu.items}
              onClose={closeContextMenu}
              className="z-[100]"
              title={contextMenu.title}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
