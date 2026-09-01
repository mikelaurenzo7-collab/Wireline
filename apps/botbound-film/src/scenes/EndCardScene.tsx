import {
  Easing,
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BotMark, BrandLockup, BrandWordmark } from "../components/Brand";
import { FilmBackground, VioletSignalRings } from "../components/FilmBackground";

export const EndCardScene: React.FC<{ bumper?: boolean }> = ({ bumper = false }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVertical = height > width;
  const scaleFactor = width / 1920;

  return (
    <FilmBackground variant="obsidian">
      <VioletSignalRings
        centerX={isVertical ? "50%" : "50%"}
        centerY={isVertical ? "36%" : "43%"}
        size={isVertical ? width * 0.38 : width * 0.16}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: isVertical ? 0 : height * 0.01,
        }}
      >
        {isVertical ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 58,
              opacity: interpolate(frame, [0, 20], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: spring({ frame, fps, config: { damping: 18, stiffness: 105, mass: 0.8 } }),
            }}
          >
            <BotMark size={width * 0.64} />
            <BrandWordmark fontSize={198} justify="center" />
          </div>
        ) : (
          <div
            style={{
              opacity: interpolate(frame, [0, 20], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: spring({ frame, fps, config: { damping: 18, stiffness: 105, mass: 0.8 } }),
            }}
          >
            <BrandLockup markSize={330 * scaleFactor} wordmarkSize={190 * scaleFactor} centered />
          </div>
        )}

        <Interactive.Div
          name="End card promise"
          style={{
            marginTop: isVertical ? 110 : 54 * scaleFactor,
            maxWidth: isVertical ? width * 0.78 : width * 0.7,
            color: "#F8F7FC",
            fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
            fontSize: isVertical ? 94 : (bumper ? 58 : 54) * scaleFactor,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            lineHeight: 1,
            textAlign: "center",
            opacity: interpolate(frame, [18, 38], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [18, 40], ["0px 44px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {bumper ? "The call still gets answered." : "You can't answer every call. Your Bot can."}
        </Interactive.Div>

        <Interactive.Div
          name="End card URL"
          style={{
            marginTop: isVertical ? 70 : 46 * scaleFactor,
            padding: isVertical ? "24px 42px" : `${14 * scaleFactor}px ${28 * scaleFactor}px`,
            borderRadius: 999,
            color: "#B9A4FF",
            border: "1px solid rgba(196,181,253,0.28)",
            background: "rgba(139,92,246,0.08)",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: isVertical ? 48 : 25 * scaleFactor,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "lowercase",
            opacity: interpolate(frame, [34, 54], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          botbound.me
        </Interactive.Div>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: isVertical ? height * 0.035 : height * 0.045,
          width: isVertical ? width * 0.62 : width * 0.36,
          height: isVertical ? 6 : 5 * scaleFactor,
          translate: "-50% 0px",
          borderRadius: 999,
          background:
            "linear-gradient(90deg, transparent, #8B5CF6 20%, #C4B5FD 50%, #8B5CF6 80%, transparent)",
          boxShadow: "0 0 40px rgba(139,92,246,0.74)",
          opacity: interpolate(frame, [46, 65], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: `${interpolate(frame, [46, 70], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })} 1`,
        }}
      />
    </FilmBackground>
  );
};
