import type { CSSProperties } from "react";
import "./landing.css";

type OrbitRing = {
  sizeClass: string;
  duration: string;
  reverse?: boolean;
  color: string;
  glow: string;
  dotSize?: string;
  shadow?: string;
  ring?: string;
};

const orbitRings: OrbitRing[] = [
  {
    sizeClass:
      "h-[200px] w-[200px] sm:h-[240px] sm:w-[240px] lg:h-[520px] lg:w-[520px]",
    duration: "12s",
    color: "#0b0a0f",
    glow: "rgba(246, 241, 222, 0.9)",
    ring: "rgba(246, 241, 222, 0.6)",
  },
  {
    sizeClass:
      "h-[230px] w-[230px] sm:h-[280px] sm:w-[280px] lg:h-[580px] lg:w-[580px]",
    duration: "15s",
    reverse: true,
    color: "#0b0a0f",
    glow: "rgba(14, 104, 171, 0.95)",
    ring: "rgba(14, 104, 171, 0.7)",
  },
  {
    sizeClass:
      "h-[260px] w-[260px] sm:h-[320px] sm:w-[320px] lg:h-[640px] lg:w-[640px]",
    duration: "18s",
    color: "#f8fafc",
    glow: "rgba(0, 0, 0, 0.95)",
    dotSize: "8px",
    shadow: "rgba(0, 0, 0, 1)",
    ring: "rgba(248, 250, 252, 0.85)",
  },
  {
    sizeClass:
      "h-[290px] w-[290px] sm:h-[360px] sm:w-[360px] lg:h-[700px] lg:w-[700px]",
    duration: "21s",
    reverse: true,
    color: "#0b0a0f",
    glow: "rgba(211, 32, 42, 0.95)",
    ring: "rgba(211, 32, 42, 0.7)",
  },
  {
    sizeClass:
      "h-[320px] w-[320px] sm:h-[400px] sm:w-[400px] lg:h-[760px] lg:w-[760px]",
    duration: "24s",
    color: "#0b0a0f",
    glow: "rgba(0, 115, 62, 0.95)",
    ring: "rgba(0, 115, 62, 0.7)",
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
                  "--dot-ring": ring.ring ?? ring.glow,
                  "--dot-shadow": ring.shadow,
                  "--dot-size": ring.dotSize,
                } as CSSProperties
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}
