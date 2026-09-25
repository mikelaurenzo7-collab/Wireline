import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BrandLockup, Eyebrow } from "../../components/Brand";
import { OutboundBackdrop } from "../OutboundBackdrop";
import { OUTBOUND_VERTICAL_SAFE_ZONE } from "../OutboundChrome";

export const OutboundEndCard: React.FC<{ fast?: boolean }> = ({ fast = false }) => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const vertical = height / width > 1.3;

  return (
    <OutboundBackdrop>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 42%, rgba(139,92,246,0.3) 0%, rgba(92,50,177,0.12) 34%, rgba(6,6,10,0) 68%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: vertical
            ? `${OUTBOUND_VERTICAL_SAFE_ZONE.top}px ${OUTBOUND_VERTICAL_SAFE_ZONE.right}px ${OUTBOUND_VERTICAL_SAFE_ZONE.bottom}px ${OUTBOUND_VERTICAL_SAFE_ZONE.left}px`
            : "72px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            opacity: interpolate(frame, [0, fast ? 8 : 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [0, fast ? 10 : 16], ["0px -24px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <BrandLockup
            markSize={vertical ? 126 : 102}
            wordmarkSize={vertical ? 108 : 88}
            centered
          />
        </div>
        <div style={{ marginTop: vertical ? 84 : 54 }}>
          <Eyebrow fontSize={vertical ? 24 : 20}>THE FIRST MOVE</Eyebrow>
        </div>
        <div
          style={{
            marginTop: vertical ? 28 : 22,
            color: "#FFFFFF",
            fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
            fontSize: vertical ? 118 : 104,
            fontWeight: 800,
            letterSpacing: 0,
            lineHeight: 0.91,
            opacity: interpolate(frame, [fast ? 2 : 7, fast ? 10 : 22], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: interpolate(frame, [fast ? 2 : 5, fast ? 12 : 24], [0.9, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          FIND. CALL. BOOK.
        </div>
        <div
          style={{
            marginTop: vertical ? 72 : 48,
            minWidth: vertical ? 700 : 610,
            borderRadius: 999,
            padding: vertical ? "30px 54px" : "26px 48px",
            background: "linear-gradient(110deg, #8B5CF6, #6D3DEB)",
            color: "#FFFFFF",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: vertical ? 34 : 29,
            fontWeight: 700,
            letterSpacing: "0.075em",
            lineHeight: 1,
            boxShadow: "0 24px 72px rgba(109,61,235,0.4), inset 0 1px 0 rgba(255,255,255,0.26)",
            opacity: interpolate(frame, [fast ? 6 : 16, fast ? 16 : 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(
              frame,
              [fast ? 4 : 14, fast ? 14 : 32],
              ["0px 26px", "0px 0px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            ),
          }}
        >
          GET YOUR SALES BOT
        </div>
        <div
          style={{
            marginTop: vertical ? 40 : 30,
            color: "#C8C5D2",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: vertical ? 25 : 21,
            fontWeight: 700,
            letterSpacing: "0.15em",
            opacity: interpolate(frame, [fast ? 12 : 24, fast ? 22 : 38], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          BOTBOUND.APP
        </div>
      </div>
    </OutboundBackdrop>
  );
};
