import React from 'react';
import { cn } from '../../../lib/utils';
import { Zone as ZoneType, Card as CardType, Player } from '../../../types';
import { Card } from '../Card/Card';
import { Zone } from '../Zone/Zone';
import { CARD_WIDTH_PX, CARD_HEIGHT_PX } from '../../../lib/constants';
import { useDragStore } from '../../../store/dragStore';
import { fromNormalizedPosition } from '../../../lib/positions';

interface BattlefieldProps {
    zone: ZoneType;
    cards: CardType[];
    player: Player;
    isTop: boolean;
    isMe?: boolean;
    scale?: number;
    viewScale?: number;
    onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

export const Battlefield: React.FC<BattlefieldProps> = ({
    zone,
    cards,
    player,
    isTop,
    isMe,
    scale = 1,
    viewScale = 1,
    onCardContextMenu,
    onContextMenu
}) => {
    const activeCardId = useDragStore((state) => state.activeCardId);
    const showGrid = Boolean(activeCardId);
    const GRID_SIZE = 30 * viewScale;
    const gridColor = 'rgba(148, 163, 184, 0.3)'; // zinc-400/30
    const zoneRef = React.useRef<HTMLDivElement | null>(null);
    const [zoneSize, setZoneSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    React.useEffect(() => {
        if (!zoneRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry?.contentRect) {
                const { width, height } = entry.contentRect;
                setZoneSize({ width, height });
            }
        });
        observer.observe(zoneRef.current);
        return () => observer.disconnect();
    }, [zoneRef]);

    return (
        <div
            className={cn(
                "flex-1 relative",
                isTop ? "order-last" : "order-first"
            )}
            onContextMenu={onContextMenu}
        >
            <Zone
                zone={zone}
                className="w-full h-full relative"
                layout="free-form"
                scale={scale}
                cardScale={viewScale}
                onContextMenu={onContextMenu}
                innerRef={(node) => {
                    zoneRef.current = node;
                }}
            >
                {showGrid && (
                    <div
                        className="pointer-events-none absolute inset-0 z-0"
                        style={{
                            backgroundImage: `radial-gradient(circle, ${gridColor} 2px, transparent 2px)`,
                            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                            backgroundPosition: `-${GRID_SIZE / 2}px -${GRID_SIZE / 2}px`
                        }}
                    />
                )}
                {cards.map(card => {
                    const { x, y } = fromNormalizedPosition(card.position, zoneSize.width || 1, zoneSize.height || 1);
                    const left = x - CARD_WIDTH_PX / 2;
                    const top = y - CARD_HEIGHT_PX / 2;
                    return (
                        <Card
                            key={card.id}
                            card={card}
                            style={{
                                position: 'absolute',
                                left,
                                top,
                                transform: isTop ? 'rotate(180deg)' : undefined
                            }}
                            onContextMenu={(e) => {
                                e.stopPropagation();
                                onCardContextMenu?.(e, card);
                            }}
                            scale={viewScale}
                            rotateLabel={isTop}
                            faceDown={card.faceDown}
                        />
                    );
                })}
            </Zone>

            {/* Placeholder Text */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                <span className="text-4xl font-bold uppercase tracking-widest">{isMe ? 'Me' : player.name}</span>
            </div>
        </div>
    );
};
