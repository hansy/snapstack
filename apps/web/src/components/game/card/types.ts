import type React from "react";
import type { Card as CardType } from "@/types";

export interface CardProps {
  card: CardType;
  style?: React.CSSProperties;
  className?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  faceDown?: boolean;
  scale?: number;
  preferArtCrop?: boolean;
  rotateLabel?: boolean;
  disableDrag?: boolean;
  isDragging?: boolean;
  highlightColor?: string;
}

export interface CardViewProps {
  card: CardType;
  style?: React.CSSProperties;
  className?: string;
  imageClassName?: string;
  imageTransform?: string;
  preferArtCrop?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
  faceDown?: boolean;
  isDragging?: boolean;
  rotateLabel?: boolean;
  onDoubleClick?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  highlightColor?: string;
  disableHoverAnimation?: boolean;
}

