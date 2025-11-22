import React from 'react';
import { cn } from '../../../lib/utils';
import { Zone as ZoneType, Card as CardType, ZoneId } from '../../../types';
import { Card } from '../Card/Card';
import { Zone } from '../Zone/Zone';
import { ZONE_BASE_CLASSES } from '../../../lib/constants';

interface CommanderZoneProps {
    zone: ZoneType;
    cards: CardType[];
    isTop: boolean;
    isRight: boolean;
    onZoneContextMenu?: (e: React.MouseEvent, zoneId: ZoneId) => void;
    scale?: number;
}

export const CommanderZone: React.FC<CommanderZoneProps> = ({
    zone,
    cards,
    isRight,
    onZoneContextMenu,
    scale = 1
}) => {
    return (
        <div className={cn(
            "relative z-20 h-full shrink-0", // Fixed width for Commander Zone wrapper
            isRight ? "border-r border-white/5" : "border-l border-white/5" // Separator
        )}>
            <div
                className="relative group h-full w-full"
                onContextMenu={(e) => onZoneContextMenu?.(e, zone.id)}
            >
                <Zone
                    zone={zone}
                    className={cn(ZONE_BASE_CLASSES, "bg-red-950/40 flex items-center justify-center relative shadow-lg backdrop-blur-sm p-2")}
                    scale={scale}
                >
                    {cards.length > 0 ? (
                        <Card card={cards[0]} className="w-full h-full" />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-red-900/50 gap-1">
                            <span className="text-md font-medium uppercase tracking-widest">Cmdr</span>
                        </div>
                    )}
                </Zone>
            </div>
        </div>
    );
};
