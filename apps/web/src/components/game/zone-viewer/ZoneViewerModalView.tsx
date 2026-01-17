import React from "react";
import { Dialog, DialogContent } from "../../ui/dialog";
import { ContextMenu } from "../context-menu/ContextMenu";

import type { ZoneViewerController } from "@/hooks/game/zone-viewer/useZoneViewerController";
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
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[90vw] h-[80vh] bg-zinc-950 border-zinc-800 text-zinc-100 flex flex-col p-0 gap-0">
        <div ref={containerRef} className="w-full h-full flex flex-col relative pr-6">
          <div className="p-6 border-b border-zinc-800">
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

          <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-6 bg-zinc-950/50">
            {displayCards.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500">
                {isLoading ? "Loading cards..." : "No cards found matching your filter."}
              </div>
            ) : viewMode === "grouped" ? (
              <ZoneViewerGroupedView
                sortedKeys={sortedKeys}
                groupedCards={groupedCards}
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
