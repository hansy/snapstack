import * as React from "react";

import { useElementSize } from "@/hooks/shared/useElementSize";
import { BASE_CARD_HEIGHT, CARD_ASPECT_RATIO } from "@/lib/constants";

export const LG_BREAKPOINT_VAR = "--breakpoint-lg";
export const DEFAULT_LG_BREAKPOINT = "1024px";
export const LG_MEDIA_QUERY = `(min-width: ${DEFAULT_LG_BREAKPOINT})`;

export const SEAT_BOTTOM_BAR_PCT = 0.12;
export const SEAT_HAND_MIN_PCT = 0.15;
export const SEAT_HAND_MAX_PCT = 0.4;

export const PREVIEW_SCALE_K = 1.6;
export const PREVIEW_MIN_WIDTH_PX = 200;
export const PREVIEW_MAX_WIDTH_PX = 400;
export const MIN_CARD_HEIGHT_PX = 80;

// Padding around side zone cards (p-2).
export const ZONE_PAD_PX = 12;
export const ZONE_PAD_AREA_SCALE = 1.2;
export const ZONE_AREA_SCALE = 1;
// DialogContent default p-6.
export const MODAL_PAD_PX = 24;

export interface SeatSizingOptions {
  handHeightOverridePx?: number;
  bottomBarPct?: number;
  handMinPct?: number;
  handMaxPct?: number;
  viewportHeightPx?: number;
  previewScale?: number;
  previewMinWidthPx?: number;
  previewMaxWidthPx?: number;
  zonePadPx?: number;
  zonePadAreaScale?: number;
  zoneAreaScale?: number;
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
  previewWidthPx: number;
  previewHeightPx: number;
  cmdrStackOffsetPx: number;
  viewScale: number;
  zonePadPx: number;
  modalPadPx: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const computeZonePadPx = (
  cardWidthPx: number,
  cardHeightPx: number,
  areaScale: number,
) => {
  if (
    !Number.isFinite(cardWidthPx) ||
    !Number.isFinite(cardHeightPx) ||
    cardWidthPx <= 0 ||
    cardHeightPx <= 0
  ) {
    return ZONE_PAD_PX;
  }
  const targetScale = Math.max(1, areaScale);
  if (targetScale === 1) return 0;
  const sum = cardWidthPx + cardHeightPx;
  const discriminant =
    sum * sum + 4 * (targetScale - 1) * cardWidthPx * cardHeightPx;
  const pad = (Math.sqrt(discriminant) - sum) / 4;
  return Math.max(0, pad);
};

export const getPreviewDimensions = (
  baseCardWidthPx?: number,
  options: {
    previewScale?: number;
    previewMinWidthPx?: number;
    previewMaxWidthPx?: number;
  } = {},
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
    previewMaxWidthPx,
  );
  return {
    previewWidthPx,
    previewHeightPx: previewWidthPx / CARD_ASPECT_RATIO,
  };
};

