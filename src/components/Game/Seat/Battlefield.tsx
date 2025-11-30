import React from 'react';
import { cn } from '../../../lib/utils';
import { Zone as ZoneType, Card as CardType, Player } from '../../../types';
import { Card } from '../Card/Card';
import { Zone } from '../Zone/Zone';
import { CARD_WIDTH_PX, CARD_HEIGHT_PX } from '../../../lib/constants';
import { useDragStore } from '../../../store/dragStore';

interface BattlefieldProps {
    zone: ZoneType;
    cards: CardType[];
    player: Player;
    isTop: boolean;
    scale?: number;
    onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

export const Battlefield: React.FC<BattlefieldProps> = ({
    zone,
    cards,
    player,
    isTop,
    scale = 1,
    onCardContextMenu,
    onContextMenu
}) => {
    const activeCardId = useDragStore((state) => state.activeCardId);
    const showGrid = Boolean(activeCardId);
    const GRID_SIZE = 30;
    const gridColor = 'rgba(148, 163, 184, 0.3)'; // zinc-400/30

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
                onContextMenu={onContextMenu}
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
                    const left = card.position.x - CARD_WIDTH_PX / 2;
                    const top = card.position.y - CARD_HEIGHT_PX / 2;
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
                            scale={scale}
                        />
                    );
                })}
            </Zone>

            {/* Placeholder Text */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                <span className="text-4xl font-bold uppercase tracking-widest">{player.name}</span>
            </div>
        </div>
    );
};
