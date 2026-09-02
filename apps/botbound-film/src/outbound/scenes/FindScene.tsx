import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { OutboundBackdrop } from "../OutboundBackdrop";
import {
  OUTBOUND_VERTICAL_SAFE_ZONE,
  OutboundChrome,
  SceneHeadline,
  StatusPill,
} from "../OutboundChrome";

const prospects = [
  { x: 8, y: 19, label: "MATCHED", delay: 6 },
  { x: 59, y: 8, label: "PHONE READY", delay: 12 },
  { x: 68, y: 59, label: "READY", delay: 18 },
  { x: 5, y: 67, label: "MATCHED", delay: 24 },
];

export const FindScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const vertical = height / width > 1.3;
  const panelWidth = vertical ? 792 : 840;
  const panelHeight = vertical ? 760 : 560;

  return (
    <OutboundBackdrop>
      <OutboundChrome section="THE FIRST MOVE" />
      <div
        style={{
          position: "absolute",
          top: vertical ? 350 : 170,
          left: vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.left : 72,
          right: vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.right : 72,
        }}
      >
        <SceneHeadline>FINDS THE LEAD.</SceneHeadline>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: vertical ? 700 : 360,
          width: panelWidth,
          height: panelHeight,
          marginLeft: -panelWidth / 2,
          borderRadius: vertical ? 54 : 42,
          overflow: "hidden",
          border: "1px solid rgba(184,164,255,0.28)",
          background:
            "linear-gradient(145deg, rgba(29,20,50,0.9) 0%, rgba(12,11,20,0.93) 58%, rgba(8,8,13,0.96) 100%)",
          boxShadow: "0 38px 120px rgba(0,0,0,0.52), 0 0 80px rgba(139,92,246,0.1)",
          opacity: interpolate(frame, [5, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [4, 20], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: vertical ? 260 : 210,
            height: vertical ? 260 : 210,
            marginLeft: vertical ? -130 : -105,
            marginTop: vertical ? -130 : -105,
            borderRadius: "50%",
            border: "2px solid rgba(167,139,250,0.8)",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.34) 0%, rgba(139,92,246,0.08) 52%, rgba(139,92,246,0) 72%)",
            boxShadow: "0 0 90px rgba(139,92,246,0.38)",
          }}
        >
          {[0, 1, 2].map((ring) => (
            <div
              key={ring}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                border: "2px solid rgba(167,139,250,0.7)",
                opacity: interpolate((frame + ring * 18) % 54, [0, 10, 53], [0, 0.78, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                scale: interpolate((frame + ring * 18) % 54, [0, 53], [0.36, 1.8], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              inset: vertical ? 84 : 66,
              borderRadius: "50%",
              backgroundColor: "#8B5CF6",
              boxShadow: "0 0 36px rgba(139,92,246,0.92)",
            }}
          />
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.58 }}
        >
          {prospects.map((prospect) => (
            <line
              key={`${prospect.x}-${prospect.y}`}
              x1="50"
              y1="50"
              x2={prospect.x + 10}
              y2={prospect.y + 5}
              stroke="rgba(167,139,250,0.55)"
              strokeWidth="0.35"
              strokeDasharray="2 2"
              strokeDashoffset={interpolate(frame, [0, 60], [12, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}
            />
          ))}
        </svg>
        {prospects.map((prospect) => (
          <div
            key={prospect.label + prospect.x}
            style={{
              position: "absolute",
              left: `${prospect.x}%`,
              top: `${prospect.y}%`,
              width: vertical ? 190 : 160,
              padding: vertical ? "18px 20px" : "14px 16px",
              borderRadius: vertical ? 22 : 18,
              border: "1px solid rgba(184,164,255,0.28)",
              backgroundColor: "rgba(12,11,20,0.9)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.34)",
              opacity: interpolate(frame, [prospect.delay, prospect.delay + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [prospect.delay, prospect.delay + 14],
                ["0px 18px", "0px 0px"],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              ),
            }}
          >
            <div
              style={{
                width: vertical ? 42 : 34,
                height: vertical ? 42 : 34,
                borderRadius: 12,
                marginBottom: vertical ? 16 : 12,
                background: "linear-gradient(145deg, #C4B5FD, #7C3AED)",
              }}
            />
            <div
              style={{
                color: "#C4B5FD",
                fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
                fontSize: vertical ? 17 : 14,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              {prospect.label}
            </div>
          </div>
        ))}
        <div style={{ position: "absolute", left: 28, bottom: 28 }}>
          <StatusPill>LEAD HUNT</StatusPill>
        </div>
      </div>
    </OutboundBackdrop>
  );
};
