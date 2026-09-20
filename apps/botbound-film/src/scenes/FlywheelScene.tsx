import {
  Easing,
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BotMark } from "../components/Brand";
import { FilmBackground } from "../components/FilmBackground";

export const FlywheelScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const scaleFactor = width / 1920;

  return (
    <FilmBackground variant="obsidian">
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 52 * scaleFactor,
          padding: "6.5%",
        }}
      >
        <div
          style={{
            opacity: interpolate(frame, [0, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: spring({
              frame: frame - 8,
              fps,
              config: { damping: 18, stiffness: 120, mass: 0.7 },
            }),
            filter: `drop-shadow(0 0 ${54 * scaleFactor}px rgba(139,92,246,0.34))`,
          }}
        >
          <BotMark size={360 * scaleFactor} />
        </div>
        <Interactive.Div
          name="Bot Promise Headline"
          style={{
            color: "#F8F7FC",
            fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
            fontSize: 108 * scaleFactor,
            fontWeight: 800,
            letterSpacing: "-0.058em",
            lineHeight: 1,
            textAlign: "center",
            opacity: interpolate(frame, [6, 24], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [6, 24], ["0px 54px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Your Bots. Your Rules.
        </Interactive.Div>
      </div>
    </FilmBackground>
  );
};
