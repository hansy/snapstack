import { Card } from "@/types";
import { ScryfallCardFaceLite } from "@/types/scryfallLite";

const TRANSFORM_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "dfc",
  "flip",
  "double_faced_token",
  "reversible_card",
  "meld",
]);

export const getCardFaces = (card: Card): ScryfallCardFaceLite[] => card.scryfall?.card_faces ?? [];

export const getCurrentFaceIndex = (card: Card): number => {
  const faces = getCardFaces(card);
  if (!faces.length) return 0;
  const index = card.currentFaceIndex ?? 0;
  if (index < 0) return 0;
  if (index >= faces.length) return faces.length - 1;
  return index;
};

export const getCurrentFace = (card: Card): ScryfallCardFaceLite | null => {
  const faces = getCardFaces(card);
  if (!faces.length) return null;
  return faces[getCurrentFaceIndex(card)];
};

export const getFrontFace = (card: Card): ScryfallCardFaceLite | null => {
  const faces = getCardFaces(card);
  return faces.length ? faces[0] : null;
};

export const getDisplayName = (card: Card): string => {
  const faceName = getCurrentFace(card)?.name;
  return faceName || card.name;
};

export const getDisplayImageUrl = (
  card: Card,
  opts?: { preferArtCrop?: boolean }
): string | undefined => {
  const faceUris = getCurrentFace(card)?.image_uris || card.scryfall?.image_uris;
  const preferArt = opts?.preferArtCrop ?? false;
  const faceImage = preferArt ? faceUris?.art_crop ?? faceUris?.normal : faceUris?.normal ?? faceUris?.art_crop;
  return faceImage || card.imageUrl;
};

export const isTransformableCard = (card: Card): boolean => {
  const faces = getCardFaces(card);
  if (faces.length < 2) return false;
  const layout = card.scryfall?.layout;
  return layout ? TRANSFORM_LAYOUTS.has(layout) : true;
};

export const getNextTransformFace = (
  card: Card
): { nextIndex: number; face: ScryfallCardFaceLite } | null => {
  const faces = getCardFaces(card);
  if (faces.length < 2) return null;
  const nextIndex = (getCurrentFaceIndex(card) + 1) % faces.length;
  return { nextIndex, face: faces[nextIndex] };
};

export const shouldShowPowerToughness = (card: Card): boolean => {
  if (card.power !== undefined && card.toughness !== undefined) return true;
  const currentFace = getCurrentFace(card);
  if (currentFace) {
    return currentFace.power !== undefined && currentFace.toughness !== undefined;
  }
  return false;
};

export const getDisplayPower = (card: Card): string | undefined => {
  const facePower = getCurrentFace(card)?.power;
  return card.power ?? facePower;
};

export const getDisplayToughness = (card: Card): string | undefined => {
  const faceToughness = getCurrentFace(card)?.toughness;
  return card.toughness ?? faceToughness;
};

export const getFlipRotation = (card: Card): number => {
  const isFlipLayout = card.scryfall?.layout === "flip";
  const isBack = isFlipLayout && getCurrentFaceIndex(card) === 1;
  return isBack ? 180 : 0;
};

export const getTransformVerb = (card: Card): string => {
  const layout = card.scryfall?.layout;
  return layout === "flip" ? "Flip" : "Transform";
};

export const syncCardStatsToFace = (
  card: Card,
  faceIndex?: number,
  options?: { preserveExisting?: boolean }
): Card => {
  const faces = getCardFaces(card);
  const targetIndex = faceIndex ?? getCurrentFaceIndex(card);
  const targetFace = faces[targetIndex];
  if (!targetFace) return { ...card, currentFaceIndex: targetIndex };

  const hasPower = targetFace.power !== undefined;
  const hasToughness = targetFace.toughness !== undefined;
  const preserve = options?.preserveExisting;

  return {
    ...card,
    currentFaceIndex: targetIndex,
    power: preserve && card.power !== undefined ? card.power : hasPower ? targetFace.power : undefined,
    toughness: preserve && card.toughness !== undefined ? card.toughness : hasToughness ? targetFace.toughness : undefined,
    basePower: hasPower ? targetFace.power : undefined,
    baseToughness: hasToughness ? targetFace.toughness : undefined,
  };
};

export const resetCardToFrontFace = (card: Card): Card =>
  syncCardStatsToFace({ ...card, currentFaceIndex: 0 }, 0);
