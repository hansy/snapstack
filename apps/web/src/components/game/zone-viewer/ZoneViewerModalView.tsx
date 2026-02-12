import React from "react";
import { Dialog, DialogContent } from "../../ui/dialog";
import { ContextMenu } from "../context-menu/ContextMenu";

import type { ZoneViewerController } from "@/hooks/game/zone-viewer/useZoneViewerController";
import { getPreviewDimensions } from "@/hooks/game/seat/useSeatSizing";
import { useGameStore } from "@/store/gameStore";
import { ZoneViewerModalHeader } from "./ZoneViewerModalHeader";
import { ZoneViewerGroupedView } from "./ZoneViewerGroupedView";
import { ZoneViewerLinearView } from "./ZoneViewerLinearView";
import { useTwoFingerScroll } from "@/hooks/shared/useTwoFingerScroll";

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
  const { previewWidthPx, previewHeightPx } = React.useMemo(
    () => getPreviewDimensions(baseCardWidthPx),
    [baseCardWidthPx]
  );
  const [scrollNode, setScrollNode] = React.useState<HTMLDivElement | null>(null);
  useTwoFingerScroll({ target: scrollNode, axis: "x" });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="ds-dialog-size-lg ds-dialog-inset bg-zinc-950 border-zinc-800 text-zinc-100 flex min-h-0 flex-col">
        <div ref={containerRef} className="relative flex h-full min-h-0 w-full flex-col">
          <div className="px-4 py-3 lg:px-6 lg:py-4 border-b border-zinc-800">
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

          <div
            ref={setScrollNode}
            className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-3 lg:px-6 lg:pb-6 lg:pt-4 bg-zinc-950/50 touch-none"
          >
            {displayCards.length === 0 ? (
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
