import type { FC } from 'react';

import { useMultiplayerBoardController } from '@/hooks/game/board/useMultiplayerBoardController';
import { RoomFullScreen } from '@/components/game/room/RoomFullScreen';
import { MultiplayerBoardView } from './MultiplayerBoardView';

interface MultiplayerBoardProps {
    sessionId: string;
}

export const MultiplayerBoard: FC<MultiplayerBoardProps> = ({ sessionId }) => {
    const controller = useMultiplayerBoardController(sessionId);
    const { joinBlocked, ...viewProps } = controller;
    if (joinBlocked) {
        return <RoomFullScreen onLeave={viewProps.handleLeave} />;
    }
    return <MultiplayerBoardView {...viewProps} />;
};
