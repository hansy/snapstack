import { createFileRoute } from '@tanstack/react-router';
import { MultiplayerBoard } from '../components/Game/Board/MultiplayerBoard';
import { UsernamePromptScreen } from '../components/Username/UsernamePromptScreen';
import { useClientPrefsStore } from '../store/clientPrefsStore';

export const Route = createFileRoute('/game/$sessionId')({
  component: GameRoute,
});

function GameRoute() {
  const { sessionId } = Route.useParams();
  const hasHydrated = useClientPrefsStore((state) => state.hasHydrated);
  const username = useClientPrefsStore((state) => state.username);

  if (!hasHydrated) return null;

  if (!username) return <UsernamePromptScreen />;

  return <MultiplayerBoard sessionId={sessionId} />;
}
