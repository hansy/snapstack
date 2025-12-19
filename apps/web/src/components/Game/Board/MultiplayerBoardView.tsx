import React from "react";
import {
  DndContext,
  DragOverlay,
  getClientRect,
  pointerWithin,
} from "@dnd-kit/core";

import { ZONE } from "@/constants/zones";
import { CardView } from "../card/CardView";
import { CardPreviewProvider } from "../card/CardPreviewProvider";
import { Seat } from "../seat/Seat";
import { ContextMenu } from "../context-menu/ContextMenu";
import { AddCounterModal } from "../add-counter/AddCounterModal";
import { DiceRollDialog } from "../dice/DiceRollDialog";
import { LoadDeckModal } from "../load-deck/LoadDeckModal";
import { LogDrawer } from "../log-drawer/LogDrawer";
import { NumberPromptDialog } from "../prompts/NumberPromptDialog";
import { OpponentLibraryRevealsModal } from "../opponent-library-reveals/OpponentLibraryRevealsModal";
import { ShortcutsDrawer } from "../shortcuts/ShortcutsDrawer";
import { Sidenav } from "../sidenav/Sidenav";
import { TextPromptDialog } from "../prompts/TextPromptDialog";
import { TokenCreationModal } from "../token-creation/TokenCreationModal";
import { ZoneViewerModal } from "../zone-viewer/ZoneViewerModal";
import { EditUsernameDialog } from "@/components/username/EditUsernameDialog";

import type { MultiplayerBoardController } from "@/hooks/game/board/useMultiplayerBoardController";

