import React from 'react';
import { createPortal } from 'react-dom';
import { useDragStore } from '../../../store/dragStore';

export const BattlefieldGridOverlay: React.FC = () => {
    const activeCardId = useDragStore((state) => state.activeCardId);

    if (!activeCardId || typeof document === 'undefined') {
        return null;
    }

    const gridColor = 'rgba(148, 163, 184, 0.12)'; // zinc-400/20
    const GRID_SIZE = 30;

    return createPortal(
        <div
            className="pointer-events-none fixed inset-y-0 left-12 right-0 z-[1000]"
            style={{
                backgroundImage: `
                    linear-gradient(to right, ${gridColor} 1px, transparent 1px),
                    linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)
                `,
                backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
            }}
        />,
        document.body
    );
};
