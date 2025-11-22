import React from 'react';
import { cn } from '../../../lib/utils';
import { Zone as ZoneType, Card as CardType } from '../../../types';
import { Card } from '../Card/Card';
import { Zone } from '../Zone/Zone';
import { CARD_HEIGHT, CARD_ASPECT_RATIO } from '../../../lib/constants';

interface HandProps {
    zone: ZoneType;
    cards: CardType[];
    isTop: boolean;
    isMe: boolean;
    onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
    className?: string;
    scale?: number;
}

export const Hand: React.FC<HandProps> = ({ zone, cards, isTop, isMe, onCardContextMenu, className, scale = 1 }) => {
    return (
        <div className={cn(
            "h-full flex-1 relative z-20",
            isTop ? "bg-gradient-to-b from-black/50 to-transparent" : "bg-gradient-to-t from-black/50 to-transparent",
            className
        )}>
            <Zone zone={zone} scale={scale} className={cn("w-full h-full flex justify-center overflow-visible", isTop ? "items-start" : "items-end")}>
                {cards.map((card, index, array) => {
                    const totalCards = array.length;
                    const centerIndex = (totalCards - 1) / 2;
                    const rotate = (index - centerIndex) * 3;
                    const translateY = Math.abs(index - centerIndex) * 2;

                    return (
                        <div
                            key={card.id}
                            className={cn(
                                "relative shrink-0 -ml-6 first:ml-0 transition-all duration-200 ease-out z-0 hover:z-50 hover:scale-110 group",
                                CARD_HEIGHT,
                                CARD_ASPECT_RATIO
                            )}
                            style={{
                                transform: isTop
                                    ? `translateY(-20%) rotate(${180 - rotate}deg) translateY(${translateY}px)`
                                    : `translateY(20%) rotate(${rotate}deg) translateY(${translateY}px)`,
                            }}
                        >
                            <div className={cn(
                                "w-full h-full transition-transform duration-200",
                                isTop ? "group-hover:translate-y-[60%]" : "group-hover:-translate-y-[10%]"
                            )}>
                                <Card
                                    card={card}
                                    className="shadow-xl ring-1 ring-black/50"
                                    faceDown={!isMe && false}
                                    onContextMenu={(e) => onCardContextMenu?.(e, card)}
                                />
                            </div>
                        </div>
                    );
                })}
            </Zone>
        </div>
    );
};
