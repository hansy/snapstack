import { createSuggestedUsername, useClientPrefsStore } from '@/store/clientPrefsStore';
import { UsernameForm } from './UsernameForm';

export function UsernamePromptScreen() {
  const setUsername = useClientPrefsStore((state) => state.setUsername);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="max-w-xl w-full px-8 py-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg">
        <h1 className="text-3xl font-semibold tracking-tight mb-4">Choose a username</h1>
        <p className="text-zinc-300 mb-6">
          This name is saved on this device and used for future games.
        </p>

        <UsernameForm
          initialValue={createSuggestedUsername()}
          submitLabel="Continue"
          showRandomize
          onRandomize={createSuggestedUsername}
          onSubmit={(username) => setUsername(username)}
        />
      </div>
    </div>
  );
}
