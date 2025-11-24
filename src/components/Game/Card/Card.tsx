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
    scale?: number;
}

export interface CardViewProps {
    card: CardType;
    style?: React.CSSProperties;
    className?: string;
    onContextMenu?: (e: React.MouseEvent) => void;
    faceDown?: boolean;
    isDragging?: boolean;
    onDoubleClick?: () => void;
}

export const CardView = React.forwardRef<HTMLDivElement, CardViewProps>(({
    card,
    style,
    className,
    onContextMenu,
    faceDown,
    isDragging,
    onDoubleClick,
    ...props
}, ref) => {
    return (
        <div
            ref={ref}
            style={style}
            className={cn(
                CARD_HEIGHT,
                CARD_ASPECT_RATIO,
                "bg-zinc-800 rounded-lg border border-zinc-700 shadow-md flex flex-col items-center justify-center select-none",
                !isDragging && "hover:scale-105 hover:shadow-xl hover:z-10 hover:border-indigo-500/50 cursor-grab active:cursor-grabbing",
                card.tapped && "border-zinc-600 bg-zinc-900",
                isDragging && "shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-2 ring-indigo-500 cursor-grabbing",
                className
            )}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            {...props}
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
    );
});

export const Card: React.FC<CardProps> = ({ card, style: propStyle, className, onContextMenu, faceDown }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: card.id,
        data: {
            cardId: card.id,
            zoneId: card.zoneId,
            ownerId: card.ownerId,
            tapped: card.tapped,
        }
    });

    const { transform: propTransform, ...restPropStyle } = propStyle || {};

    // Compose transforms
    const transformParts: string[] = [];
    if (typeof propTransform === 'string') transformParts.push(propTransform);
    if (card.tapped) transformParts.push('rotate(90deg)');

    const style: React.CSSProperties = {
        ...restPropStyle,
        transform: transformParts.length ? transformParts.join(' ') : undefined,
        transformOrigin: 'center center',
        opacity: isDragging ? 0 : 1, // Hide original when dragging
    };

    return (
        <CardView
            ref={setNodeRef}
            card={card}
            style={style}
            className={className}
            onContextMenu={onContextMenu}
            faceDown={faceDown}
            isDragging={isDragging}
            onDoubleClick={() => useGameStore.getState().tapCard(card.id)}
            {...listeners}
            {...attributes}
        />
    );
};
