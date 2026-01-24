import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createRoomId } from "@/lib/roomId";
import {
  clearRoomHostPending,
  isRoomHostPending,
  markRoomAsHostPending,
  readRoomTokensFromStorage,
  writeRoomTokensToStorage,
} from "@/lib/partyKitToken";
import { clearIntentTransport } from "@/partykit/intentTransport";
import { destroyAllSessions } from "@/yjs/docManager";
import { useClientPrefsStore } from "@/store/clientPrefsStore";
import { useGameStore } from "@/store/gameStore";

const LandingPage = () => {
  const navigate = useNavigate();
  const hasHydrated = useClientPrefsStore((state) => state.hasHydrated);
  const lastSessionId = useClientPrefsStore((state) => state.lastSessionId);
  const clearLastSessionId = useClientPrefsStore(
    (state) => state.clearLastSessionId,
  );
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    destroyAllSessions();
    clearIntentTransport();
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!lastSessionId) {
      setResumeSessionId(null);
      return;
    }
    const storedTokens = readRoomTokensFromStorage(lastSessionId);
    const canResume = Boolean(
      storedTokens?.playerToken ||
      storedTokens?.spectatorToken ||
      isRoomHostPending(lastSessionId),
    );
    if (canResume) {
      setResumeSessionId(lastSessionId);
    } else {
      setResumeSessionId(null);
      clearLastSessionId();
    }
  }, [hasHydrated, lastSessionId, clearLastSessionId]);

  const handleCreateGame = () => {
    if (isCreating) return;
    setIsCreating(true);
    const sessionId = createRoomId();
    markRoomAsHostPending(sessionId);
    navigate({ to: "/game/$sessionId", params: { sessionId } });
  };

  const handleReconnect = () => {
    if (!resumeSessionId) return;
    navigate({
      to: "/game/$sessionId",
      params: { sessionId: resumeSessionId },
    });
  };

  const handleLeave = () => {
    if (!resumeSessionId) return;
    clearRoomHostPending(resumeSessionId);
    writeRoomTokensToStorage(resumeSessionId, null);
    const store = useGameStore.getState();
    store.setRoomTokens(null);
    store.forgetSessionIdentity(resumeSessionId);
    store.resetSession();
    clearLastSessionId();
    destroyAllSessions();
    clearIntentTransport();
    setResumeSessionId(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="max-w-xl w-full px-8 py-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg">
        <h1 className="text-3xl font-semibold tracking-tight mb-4">
          Drawspell
        </h1>
        <p className="text-zinc-300 mb-8">
          Start a multiplayer table and share the link so others can join.
        </p>
        {resumeSessionId ? (
          <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <h2 className="text-lg font-semibold text-zinc-100">
              You're already in a game
            </h2>
            <p className="text-sm text-zinc-300 mt-1">
              Reconnect to your last session or leave it to stop syncing.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleReconnect}
                className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium transition"
              >
                Reconnect
              </button>
              <button
                onClick={handleLeave}
                className="flex-1 py-2.5 px-4 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-medium transition"
              >
                Leave game
              </button>
            </div>
          </div>
        ) : null}
        {resumeSessionId ? null : (
          <button
            onClick={handleCreateGame}
            disabled={isCreating}
            className="w-full py-3 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-zinc-50 font-medium transition disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-indigo-500"
          >
            <span className="inline-flex items-center justify-center gap-2">
              {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isCreating ? "Creating..." : "Create game"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Drawspell" },
      {
        name: "description",
        content: "Online card tabletop simulator. No accounts. No login.",
      },
    ],
  }),
});
