import type { CSSProperties } from "react";
import "./landing.css";

type OrbitRing = {
  sizeClass: string;
  duration: string;
  reverse?: boolean;
  color: string;
  glow: string;
};

const orbitRings: OrbitRing[] = [
  {
    sizeClass:
      "h-[120px] w-[120px] sm:h-[150px] sm:w-[150px] lg:h-[280px] lg:w-[280px]",
    duration: "12s",
    color: "#f43f5e",
    glow: "rgba(244, 63, 94, 0.7)",
  },
  {
    sizeClass:
      "h-[150px] w-[150px] sm:h-[190px] sm:w-[190px] lg:h-[330px] lg:w-[330px]",
    duration: "15s",
    reverse: true,
    color: "#8b5cf6",
    glow: "rgba(139, 92, 246, 0.7)",
  },
  {
    sizeClass:
      "h-[180px] w-[180px] sm:h-[220px] sm:w-[220px] lg:h-[380px] lg:w-[380px]",
    duration: "18s",
    color: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.7)",
  },
  {
    sizeClass:
      "h-[210px] w-[210px] sm:h-[250px] sm:w-[250px] lg:h-[420px] lg:w-[420px]",
    duration: "21s",
    reverse: true,
    color: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.7)",
  },
];

type OrbitAnimationProps = {
  className?: string;
};

export function OrbitAnimation({ className }: OrbitAnimationProps) {
  return (
    <div className={`landing-orbit-frame ${className ?? ""}`.trim()}>
      {orbitRings.map((ring) => (
        <div
          key={ring.duration}
          className={`landing-orbit-shell ${ring.sizeClass}`}
        >
          <div
            className="landing-orbit-spin"
            style={
              {
                "--orbit-duration": ring.duration,
                animationDirection: ring.reverse ? "reverse" : "normal",
              } as CSSProperties
            }
          >
            <span
              className="landing-orbit-dot"
              style={
                {
                  "--dot-color": ring.color,
                  "--dot-glow": ring.glow,
                } as CSSProperties
              }
            />
          </div>
        </div>
      ))}
      <div className="landing-orbit-core" />
    </div>
  );
}
