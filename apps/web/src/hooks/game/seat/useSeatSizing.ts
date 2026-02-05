import * as React from "react";

import { useElementSize } from "@/hooks/shared/useElementSize";
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from "@/lib/constants";

export const LG_BREAKPOINT_VAR = "--breakpoint-lg";
export const DEFAULT_LG_BREAKPOINT = "1024px";
export const LG_MEDIA_QUERY = `(min-width: ${DEFAULT_LG_BREAKPOINT})`;

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
  viewScale: number;
  zonePadPx: number;
  sideAreaPadPx: number;
  modalPadPx: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getPreviewDimensions = (
  baseCardWidthPx?: number,
  options: {
    previewScale?: number;
    previewMinWidthPx?: number;
    previewMaxWidthPx?: number;
  } = {}
) => {
  const {
    previewScale = PREVIEW_SCALE_K,
    previewMinWidthPx = PREVIEW_MIN_WIDTH_PX,
    previewMaxWidthPx = PREVIEW_MAX_WIDTH_PX,
  } = options;
  const resolvedBaseWidth =
    Number.isFinite(baseCardWidthPx) && (baseCardWidthPx ?? 0) > 0
      ? baseCardWidthPx!
      : BASE_CARD_HEIGHT * CARD_ASPECT_RATIO;
  const previewWidthPx = clamp(
    resolvedBaseWidth * previewScale,
    previewMinWidthPx,
    previewMaxWidthPx
  );
  return {
    previewWidthPx,
    previewHeightPx: previewWidthPx / CARD_ASPECT_RATIO,
  };
};

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

  const { previewWidthPx, previewHeightPx } = getPreviewDimensions(baseCardWidthPx, {
    previewScale,
    previewMinWidthPx,
    previewMaxWidthPx,
  });

  const sideZoneWidthPx = landscapeCardWidthPx + zonePadPx * 2;
  const sideZoneHeightPx = landscapeCardHeightPx + zonePadPx * 2;
  const sideAreaWidthPx = sideZoneWidthPx + sideAreaPadPx * 2;
  const cmdrStackOffsetPx = baseCardHeightPx * 0.3;

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
    viewScale,
    zonePadPx,
    sideAreaPadPx,
    modalPadPx,
  };
};

export const getLgMediaQuery = () => {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof getComputedStyle === "undefined"
  ) {
    return LG_MEDIA_QUERY;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(LG_BREAKPOINT_VAR)
    .trim();
  const breakpoint = value || DEFAULT_LG_BREAKPOINT;
  return `(min-width: ${breakpoint})`;
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

export const useIsLg = () => {
  const lgQuery = React.useMemo(getLgMediaQuery, []);
  return useMediaQuery(lgQuery);
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
  const lgQuery = React.useMemo(getLgMediaQuery, []);
  const isLg = useMediaQuery(lgQuery);

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
      "--modal-pad": `${sizing.modalPadPx}px`,
    } as React.CSSProperties;
  }, [sizing]);

  return { ref, size, sizing, cssVars, isLg };
};
