type ResumeCardProps = {
  onReconnect: () => void;
  onLeave: () => void;
};

export function ResumeCard({ onReconnect, onLeave }: ResumeCardProps) {
  return (
    <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-5 text-left backdrop-blur">
      <h2 className="text-base font-semibold text-zinc-100">
        You're already in a game
      </h2>
      <p className="mt-1 text-sm text-zinc-300">
        Reconnect to your last session or leave to start a new game.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onReconnect}
          className="flex-1 rounded-lg bg-emerald-400/90 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
        >
          Reconnect
        </button>
        <button
          onClick={onLeave}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-white/10"
        >
          Leave game
        </button>
      </div>
    </div>
  );
}