export const computeSeatSizing = (
  params: SeatSizingOptions & {
    seatWidth: number;
    seatHeight: number;
  },
): SeatSizing => {
  const {
    seatWidth,
    seatHeight,
    handHeightOverridePx,
    bottomBarPct = SEAT_BOTTOM_BAR_PCT,
    handMinPct = SEAT_HAND_MIN_PCT,
    handMaxPct = SEAT_HAND_MAX_PCT,
    viewportHeightPx,
    previewScale = PREVIEW_SCALE_K,
    previewMinWidthPx = PREVIEW_MIN_WIDTH_PX,
    previewMaxWidthPx = PREVIEW_MAX_WIDTH_PX,
    zonePadPx,
    zonePadAreaScale = ZONE_PAD_AREA_SCALE,
    zoneAreaScale = ZONE_AREA_SCALE,
    modalPadPx = MODAL_PAD_PX,
  } = params;

  const heightBasis =
    Number.isFinite(viewportHeightPx) && (viewportHeightPx ?? 0) > 0
      ? viewportHeightPx!
      : seatHeight;
  const minHandHeight = heightBasis * handMinPct;
  const maxHandHeight = heightBasis * handMaxPct;
  const baselineHandHeight = heightBasis * bottomBarPct;
  const handHeightPx = clamp(
    handHeightOverridePx ?? baselineHandHeight,
    minHandHeight,
    maxHandHeight,
  );

  const battlefieldHeightPx = seatHeight - handHeightPx;
  const baseCardHeightPx = Math.max(
    MIN_CARD_HEIGHT_PX,
    battlefieldHeightPx / 4,
  );
  const baseCardWidthPx = baseCardHeightPx * CARD_ASPECT_RATIO;
  const landscapeCardWidthPx = baseCardHeightPx;
  const landscapeCardHeightPx = baseCardWidthPx;

  const { previewWidthPx, previewHeightPx } = getPreviewDimensions(
    baseCardWidthPx,
    {
      previewScale,
      previewMinWidthPx,
      previewMaxWidthPx,
    },
  );

  const scaledZoneCardWidthPx = landscapeCardWidthPx * zoneAreaScale;
  const scaledZoneCardHeightPx = landscapeCardHeightPx * zoneAreaScale;
  const resolvedZonePadPx = Number.isFinite(zonePadPx)
    ? zonePadPx!
    : computeZonePadPx(
        scaledZoneCardWidthPx,
        scaledZoneCardHeightPx,
        zonePadAreaScale,
      );
  const sideZoneWidthPx = scaledZoneCardWidthPx + resolvedZonePadPx * 2;
  const sideZoneHeightPx = scaledZoneCardHeightPx + resolvedZonePadPx * 2;
  const cmdrStackOffsetPx = Math.max(40, baseCardHeightPx * 0.35);

  const viewScale =
    BASE_CARD_HEIGHT > 0 ? baseCardHeightPx / BASE_CARD_HEIGHT : 1;

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
    previewWidthPx,
    previewHeightPx,
    cmdrStackOffsetPx,
    viewScale,
    zonePadPx: resolvedZonePadPx,
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
    viewportHeightPx,
    previewScale = PREVIEW_SCALE_K,
    previewMinWidthPx = PREVIEW_MIN_WIDTH_PX,
    previewMaxWidthPx = PREVIEW_MAX_WIDTH_PX,
    zonePadPx,
    zonePadAreaScale = ZONE_PAD_AREA_SCALE,
    zoneAreaScale = ZONE_AREA_SCALE,
    modalPadPx = MODAL_PAD_PX,
  } = options;

  const { ref, size } = useElementSize<HTMLDivElement>({
    debounceMs: 16,
    thresholdPx: 1,
  });
  const lgQuery = React.useMemo(getLgMediaQuery, []);
  const isLg = useMediaQuery(lgQuery);
  const [viewportHeight, setViewportHeight] = React.useState<number | null>(
    null,
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setViewportHeight(window.innerHeight);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
      viewportHeightPx: viewportHeightPx ?? viewportHeight ?? undefined,
      previewScale,
      previewMinWidthPx,
      previewMaxWidthPx,
      zonePadPx,
      zonePadAreaScale,
      zoneAreaScale,
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
    viewportHeightPx,
    viewportHeight,
    previewScale,
    previewMinWidthPx,
    previewMaxWidthPx,
    zonePadPx,
    zonePadAreaScale,
    zoneAreaScale,
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
      "--sidezone-w": `${sizing.sideZoneWidthPx}px`,
      "--sidezone-h": `${sizing.sideZoneHeightPx}px`,
      "--zone-pad": `${sizing.zonePadPx}px`,
      "--cmdr-offset": `${sizing.cmdrStackOffsetPx}px`,
      "--preview-h": `${sizing.previewHeightPx}px`,
      "--preview-w": `${sizing.previewWidthPx}px`,
      "--modal-pad": `${sizing.modalPadPx}px`,
    } as React.CSSProperties;
  }, [sizing]);

  return { ref, size, sizing, cssVars, isLg };
};
