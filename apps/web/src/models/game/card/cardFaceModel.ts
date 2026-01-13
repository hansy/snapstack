import type { Card, ZoneType } from "@/types";

import {
  getDisplayImageUrl,
  getDisplayName,
  getDisplayPower,
  getDisplayToughness,
  getMorphDisplayStat,
  isMorphFaceDown,
  shouldShowPowerToughness,
  FACE_DOWN_MORPH_STAT,
} from "@/lib/cardDisplay";
import { resolveCounterColor } from "@/lib/counters";
import { ZONE } from "@/constants/zones";

export interface CardFaceCounterModel {
  type: string;
  count: number;
  color?: string;
  renderColor: string;
}

export interface CardFaceRevealModel {
  toAll: boolean;
  title: string;
  playerNames: string[];
}

export interface CardFaceModel {
  displayImageUrl?: string;
  displayName: string;
  showPT: boolean;
  displayPower?: string;
  displayToughness?: string;
  powerClassName: string;
  toughnessClassName: string;
  showNameLabel: boolean;
  counters: CardFaceCounterModel[];
  reveal: CardFaceRevealModel | null;
}

const resolveStatClassName = (display: string | undefined, base: string | undefined) => {
  const displayVal = parseInt(display || "0");
  const baseVal = parseInt(base || "0");
  if (displayVal > baseVal) return "text-green-500";
  if (displayVal < baseVal) return "text-red-500";
  return "text-white";
};

export const createCardFaceModel = (params: {
  card: Card;
  zoneType: ZoneType | undefined;
  faceDown?: boolean;
  preferArtCrop?: boolean;
  hidePT?: boolean;
  showNameLabel?: boolean;
  hideRevealIcon?: boolean;
  myPlayerId: string;
  globalCounters: Record<string, string>;
  revealToNames: string[];
}): CardFaceModel => {
  const displayImageUrl = getDisplayImageUrl(params.card, {
    preferArtCrop: params.preferArtCrop ?? false,
  });
  const displayName = getDisplayName(params.card);

  const isBattlefield = params.zoneType === ZONE.BATTLEFIELD;
  const isFaceDown = Boolean(params.faceDown && isBattlefield);
  const morphFaceDown = isMorphFaceDown(params.card, isFaceDown);

  const showPT =
    isBattlefield &&
    !(params.hidePT ?? false) &&
    (isFaceDown ? morphFaceDown : shouldShowPowerToughness(params.card));

  const displayPower = isFaceDown
    ? morphFaceDown
      ? getMorphDisplayStat(params.card, "power")
      : undefined
    : getDisplayPower(params.card);
  const displayToughness = isFaceDown
    ? morphFaceDown
      ? getMorphDisplayStat(params.card, "toughness")
      : undefined
    : getDisplayToughness(params.card);

  const powerClassName = resolveStatClassName(
    displayPower,
    morphFaceDown ? FACE_DOWN_MORPH_STAT : params.card.basePower
  );
  const toughnessClassName = resolveStatClassName(
    displayToughness,
    morphFaceDown ? FACE_DOWN_MORPH_STAT : params.card.baseToughness
  );

  const showNameLabel =
    (params.showNameLabel ?? true) &&
    isBattlefield &&
    !params.faceDown;

  const counters: CardFaceCounterModel[] = params.card.counters.map((counter) => ({
    type: counter.type,
    count: counter.count,
    color: counter.color,
    renderColor:
      counter.color || resolveCounterColor(counter.type, params.globalCounters),
  }));

  const shouldShowReveal =
    !(params.hideRevealIcon ?? false) &&
    params.card.ownerId === params.myPlayerId &&
    (params.card.revealedToAll ||
      (params.card.revealedTo && params.card.revealedTo.length > 0));

  const reveal: CardFaceRevealModel | null = shouldShowReveal
    ? {
        toAll: Boolean(params.card.revealedToAll),
        title: params.card.revealedToAll
          ? "Revealed to everyone"
          : `Revealed to: ${(params.card.revealedTo || []).length} player(s)`,
        playerNames: params.card.revealedToAll ? [] : params.revealToNames,
      }
    : null;

  return {
    displayImageUrl,
    displayName,
    showPT,
    displayPower,
    displayToughness,
    powerClassName,
    toughnessClassName,
    showNameLabel,
    counters,
    reveal,
  };
};
