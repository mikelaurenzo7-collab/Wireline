import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { OutboundBackdrop } from "../OutboundBackdrop";
import { OutboundChrome, SceneHeadline, StatusPill } from "../OutboundChrome";

const weekdays = ["M", "T", "W", "T", "F"];

export const BookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const vertical = height / width > 1.3;
  const cardWidth = vertical ? 870 : 800;

  return (
    <OutboundBackdrop>
      <OutboundChrome section="NEXT STEP / CONFIRMED" />
      <div
        style={{
          position: "absolute",
          top: vertical ? 270 : 170,
          left: vertical ? 84 : 72,
          right: vertical ? 84 : 72,
        }}
      >
        <SceneHeadline maxWidth={vertical ? 930 : 880}>BOOKS THE NEXT STEP.</SceneHeadline>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: vertical ? 750 : 370,
          width: cardWidth,
          marginLeft: -cardWidth / 2,
          borderRadius: vertical ? 50 : 40,
          overflow: "hidden",
          border: "1px solid rgba(184,164,255,0.3)",
          background:
            "linear-gradient(145deg, rgba(28,20,48,0.96) 0%, rgba(13,12,21,0.96) 62%, rgba(8,8,13,0.98) 100%)",
          boxShadow: "0 38px 120px rgba(0,0,0,0.52), 0 0 72px rgba(139,92,246,0.12)",
          opacity: interpolate(frame, [3, 16], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [1, 18], ["0px 44px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            padding: vertical ? "48px 48px 36px" : "36px 38px 28px",
            borderBottom: "1px solid rgba(184,164,255,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <StatusPill tone="mint">BOOKED</StatusPill>
          <div
            style={{
              color: "#8F8B9C",
              fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
              fontSize: vertical ? 20 : 17,
              letterSpacing: "0.1em",
            }}
          >
            NEXT STEP
          </div>
        </div>
        <div style={{ padding: vertical ? 48 : 36 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
            {weekdays.map((day, index) => {
              const active = index === 2;
              return (
                <div
                  key={`${day}-${index}`}
                  style={{
                    height: vertical ? 190 : 142,
                    borderRadius: vertical ? 26 : 20,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 20,
                    border: active
                      ? "1px solid rgba(167,139,250,0.88)"
                      : "1px solid rgba(184,164,255,0.16)",
                    background: active
                      ? "linear-gradient(180deg, rgba(139,92,246,0.34), rgba(80,46,150,0.18))"
                      : "rgba(255,255,255,0.025)",
                    boxShadow: active ? "0 0 48px rgba(139,92,246,0.22)" : undefined,
                    scale: active
                      ? interpolate(frame, [15, 27], [0.82, 1], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        })
                      : 1,
                  }}
                >
                  <div
                    style={{
                      color: active ? "#F8F7FC" : "#777381",
                      fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
                      fontSize: vertical ? 22 : 18,
                      fontWeight: 700,
                    }}
                  >
                    {day}
                  </div>
                  {active ? (
                    <div
                      style={{
                        width: vertical ? 70 : 54,
                        height: vertical ? 70 : 54,
                        borderRadius: "50%",
                        backgroundColor: "#8B5CF6",
                        color: "#FFFFFF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "BotBound Inter, Inter, sans-serif",
                        fontSize: vertical ? 39 : 31,
                        fontWeight: 800,
                        boxShadow: "0 0 34px rgba(139,92,246,0.56)",
                      }}
                    >
                      ✓
                    </div>
                  ) : (
                    <div
                      style={{
                        width: vertical ? 42 : 34,
                        height: 3,
                        borderRadius: 999,
                        backgroundColor: "rgba(196,181,253,0.16)",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: vertical ? 28 : 22,
              padding: vertical ? "30px 32px" : "23px 26px",
              borderRadius: vertical ? 25 : 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "1px solid rgba(94,234,212,0.2)",
              backgroundColor: "rgba(20,83,77,0.14)",
            }}
          >
            <div
              style={{
                color: "#D1FAE5",
                fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
                fontSize: vertical ? 36 : 30,
                fontWeight: 760,
                letterSpacing: "-0.035em",
              }}
            >
              Meeting confirmed
            </div>
            <div
              style={{
                color: "#5EEAD4",
                fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
                fontSize: vertical ? 20 : 17,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              ADDED ✓
            </div>
          </div>
        </div>
      </div>
    </OutboundBackdrop>
  );
};