export const MultiplayerBoardView: React.FC<MultiplayerBoardController> = ({
  zones,
  cards,
  players,
  battlefieldViewScale,
  playerColors,
  gridClass,
  scale,
  myPlayerId,
  slots,
  activeModal,
  setActiveModal,
  overCardScale,
  activeCardId,
  sensors,
  handleDragStart,
  handleDragMove,
  handleDragEnd,
  syncStatus,
  peers,
  handleViewZone,
  contextMenu,
  handleCardContextMenu,
  handleZoneContextMenu,
  handleBattlefieldContextMenu,
  handleOpenDiceRoller,
  closeContextMenu,
  countPrompt,
  closeCountPrompt,
  textPrompt,
  closeTextPrompt,
  isLoadDeckModalOpen,
  setIsLoadDeckModalOpen,
  isTokenModalOpen,
  setIsTokenModalOpen,
  isDiceRollerOpen,
  setIsDiceRollerOpen,
  isLogOpen,
  setIsLogOpen,
  isShortcutsOpen,
  setIsShortcutsOpen,
  isEditUsernameOpen,
  setIsEditUsernameOpen,
  zoneViewerState,
  setZoneViewerState,
  revealedLibraryZoneId,
  setRevealedLibraryZoneId,
  preferredUsername,
  handleUsernameSubmit,
  handleDrawCard,
  handleRollDice,
  handleCopyLink,
  handleLeave,
}) => {
  return (
    <CardPreviewProvider>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        measuring={{
          draggable: { measure: getClientRect },
          dragOverlay: { measure: getClientRect },
        }}
        collisionDetection={pointerWithin}
      >
        <div
          className="relative h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden flex font-sans selection:bg-indigo-500/30"
          onContextMenu={(e) => e.preventDefault()}
        >
          <Sidenav
            onCreateToken={() => setIsTokenModalOpen(true)}
            onOpenDiceRoller={handleOpenDiceRoller}
            onToggleLog={() => setIsLogOpen(!isLogOpen)}
            onCopyLink={handleCopyLink}
            onLeaveGame={handleLeave}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            syncStatus={syncStatus}
            peerCount={peers}
          />

          <div className={`w-full h-full grid ${gridClass} pl-12`}>
            {slots.map((slot, index) => (
              <div key={index} className="relative border-zinc-800/50">
                {slot.player ? (
                  <Seat
                    player={slot.player}
                    position={slot.position}
                    color={slot.color}
                    zones={zones}
                    cards={cards}
                    isMe={slot.player.id === myPlayerId}
                    viewerPlayerId={myPlayerId}
                    onCardContextMenu={handleCardContextMenu}
                    onZoneContextMenu={handleZoneContextMenu}
                    onBattlefieldContextMenu={(e) =>
                      handleBattlefieldContextMenu(e, {
                        onCreateToken: () => setIsTokenModalOpen(true),
                        onOpenDiceRoller: handleOpenDiceRoller,
                      })
                    }
                    onLoadDeck={() => setIsLoadDeckModalOpen(true)}
                    onEditUsername={
                      slot.player.id === myPlayerId
                        ? () => setIsEditUsernameOpen(true)
                        : undefined
                    }
                    opponentColors={playerColors}
                    scale={scale}
                    battlefieldScale={battlefieldViewScale[slot.player.id] ?? 1}
                    onViewZone={handleViewZone}
                    onDrawCard={handleDrawCard}
                    onOpponentLibraryReveals={(zoneId) =>
                      setRevealedLibraryZoneId(zoneId)
                    }
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-800 font-bold text-2xl uppercase tracking-widest select-none">
                    Empty Seat
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={closeContextMenu}
            title={contextMenu.title}
          />
        )}
        <NumberPromptDialog
          open={Boolean(countPrompt)}
          title={countPrompt?.title || ""}
          message={countPrompt?.message}
          onSubmit={(value) => countPrompt?.onSubmit(value)}
          onClose={closeCountPrompt}
          initialValue={countPrompt?.initialValue ?? 1}
        />
        <TextPromptDialog
          open={Boolean(textPrompt)}
          title={textPrompt?.title || ""}
          message={textPrompt?.message}
          initialValue={textPrompt?.initialValue}
          onSubmit={(value) => textPrompt?.onSubmit(value)}
          onClose={closeTextPrompt}
        />

        <LoadDeckModal
          isOpen={isLoadDeckModalOpen}
          onClose={() => setIsLoadDeckModalOpen(false)}
          playerId={myPlayerId}
        />
        <DiceRollDialog
          open={isDiceRollerOpen}
          onClose={() => setIsDiceRollerOpen(false)}
          onRoll={handleRollDice}
        />
        <TokenCreationModal
          isOpen={isTokenModalOpen}
          onClose={() => setIsTokenModalOpen(false)}
          playerId={myPlayerId}
        />
        <AddCounterModal
          isOpen={activeModal?.type === "ADD_COUNTER"}
          onClose={() => setActiveModal(null)}
          cardId={activeModal?.type === "ADD_COUNTER" ? activeModal.cardId : ""}
        />
        <ZoneViewerModal
          isOpen={zoneViewerState.isOpen}
          onClose={() =>
            setZoneViewerState((prev) => ({ ...prev, isOpen: false }))
          }
          zoneId={zoneViewerState.zoneId}
          count={zoneViewerState.count}
        />
        <LogDrawer
          isOpen={isLogOpen}
          onClose={() => setIsLogOpen(false)}
          playerColors={playerColors}
        />
        <OpponentLibraryRevealsModal
          isOpen={Boolean(revealedLibraryZoneId)}
          onClose={() => setRevealedLibraryZoneId(null)}
          zoneId={revealedLibraryZoneId}
        />
        <ShortcutsDrawer
          isOpen={isShortcutsOpen}
          onClose={() => setIsShortcutsOpen(false)}
        />
        <EditUsernameDialog
          open={isEditUsernameOpen}
          onClose={() => setIsEditUsernameOpen(false)}
          initialValue={players[myPlayerId]?.name ?? preferredUsername ?? ""}
          onSubmit={handleUsernameSubmit}
        />
        <DragOverlay dropAnimation={null}>
          {activeCardId && cards[activeCardId]
            ? (() => {
                const overlayCard = cards[activeCardId];
                const overlayZone = zones[overlayCard.zoneId];
                const overlayPreferArtCrop = false;
                const viewScale =
                  overlayZone?.type === ZONE.BATTLEFIELD
                    ? (battlefieldViewScale[overlayZone.ownerId] ?? 1)
                    : 1;
                const targetScale = overCardScale || viewScale;
                return (
                  <div
                    style={{
                      transform: `scale(${scale * targetScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <CardView
                      card={overlayCard}
                      isDragging
                      preferArtCrop={overlayPreferArtCrop}
                      faceDown={overlayCard.faceDown}
                    />
                  </div>
                );
              })()
            : null}
        </DragOverlay>
      </DndContext>
    </CardPreviewProvider>
  );
};
