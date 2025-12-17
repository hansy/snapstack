import React from "react";
import { Eye } from "lucide-react";
import { Card as CardType } from "../../../types";
import { cn } from "../../../lib/utils";
import { useGameStore } from "../../../store/gameStore";
import { resolveCounterColor } from "../../../lib/counters";
import {
  getCurrentFace,
  getDisplayImageUrl,
  getDisplayName,
  getDisplayPower,
  getDisplayToughness,
  shouldShowPowerToughness,
} from "../../../lib/cardDisplay";

interface CardFaceProps {
  card: CardType;
  faceDown?: boolean;
  imageClassName?: string;
  imageTransform?: string;
  countersClassName?: string;
  interactive?: boolean;
  hidePT?: boolean;
  showCounterLabels?: boolean;
  preferArtCrop?: boolean;
  showNameLabel?: boolean;
  rotateLabel?: boolean;
  customTextNode?: React.ReactNode;
  customTextPosition?: "sidebar" | "bottom-left" | "center";
  hideRevealIcon?: boolean;
}

const CardFaceInner: React.FC<CardFaceProps> = ({
  card,
  faceDown,
  imageClassName,
  imageTransform,
  countersClassName,
  interactive,
  hidePT,
  showCounterLabels,
  preferArtCrop = false,
  showNameLabel = true,
  rotateLabel = false,
  customTextNode,
  customTextPosition,
  hideRevealIcon,
}) => {
  const addCounterToCard = useGameStore((state) => state.addCounterToCard);
  const removeCounterFromCard = useGameStore(
    (state) => state.removeCounterFromCard
  );
  const updateCard = useGameStore((state) => state.updateCard);
  const globalCounters = useGameStore((state) => state.globalCounters);
  const myPlayerId = useGameStore((state) => state.myPlayerId);

  // Memoize display values
  const displayImageUrl = React.useMemo(
    () => getDisplayImageUrl(card, { preferArtCrop }),
    [
      card.imageUrl,
      card.scryfall?.image_uris,
      card.currentFaceIndex,
      preferArtCrop,
    ]
  );
  const displayName = React.useMemo(
    () => getDisplayName(card),
    [card.name, card.scryfall?.card_faces, card.currentFaceIndex]
  );
  const showPT =
    shouldShowPowerToughness(card) &&
    card.zoneId.includes("battlefield") &&
    !hidePT;
  const displayPower = React.useMemo(
    () => getDisplayPower(card),
    [card.power, card.scryfall?.card_faces, card.currentFaceIndex]
  );
  const displayToughness = React.useMemo(
    () => getDisplayToughness(card),
    [card.toughness, card.scryfall?.card_faces, card.currentFaceIndex]
  );

  const handleUpdatePT = React.useCallback(
    (type: "power" | "toughness", delta: number) => {
      const faceStat = getCurrentFace(card)?.[type];
      const currentVal = parseInt((card as any)[type] ?? faceStat ?? "0");
      if (isNaN(currentVal)) return;
      updateCard(card.id, { [type]: (currentVal + delta).toString() });
    },
    [card, updateCard]
  );

  return (
    <>
      {faceDown ? (
        <div className="w-full h-full bg-indigo-900/50 rounded border-2 border-indigo-500/30 flex items-center justify-center bg-[url('/mtg_card_back.jpeg')] bg-cover bg-center" />
      ) : displayImageUrl ? (
        <img
          src={displayImageUrl}
          alt={displayName}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full h-full object-cover rounded pointer-events-none",
            imageClassName
          )}
          style={
            imageTransform
              ? { transform: imageTransform, transformOrigin: "center center" }
              : undefined
          }
        />
      ) : (
        <div className="text-md text-center font-medium text-zinc-300 px-2">
          {displayName}
        </div>
      )}

      {/* Power/Toughness - Only show on battlefield */}
      {showPT && (
        <div
          className={cn(
            "absolute bottom-1 right-1 bg-zinc-900/90 px-2 py-1 rounded-sm border border-zinc-700 shadow-sm z-10",
            interactive && "scale-125 origin-bottom-right"
          )}
        >
          <span className="text-sm font-bold flex items-center gap-1">
            {/* Power */}
            <div className="relative group/pt">
              <span
                className={cn(
                  parseInt(displayPower || "0") >
                    parseInt(card.basePower || "0")
                    ? "text-green-500"
                    : parseInt(displayPower || "0") <
                      parseInt(card.basePower || "0")
                      ? "text-red-500"
                      : "text-white"
                )}
              >
                {displayPower}
              </span>
              {interactive && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover/pt:opacity-100 transition-opacity bg-zinc-900 border border-zinc-700 rounded px-1">
                  <button
                    className="text-xs hover:text-green-400 px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdatePT("power", 1);
                    }}
                  >
                    +
                  </button>
                  <button
                    className="text-xs hover:text-red-400 px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdatePT("power", -1);
                    }}
                  >
                    -
                  </button>
                </div>
              )}
            </div>

            <span className="text-zinc-400">/</span>

            {/* Toughness */}
            <div className="relative group/pt">
              <span
                className={cn(
                  parseInt(displayToughness || "0") >
                    parseInt(card.baseToughness || "0")
                    ? "text-green-500"
                    : parseInt(displayToughness || "0") <
                      parseInt(card.baseToughness || "0")
                      ? "text-red-500"
                      : "text-white"
                )}
              >
                {displayToughness}
              </span>
              {interactive && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover/pt:opacity-100 transition-opacity bg-zinc-900 border border-zinc-700 rounded px-1">
                  <button
                    className="text-xs hover:text-green-400 px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdatePT("toughness", 1);
                    }}
                  >
                    +
                  </button>
                  <button
                    className="text-xs hover:text-red-400 px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdatePT("toughness", -1);
                    }}
                  >
                    -
                  </button>
                </div>
              )}
            </div>
          </span>
        </div>
      )}

      {/* Name Label - Only show on battlefield and face up */}
      {showNameLabel && card.zoneId.includes("battlefield") && !faceDown && (
        <div className="absolute left-1/2 bottom-full w-[160%] -translate-x-1/2 flex justify-center z-10 pointer-events-none">
          <div
            className={cn(
              "bg-zinc-900/90 text-zinc-100 text-md px-1.5 py-0.5 rounded-sm border border-zinc-700 shadow-sm leading-tight text-center inline-block w-fit max-w-full break-words text-ellipsis",
              rotateLabel && "rotate-180"
            )}
          >
            {displayName}
          </div>
        </div>
      )}

      {/* Counters and Sidebar Custom Text */}
      {(card.counters.length > 0 ||
        (customTextNode && customTextPosition === "sidebar")) && (
          <div
            className={cn(
              "absolute top-0 right-0 flex flex-col gap-1 items-end pr-1 pt-1",
              countersClassName
            )}
          >
            {card.counters.map((counter, i) => (
              <div
                key={i}
                className="group relative flex items-center justify-center w-6 h-6 rounded-full shadow-md border border-white/20 text-white text-[10px] font-bold cursor-help transition-all hover:z-50"
                style={{
                  backgroundColor:
                    counter.color ||
                    resolveCounterColor(counter.type, globalCounters),
                }}
              >
                {counter.count}

                {/* Label and Buttons (Controlled by showCounterLabels) */}
                {showCounterLabels ? (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 pl-2 flex items-center gap-1 h-full z-50">
                    {/* Buttons - Only if interactive */}
                    {interactive && (
                      <div className="flex items-center gap-0.5 w-0 overflow-hidden group-hover:w-auto transition-all duration-200 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                        <button
                          className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-white text-xs border border-zinc-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCounterFromCard(card.id, counter.type);
                          }}
                        >
                          -
                        </button>
                        <button
                          className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-white text-xs border border-zinc-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            addCounterToCard(card.id, { ...counter, count: 1 });
                          }}
                        >
                          +
                        </button>
                      </div>
                    )}

                    {/* Label */}
                    <div className="bg-zinc-900/90 text-zinc-100 text-xs px-2 py-1 rounded border border-zinc-700 whitespace-nowrap shadow-lg pointer-events-none group-hover:pointer-events-auto">
                      {counter.type}
                    </div>
                  </div>
                ) : (
                  /* Tooltip for non-interactive mode (Battlefield) */
                  <div className="absolute right-full mr-2 px-2 py-1 bg-zinc-900 text-zinc-100 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-zinc-700">
                    {counter.type}
                  </div>
                )}
              </div>
            ))}

            {/* Sidebar Custom Text */}
            {customTextPosition === "sidebar" && customTextNode && (
              <div className="relative w-6 h-0 flex items-center justify-center">
                <div className="absolute left-full pl-2 top-0">
                  {customTextNode}
                </div>
              </div>
            )}
          </div>
        )}

      {/* Bottom-Left Custom Text */}
      {customTextPosition === "bottom-left" && customTextNode && (
        <div className="absolute bottom-1 left-1 z-10 max-w-[80%]">
          {customTextNode}
        </div>
      )}

      {/* Center Custom Text */}
      {customTextPosition === "center" && customTextNode && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-1">
          <div className="w-full text-center pointer-events-auto">
            {customTextNode}
          </div>
        </div>
      )}

      {/* Reveal Eye Icon - Only visible to owner */}
      {!hideRevealIcon &&
        card.ownerId === myPlayerId &&
        (card.revealedToAll || (card.revealedTo && card.revealedTo.length > 0)) && (
          <div
            className="absolute top-1 left-1 z-20 bg-zinc-900/90 rounded-full p-1 border border-zinc-700 shadow-md group/eye"
            title={
              card.revealedToAll
                ? "Revealed to everyone"
                : `Revealed to: ${(card.revealedTo || []).length} player(s)`
            }
          >
            <Eye size={14} className="text-white" />

            {/* Tooltip for hover */}
            <div className="absolute left-0 top-full mt-1 hidden group-hover/eye:block bg-zinc-900 text-xs text-white p-2 rounded border border-zinc-700 whitespace-nowrap z-50 shadow-xl">
              <div className="font-bold mb-1">Revealed to:</div>
              {card.revealedToAll ? (
                <div>Everyone</div>
              ) : (
                <PlayerNamesList playerIds={card.revealedTo || []} />
              )}
            </div>
          </div>
        )}
    </>
  );
};

const PlayerNamesList = ({ playerIds }: { playerIds: string[] }) => {
  const players = useGameStore((state) => state.players);
  if (!playerIds.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {playerIds.map(id => (
        <div key={id}>{players[id]?.name || id}</div>
      ))}
    </div>
  );
};

export const CardFace = React.memo(CardFaceInner);
