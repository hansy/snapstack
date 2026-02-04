import * as React from "react";

import { useElementSize } from "@/hooks/shared/useElementSize";
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from "@/lib/constants";

export const LG_MEDIA_QUERY = "(min-width: 1024px)";

export const SEAT_BOTTOM_BAR_PCT = 0.22;
export const SEAT_HAND_MIN_PCT = 0.15;
export const SEAT_HAND_MAX_PCT = 0.4;

export const PREVIEW_SCALE_K = 1.6;
export const PREVIEW_MIN_WIDTH_PX = 200;
export const PREVIEW_MAX_WIDTH_PX = 400;

// Derived from current side zone scale-90 against 120px width.
export const ZONE_PAD_PX = 6;
// Derived from current sidebar width 160px - zone width 120px.
export const SIDE_AREA_PAD_PX = 20;
// DialogContent default p-6.
export const MODAL_PAD_PX = 24;

export interface SeatSizingOptions {
  handHeightOverridePx?: number;
  bottomBarPct?: number;
  handMinPct?: number;
  handMaxPct?: number;
  previewScale?: number;
  previewMinWidthPx?: number;
  previewMaxWidthPx?: number;
  zonePadPx?: number;
  sideAreaPadPx?: number;
  modalPadPx?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface SeatSizing {
  seatWidthPx: number;
  seatHeightPx: number;
  handHeightPx: number;
  battlefieldHeightPx: number;
  baseCardHeightPx: number;
  baseCardWidthPx: number;
  landscapeCardWidthPx: number;
  landscapeCardHeightPx: number;
  sideZoneWidthPx: number;
  sideZoneHeightPx: number;
  sideAreaWidthPx: number;
  previewWidthPx: number;
  previewHeightPx: number;
  cmdrStackOffsetPx: number;
  modalMaxWidthPx: number;
  modalMaxHeightPx: number;
  viewScale: number;
  zonePadPx: number;
  sideAreaPadPx: number;
  modalPadPx: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const computeSeatSizing = (params: SeatSizingOptions & {
  seatWidth: number;
  seatHeight: number;
}): SeatSizing => {
  const {
    seatWidth,
    seatHeight,
    handHeightOverridePx,
    bottomBarPct = SEAT_BOTTOM_BAR_PCT,
    handMinPct = SEAT_HAND_MIN_PCT,
    handMaxPct = SEAT_HAND_MAX_PCT,
    previewScale = PREVIEW_SCALE_K,
    previewMinWidthPx = PREVIEW_MIN_WIDTH_PX,
    previewMaxWidthPx = PREVIEW_MAX_WIDTH_PX,
    zonePadPx = ZONE_PAD_PX,
    sideAreaPadPx = SIDE_AREA_PAD_PX,
    modalPadPx = MODAL_PAD_PX,
    viewportWidth,
    viewportHeight,
  } = params;

  const minHandHeight = seatHeight * handMinPct;
  const maxHandHeight = seatHeight * handMaxPct;
  const baselineHandHeight = seatHeight * bottomBarPct;
  const handHeightPx = clamp(
    handHeightOverridePx ?? baselineHandHeight,
    minHandHeight,
    maxHandHeight
  );

  const battlefieldHeightPx = seatHeight - handHeightPx;
  const baseCardHeightPx = battlefieldHeightPx / 4;
  const baseCardWidthPx = baseCardHeightPx * CARD_ASPECT_RATIO;
  const landscapeCardWidthPx = baseCardHeightPx;
  const landscapeCardHeightPx = baseCardWidthPx;

  const previewWidthPx = clamp(
    baseCardWidthPx * previewScale,
    previewMinWidthPx,
    previewMaxWidthPx
  );
  const previewHeightPx = previewWidthPx / CARD_ASPECT_RATIO;

  const sideZoneWidthPx = landscapeCardWidthPx + zonePadPx * 2;
  const sideZoneHeightPx = landscapeCardHeightPx + zonePadPx * 2;
  const sideAreaWidthPx = sideZoneWidthPx + sideAreaPadPx * 2;
  const cmdrStackOffsetPx = baseCardHeightPx * 0.3;

  const modalMainWidth = previewWidthPx + modalPadPx * 2;
  const modalMainHeight = previewHeightPx + modalPadPx * 2;
  const vw = viewportWidth ?? Number.POSITIVE_INFINITY;
  const vh = viewportHeight ?? Number.POSITIVE_INFINITY;
  const modalMaxWidthPx = Math.min(vw * 0.9, modalMainWidth);
  const modalMaxHeightPx = Math.min(vh * 0.9, modalMainHeight);

  const viewScale = BASE_CARD_HEIGHT > 0 ? baseCardHeightPx / BASE_CARD_HEIGHT : 1;

  return {
    seatWidthPx: seatWidth,
    seatHeightPx: seatHeight,
    handHeightPx,
    battlefieldHeightPx,
    baseCardHeightPx,
    baseCardWidthPx,
    landscapeCardWidthPx,
    landscapeCardHeightPx,
    sideZoneWidthPx,
    sideZoneHeightPx,
    sideAreaWidthPx,
    previewWidthPx,
    previewHeightPx,
    cmdrStackOffsetPx,
    modalMaxWidthPx,
    modalMaxHeightPx,
    viewScale,
    zonePadPx,
    sideAreaPadPx,
    modalPadPx,
  };
};

const useMediaQuery = (query: string) => {
  const getMatch = React.useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const [matches, setMatches] = React.useState(getMatch);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    setMatches(media.matches);
    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
    } else {
      media.addListener(handleChange);
    }

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", handleChange);
      } else {
        media.removeListener(handleChange);
      }
    };
  }, [query]);

  return matches;
};

