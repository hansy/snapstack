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
import { FooterLinks } from "@/components/landing/FooterLinks";
import { LandingBackground } from "@/components/landing/LandingBackground";
import { LandingHero } from "@/components/landing/LandingHero";
import { OrbitAnimation } from "@/components/landing/OrbitAnimation";
import { ResumeCard } from "@/components/landing/ResumeCard";

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
    try {
      const sessionId = createRoomId();
      markRoomAsHostPending(sessionId);
      navigate({ to: "/game/$sessionId", params: { sessionId } });
    } catch (error) {
      setIsCreating(false);
      throw error;
    }
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
    <div className="relative min-h-screen overflow-hidden bg-[#0b0a0f] text-zinc-100">
      <LandingBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <LandingHero
          badge="No accounts - No login"
          title="Start a game in seconds."
          description="Drawspell is a free virtual tabletop simulator for playing Magic: The Gathering. Create a room, share the link, and play together."
          animation={
            <OrbitAnimation className="h-[180px] w-[180px] sm:h-[220px] sm:w-[220px] lg:h-[420px] lg:w-[420px]" />
          }
          secondaryPanel={
            resumeSessionId ? (
              <ResumeCard onReconnect={handleReconnect} onLeave={handleLeave} />
            ) : null
          }
          primaryAction={
            resumeSessionId ? null : (
              <button
                onClick={handleCreateGame}
                disabled={isCreating}
                className="w-full max-w-sm rounded-full border border-white/10 bg-white/10 px-6 py-3 text-base font-semibold text-white shadow-[0_0_30px_rgba(99,102,241,0.25)] transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isCreating ? "Starting..." : "Start a game"}
                </span>
              </button>
            )
          }
        />
        <FooterLinks />
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
        content: "Multiplayer tabletop for spells, cards, and sketches.",
      },
    ],
  }),
});
