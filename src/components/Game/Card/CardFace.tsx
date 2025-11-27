import React from 'react';
import { Card as CardType } from '../../../types';
import { cn } from '../../../lib/utils';

interface CardFaceProps {
    card: CardType;
    faceDown?: boolean;
    imageClassName?: string;
    countersClassName?: string;
}

export const CardFace: React.FC<CardFaceProps> = ({
    card,
    faceDown,
    imageClassName,
    countersClassName,
}) => {
    return (
        <>
            {faceDown ? (
                <div className="w-full h-full bg-indigo-900/50 rounded border-2 border-indigo-500/30 flex items-center justify-center bg-[url('https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering-card_back.jpg')] bg-cover bg-center" />
            ) : card.imageUrl ? (
                <img
                    src={card.imageUrl}
                    alt={card.name}
                    className={cn("w-full h-full object-cover rounded pointer-events-none", imageClassName)}
                />
            ) : (
                <div className="text-xs text-center font-medium text-zinc-300 px-2">{card.name}</div>
            )}

            {card.counters.length > 0 && (
                <div className={cn("absolute -top-2 -right-2 flex gap-1", countersClassName)}>
                    {card.counters.map((counter, i) => (
                        <div
                            key={i}
                            className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm border border-indigo-400"
                        >
                            {counter.count}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};
