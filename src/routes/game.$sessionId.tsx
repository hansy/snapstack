import { createFileRoute } from '@tanstack/react-router';
import { MultiplayerBoard } from '../components/Game/Board/MultiplayerBoard';

export const Route = createFileRoute('/game/$sessionId')({
  component: GameRoute,
});

function GameRoute() {
  const { sessionId } = Route.useParams();
  return <MultiplayerBoard sessionId={sessionId} />;
}
