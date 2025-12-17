import { createFileRoute } from '@tanstack/react-router';
import { MultiplayerBoard } from '../components/Game/Board/MultiplayerBoard';
import React from 'react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { createSuggestedUsername, normalizeUsernameInput, USERNAME_MAX_LENGTH, useClientPrefsStore } from '../store/clientPrefsStore';
import { cn } from '../lib/utils';

export const Route = createFileRoute('/game/$sessionId')({
  component: GameRoute,
});

function GameRoute() {
  const { sessionId } = Route.useParams();
  const hasHydrated = useClientPrefsStore((state) => state.hasHydrated);
  const username = useClientPrefsStore((state) => state.username);

  if (!hasHydrated) return null;

  if (!username) return <UsernamePrompt />;

  return <MultiplayerBoard sessionId={sessionId} />;
}

function UsernamePrompt() {
  const setUsername = useClientPrefsStore((state) => state.setUsername);
  const [draft, setDraft] = React.useState(() => createSuggestedUsername());
  const [prefilled, setPrefilled] = React.useState(true);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const normalized = normalizeUsernameInput(draft);
  const length = draft.length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="max-w-xl w-full px-8 py-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg">
        <h1 className="text-3xl font-semibold tracking-tight mb-4">Choose a username</h1>
        <p className="text-zinc-300 mb-6">
          This name is saved on this device and used for future games.
        </p>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-4">
            <label className="text-sm font-medium text-zinc-200" htmlFor="username">
              Username
            </label>
            <div className="text-xs text-zinc-400 tabular-nums">
              {Math.min(length, USERNAME_MAX_LENGTH)}/{USERNAME_MAX_LENGTH}
            </div>
          </div>
          <Input
            id="username"
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              if (prefilled) setPrefilled(false);
              setDraft(e.target.value);
            }}
            maxLength={USERNAME_MAX_LENGTH}
            autoFocus
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (!normalized) return;
              setUsername(normalized);
            }}
            placeholder="Your name"
            className={cn(
              'h-11',
              prefilled && 'ring-2 ring-amber-500/30 border-amber-500/50'
            )}
          />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft(createSuggestedUsername());
              setPrefilled(true);
              setTimeout(() => inputRef.current?.select(), 0);
            }}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300"
          >
            Randomize
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!normalized) return;
              setUsername(normalized);
            }}
            disabled={!normalized}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
