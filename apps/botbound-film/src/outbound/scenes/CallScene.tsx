import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BotMark } from "../../components/Brand";
import { OutboundBackdrop } from "../OutboundBackdrop";
import {
  OUTBOUND_VERTICAL_SAFE_ZONE,
  OutboundChrome,
  SceneHeadline,
  StatusPill,
} from "../OutboundChrome";

const bars = [0.32, 0.57, 0.82, 0.48, 0.94, 0.64, 0.38, 0.74, 1, 0.58, 0.86, 0.42];

export const CallScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const vertical = height / width > 1.3;
  const markSize = vertical ? 350 : 280;
  const stageSize = vertical ? 610 : 460;

  return (
    <OutboundBackdrop accent="electric">
      <OutboundChrome section="OUTBOUND / LIVE" />
      <div
        style={{
          position: "absolute",
          top: vertical ? 350 : 170,
          left: vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.left : 72,
          right: vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.right : 72,
        }}
      >
        <SceneHeadline>MAKES THE CALL.</SceneHeadline>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: vertical ? 690 : 395,
          width: stageSize,
          height: stageSize,
          marginLeft: -stageSize / 2,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle, rgba(139,92,246,0.26) 0%, rgba(139,92,246,0.08) 48%, rgba(6,6,10,0) 72%)",
          opacity: interpolate(frame, [2, 16], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0, 18], [0.84, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {[0, 1, 2, 3].map((ring) => (
          <div
            key={ring}
            style={{
              position: "absolute",
              inset: stageSize * 0.18,
              borderRadius: "50%",
              border: `${ring === 0 ? 3 : 2}px solid rgba(167,139,250,0.64)`,
              opacity: interpolate((frame + ring * 13) % 52, [0, 8, 51], [0, 0.72, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: interpolate((frame + ring * 13) % 52, [0, 51], [0.72, 1.82], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
        ))}
        <div
          style={{
            width: markSize,
            height: markSize,
            borderRadius: vertical ? 84 : 66,
            overflow: "hidden",
            border: "2px solid rgba(184,164,255,0.36)",
            backgroundColor: "#08080D",
            boxShadow: "0 32px 90px rgba(0,0,0,0.5), 0 0 70px rgba(139,92,246,0.22)",
          }}
        >
          <BotMark size={markSize} image="app" />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.left : 100,
          right: vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.right : 100,
          top: vertical ? 1320 : 820,
          height: vertical ? 180 : 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: vertical ? 18 : 15,
          borderRadius: vertical ? 40 : 32,
          border: "1px solid rgba(184,164,255,0.24)",
          backgroundColor: "rgba(12,11,20,0.8)",
          boxShadow: "0 26px 80px rgba(0,0,0,0.35)",
        }}
      >
        {bars.map((bar, index) => (
          <div
            key={index}
            style={{
              width: vertical ? 42 : 32,
              height:
                (vertical ? 136 : 96) *
                bar *
                interpolate((frame + index * 3) % 24, [0, 12, 23], [0.58, 1, 0.58], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              borderRadius: 999,
              background:
                index > 3 && index < 9
                  ? "linear-gradient(180deg, #C4B5FD, #7C3AED)"
                  : "rgba(196,181,253,0.34)",
              boxShadow: index > 3 && index < 9 ? "0 0 30px rgba(139,92,246,0.32)" : undefined,
            }}
          />
        ))}
      </div>
      {vertical ? (
        <div
          style={{
            position: "absolute",
            left: OUTBOUND_VERTICAL_SAFE_ZONE.left,
            top: 1508,
            opacity: interpolate(frame, [14, 28], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <StatusPill tone="mint">CALL CONNECTED</StatusPill>
        </div>
      ) : null}
    </OutboundBackdrop>
  );
};
