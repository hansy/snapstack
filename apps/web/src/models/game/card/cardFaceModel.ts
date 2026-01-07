import type { Card, ZoneType } from "@/types";

import {
  getDisplayImageUrl,
  getDisplayName,
  getDisplayPower,
  getDisplayToughness,
  shouldShowPowerToughness,
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

const FACE_DOWN_DEFAULT_STAT = "2";

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
  const shouldCloakPT = Boolean(params.faceDown && isBattlefield);

  const showPT =
    isBattlefield &&
    !(params.hidePT ?? false) &&
    (shouldShowPowerToughness(params.card) || shouldCloakPT);

  const displayPower = shouldCloakPT ? FACE_DOWN_DEFAULT_STAT : getDisplayPower(params.card);
  const displayToughness = shouldCloakPT ? FACE_DOWN_DEFAULT_STAT : getDisplayToughness(params.card);

  const powerClassName = resolveStatClassName(
    displayPower,
    shouldCloakPT ? FACE_DOWN_DEFAULT_STAT : params.card.basePower
  );
  const toughnessClassName = resolveStatClassName(
    displayToughness,
    shouldCloakPT ? FACE_DOWN_DEFAULT_STAT : params.card.baseToughness
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
