import React from 'react';
import { cn } from '../../../lib/utils';
import { Zone as ZoneType, Card as CardType, Player } from '../../../types';
import { Card } from '../Card/Card';
import { Zone } from '../Zone/Zone';
import { CARD_WIDTH_PX, CARD_HEIGHT_PX } from '../../../lib/constants';

interface BattlefieldProps {
    zone: ZoneType;
    cards: CardType[];
    player: Player;
    isTop: boolean;
    scale?: number;
    ghostCard?: { zoneId: string; position: { x: number; y: number }; tapped?: boolean } | null;
    onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
}

export const Battlefield: React.FC<BattlefieldProps> = ({
    zone,
    cards,
    player,
    isTop,
    scale = 1,
    ghostCard,
    onCardContextMenu
}) => {
    return (
        <div className={cn(
            "flex-1 relative",
            isTop ? "order-last" : "order-first"
        )}>
            <Zone
                zone={zone}
                className="w-full h-full relative bg-[linear-gradient(to_right,#3f3f46_1px,transparent_1px),linear-gradient(to_bottom,#3f3f46_1px,transparent_1px)] [background-size:30px_30px]"
                layout="free-form"
                scale={scale}
                ghostPosition={ghostCard?.zoneId === zone.id ? ghostCard.position : undefined}
                ghostTapped={ghostCard?.zoneId === zone.id ? ghostCard.tapped : undefined}
            >
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
                            onContextMenu={(e) => onCardContextMenu?.(e, card)}
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
