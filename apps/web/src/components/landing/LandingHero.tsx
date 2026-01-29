import type { ReactNode } from "react";

type LandingHeroProps = {
  badge: string;
  title: string;
  description: string;
  animation?: ReactNode;
  primaryAction?: ReactNode;
  secondaryPanel?: ReactNode;
};

export function LandingHero({
  badge,
  title,
  description,
  animation,
  primaryAction,
  secondaryPanel,
}: LandingHeroProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pb-10 pt-12 text-center">
      <div className="relative flex w-full max-w-4xl flex-col items-center gap-8">
        {animation ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-80">
            {animation}
          </div>
        ) : null}
        <div className="relative z-10 flex flex-col items-center gap-5">
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.35em] text-zinc-200/80">
            {badge}
          </span>
          <h1
            className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl"
            style={{
              fontFamily:
                '"Fraunces", "Iowan Old Style", "Palatino", "Georgia", serif',
            }}
          >
            {title}
          </h1>
          <p
            className="max-w-2xl text-base text-zinc-300 sm:text-lg"
            style={{
              fontFamily:
                '"Source Serif Pro", "Iowan Old Style", "Palatino", "Georgia", serif',
            }}
          >
            {description}
          </p>
        </div>
        <div className="relative z-10 flex w-full flex-col items-center gap-5">
          {secondaryPanel}
          {primaryAction}
        </div>
      </div>
    </main>
  );
}
