import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { v4 as uuidv4 } from 'uuid';

const LandingPage = () => {
  const navigate = useNavigate();

  const handleCreateGame = () => {
    const sessionId = uuidv4();
    navigate({ to: '/game/$sessionId', params: { sessionId } });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="max-w-xl w-full px-8 py-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg">
        <h1 className="text-3xl font-semibold tracking-tight mb-4">Snapstack</h1>
        <p className="text-zinc-300 mb-8">
          Start a multiplayer table and share the link so others can join. State is synced in realtime.
        </p>
        <button
          onClick={handleCreateGame}
          className="w-full py-3 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-zinc-50 font-medium transition"
        >
          Create game
        </button>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/')({
  component: LandingPage,
});