export const useSeatSizing = (options: SeatSizingOptions = {}) => {
  const {
    handHeightOverridePx,
    bottomBarPct = SEAT_BOTTOM_BAR_PCT,
    handMinPct = SEAT_HAND_MIN_PCT,
    handMaxPct = SEAT_HAND_MAX_PCT,
    previewScale = PREVIEW_SCALE_K,
    previewMinWidthPx = PREVIEW_MIN_WIDTH_PX,
    previewMaxWidthPx = PREVIEW_MAX_WIDTH_PX,
    zonePadPx = ZONE_PAD_PX,
    sideAreaPadPx = SIDE_AREA_PAD_PX,
    modalPadPx = MODAL_PAD_PX,
  } = options;

  const { ref, size } = useElementSize<HTMLDivElement>({
    debounceMs: 16,
    thresholdPx: 1,
  });
  const isLg = useMediaQuery(LG_MEDIA_QUERY);

  const sizing = React.useMemo(() => {
    if (!isLg || size.width <= 0 || size.height <= 0) {
      return null;
    }

    return computeSeatSizing({
      seatWidth: size.width,
      seatHeight: size.height,
      handHeightOverridePx,
      bottomBarPct,
      handMinPct,
      handMaxPct,
      previewScale,
      previewMinWidthPx,
      previewMaxWidthPx,
      zonePadPx,
      sideAreaPadPx,
      modalPadPx,
      viewportWidth: typeof window === "undefined" ? undefined : window.innerWidth,
      viewportHeight: typeof window === "undefined" ? undefined : window.innerHeight,
    });
  }, [
    isLg,
    size.width,
    size.height,
    handHeightOverridePx,
    bottomBarPct,
    handMinPct,
    handMaxPct,
    previewScale,
    previewMinWidthPx,
    previewMaxWidthPx,
    zonePadPx,
    sideAreaPadPx,
    modalPadPx,
  ]);

  const cssVars = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!sizing) return undefined;
    return {
      "--seat-h": `${sizing.seatHeightPx}px`,
      "--seat-w": `${sizing.seatWidthPx}px`,
      "--hand-h": `${sizing.handHeightPx}px`,
      "--battlefield-h": `${sizing.battlefieldHeightPx}px`,
      "--card-h": `${sizing.baseCardHeightPx}px`,
      "--card-w": `${sizing.baseCardWidthPx}px`,
      "--card-h-landscape": `${sizing.landscapeCardHeightPx}px`,
      "--card-w-landscape": `${sizing.landscapeCardWidthPx}px`,
      "--sidebar-w": `${sizing.sideAreaWidthPx}px`,
      "--sidezone-w": `${sizing.sideZoneWidthPx}px`,
      "--sidezone-h": `${sizing.sideZoneHeightPx}px`,
      "--zone-pad": `${sizing.zonePadPx}px`,
      "--sidearea-pad": `${sizing.sideAreaPadPx}px`,
      "--cmdr-offset": `${sizing.cmdrStackOffsetPx}px`,
      "--preview-h": `${sizing.previewHeightPx}px`,
      "--preview-w": `${sizing.previewWidthPx}px`,
      "--modal-max-w": `${sizing.modalMaxWidthPx}px`,
      "--modal-max-h": `${sizing.modalMaxHeightPx}px`,
      "--modal-pad": `${sizing.modalPadPx}px`,
    } as React.CSSProperties;
  }, [sizing]);

  return { ref, size, sizing, cssVars, isLg };
};
