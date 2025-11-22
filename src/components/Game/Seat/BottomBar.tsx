import React from 'react';
import { cn } from '../../../lib/utils';

interface BottomBarProps {
    isTop: boolean;
    isRight: boolean;
    children: React.ReactNode;
    className?: string;
}

export const BottomBar: React.FC<BottomBarProps> = ({ isTop, isRight, children, className }) => {
    return (
        <div className={cn(
            "flex w-full shrink-0 relative z-20",
            isTop ? "border-first border-b border-white/5" : "border-last border-t border-white/5",
            // If sidebar is on the right (isRight), we want the CommanderZone (which is first in DOM if we don't change order) 
            // to be on the right? No, the sidebar is on the right.
            // The layout is: [Main Area] [Sidebar] (if isRight)
            // Inside Main Area: [Battlefield] [BottomBar] (if !isTop)

            // We want CommanderZone to be flush with Sidebar.
            // If isRight (Sidebar on Right): [Hand ... Commander] [Sidebar]
            // If !isRight (Sidebar on Left): [Sidebar] [Commander ... Hand]

            // So if isRight, we want flex-row-reverse?
            // No, let's control the children order or use flex-direction.
            isRight ? "flex-row-reverse" : "flex-row",

            className
        )}>
            {children}
        </div>
    );
};
