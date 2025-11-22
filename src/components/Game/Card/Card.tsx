import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Card as CardType } from '../../../types';
import { cn } from '../../../lib/utils';
import { useGameStore } from '../../../store/gameStore';
import { CARD_HEIGHT, CARD_ASPECT_RATIO } from '../../../lib/constants';

interface CardProps {
    card: CardType;
    style?: React.CSSProperties;
    className?: string;
    onContextMenu?: (e: React.MouseEvent) => void;
    faceDown?: boolean;
}

export const Card: React.FC<CardProps> = ({ card, style: propStyle, className, onContextMenu, faceDown }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: card.id,
        data: {
            cardId: card.id,
            zoneId: card.zoneId,
            ownerId: card.ownerId,
            tapped: card.tapped,
        }
    });

    const dragStyle = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined;

    // Log when card is being dragged
    if (isDragging) {
        console.log(`🎴 CARD ${card.name} (${card.id.slice(0, 8)}...):`, {
            tapped: card.tapped,
            storedPosition: card.position,
            dragTransform: transform,
            isDragging
        });
    }

    return (
        <div
            ref={setNodeRef}
            style={propStyle}
            className={cn(
                // Outer wrapper: handles rotation only
                card.tapped && "rotate-90",
                className
            )}
        >
            <div
                style={dragStyle}
                {...listeners}
                {...attributes}
                className={cn(
                    CARD_HEIGHT,
                    CARD_ASPECT_RATIO,
                    "bg-zinc-800 rounded-lg border border-zinc-700 shadow-md flex flex-col items-center justify-center select-none hover:scale-105 hover:shadow-xl hover:z-10 hover:border-indigo-500/50",
                    // Transitions disabled per user request
                    // !isDragging && "transition-transform duration-300 ease-out",
                    card.tapped && "border-zinc-600 bg-zinc-900",
                    isDragging && "opacity-90 scale-110 z-50 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-2 ring-indigo-500 cursor-grabbing",
                    !isDragging && "cursor-grab active:cursor-grabbing"
                )}
                onDoubleClick={() => useGameStore.getState().tapCard(card.id)}
                onContextMenu={onContextMenu}
            >
                {faceDown ? (
                    <div className="w-full h-full bg-indigo-900/50 rounded border-2 border-indigo-500/30 flex items-center justify-center bg-[url('https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering-card_back.jpg')] bg-cover bg-center">
                        {/* Optional: Overlay or just use image */}
                    </div>
                ) : card.imageUrl ? (
                    <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover rounded pointer-events-none" />
                ) : (
                    <div className="text-xs text-center font-medium text-zinc-300">{card.name}</div>
                )}

                {/* Counters */}
                {card.counters.length > 0 && (
                    <div className="absolute -top-2 -right-2 flex gap-1">
                        {card.counters.map((counter, i) => (
                            <div key={i} className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm border border-indigo-400">
                                {counter.count}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
