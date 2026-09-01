import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Eyebrow } from "../components/Brand";
import { VioletSignalRings } from "../components/FilmBackground";

export const HandsFullScene: React.FC<{ bumper?: boolean }> = ({ bumper = false }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const isVertical = height > width;
  const scaleFactor = width / 1920;

  const imageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    scale: interpolate(frame, [0, 78], [1.035, 1.09], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    }),
  };

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#08080D" }}>
      {isVertical ? (
        <>
          <div style={{ position: "absolute", inset: "0 0 50% 0", overflow: "hidden" }}>
            <Img
              src={staticFile("brand/hands-full-opening-original.png")}
              style={{ ...imageStyle, objectPosition: "23% center" }}
            />
          </div>
          <div style={{ position: "absolute", inset: "50% 0 0 0", overflow: "hidden" }}>
            <Img
              src={staticFile("brand/hands-full-opening-original.png")}
              style={{ ...imageStyle, objectPosition: "77% center" }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              height: 7,
              background:
                "linear-gradient(90deg, transparent, #8B5CF6 20%, #C4B5FD 50%, #8B5CF6 80%, transparent)",
              boxShadow: "0 0 46px rgba(139,92,246,0.86)",
            }}
          />
        </>
      ) : (
        <Img
          src={staticFile("brand/hands-full-opening-original.png")}
          style={{ ...imageStyle, objectPosition: "center center" }}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: isVertical
            ? "linear-gradient(180deg, rgba(5,5,9,0.62) 0%, rgba(5,5,9,0.02) 28%, rgba(5,5,9,0.1) 62%, rgba(5,5,9,0.72) 100%)"
            : "linear-gradient(90deg, rgba(5,5,9,0.82) 0%, rgba(5,5,9,0.2) 52%, rgba(5,5,9,0.08) 100%), linear-gradient(0deg, rgba(5,5,9,0.52) 0%, transparent 46%)",
        }}
      />

      <VioletSignalRings
        centerX={isVertical ? "57%" : "77.5%"}
        centerY={isVertical ? "73%" : "46%"}
        size={isVertical ? width * 0.24 : width * 0.1}
      />

      <Img
        src={staticFile("brand/botbound-operator-primary.png")}
        style={{
          position: "absolute",
          right: isVertical ? width * 0.08 : width * 0.105,
          bottom: isVertical ? height * 0.105 : height * 0.04,
          width: isVertical ? width * 0.38 : width * 0.24,
          height: "auto",
          opacity: interpolate(frame, [12, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transform: `translateY(${interpolate(frame, [12, 34], [42, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}px)`,
          filter: "drop-shadow(0 24px 44px rgba(5, 5, 9, 0.52))",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: isVertical ? width * 0.09 : width * 0.072,
          right: isVertical ? width * 0.09 : width * 0.48,
          top: isVertical ? height * 0.068 : height * 0.14,
        }}
      >
        <div
          style={{
            opacity: interpolate(frame, [0, 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [0, 16], ["0px 28px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <Eyebrow fontSize={isVertical ? 48 : 28 * scaleFactor}>Incoming call · Ring one</Eyebrow>
        </div>
        <Interactive.Div
          name="Hands full headline"
          style={{
            marginTop: isVertical ? 38 : 34 * scaleFactor,
            maxWidth: isVertical ? width * 0.78 : width * 0.52,
            color: "#F8F7FC",
            fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
            fontSize: isVertical ? 154 : 112 * scaleFactor,
            fontWeight: 800,
            letterSpacing: "-0.055em",
            lineHeight: 0.91,
            opacity: interpolate(frame, [7, 25], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [7, 28], ["0px 58px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            textShadow: "0 4px 50px rgba(0,0,0,0.54)",
          }}
        >
          {bumper ? "Still busy?" : "Your hands are full."}
        </Interactive.Div>
      </div>

      {!bumper ? (
        <Interactive.Div
          name="Phone still rings line"
          style={{
            position: "absolute",
            left: isVertical ? width * 0.09 : width * 0.074,
            bottom: isVertical ? height * 0.066 : height * 0.11,
            color: "#FFFFFF",
            fontFamily: "BotBound Inter, Inter, sans-serif",
            fontSize: isVertical ? 58 : 38 * scaleFactor,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            opacity: interpolate(frame, [28, 48], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          The phone still rings.
        </Interactive.Div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 12 * Math.max(1, scaleFactor),
          background: "#8B5CF6",
          scale: `${interpolate(frame, [0, 66], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })} 1`,
          transformOrigin: "left center",
        }}
      />
    </AbsoluteFill>
  );
};
