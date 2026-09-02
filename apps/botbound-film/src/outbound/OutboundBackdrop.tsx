import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

const GRID_SIZE = 76;

export const OutboundBackdrop: React.FC<{
  children: React.ReactNode;
  accent?: "violet" | "electric";
}> = ({ children, accent = "violet" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const scale = width / 1080;

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: "#06060A",
        color: "#F8F7FC",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1050 * scale,
          height: 1050 * scale,
          left: accent === "electric" ? -470 * scale : 510 * scale,
          top: accent === "electric" ? 820 * scale : -400 * scale,
          borderRadius: "50%",
          background:
            accent === "electric"
              ? "radial-gradient(circle, rgba(94,234,212,0.15) 0%, rgba(139,92,246,0.11) 36%, rgba(6,6,10,0) 70%)"
              : "radial-gradient(circle, rgba(139,92,246,0.34) 0%, rgba(109,61,235,0.10) 42%, rgba(6,6,10,0) 72%)",
          filter: `blur(${44 * scale}px)`,
          translate: interpolate(
            frame,
            [0, Math.max(1, durationInFrames - 1)],
            ["0px 0px", `${-34 * scale}px ${48 * scale}px`],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.17,
          backgroundImage:
            "linear-gradient(rgba(184,164,255,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(184,164,255,0.13) 1px, transparent 1px)",
          backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
          backgroundPosition: interpolate(
            frame,
            [0, Math.max(1, durationInFrames - 1)],
            ["0px 0px", `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
          maskImage: "radial-gradient(circle at 50% 47%, black 0%, transparent 73%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(6,6,10,0.02) 0%, rgba(6,6,10,0.1) 56%, rgba(6,6,10,0.72) 100%)",
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
