import {
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Eyebrow } from "../components/Brand";
import { FilmBackground } from "../components/FilmBackground";
import { Waveform } from "../components/Waveform";

const TranscriptLine: React.FC<{
  label: string;
  children: React.ReactNode;
  at: number;
  frame: number;
  scaleFactor: number;
  align?: "left" | "right";
}> = ({ label, children, at, frame, scaleFactor, align = "left" }) => {
  return (
    <div
      style={{
        alignSelf: align === "right" ? "flex-end" : "flex-start",
        width: "84%",
        padding: `${24 * scaleFactor}px ${30 * scaleFactor}px`,
        borderRadius: 26 * scaleFactor,
        background: align === "right" ? "rgba(139,92,246,0.17)" : "rgba(255,255,255,0.055)",
        border:
          align === "right"
            ? "1px solid rgba(167,139,250,0.28)"
            : "1px solid rgba(255,255,255,0.09)",
        opacity: interpolate(frame, [at, at + 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [at, at + 16], ["0px 34px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div
        style={{
          color: align === "right" ? "#B9A4FF" : "#A8A9B4",
          fontFamily: "BotBound Plex Mono, monospace",
          fontSize: 14 * scaleFactor,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 10 * scaleFactor,
          color: "#F8F7FC",
          fontFamily: "BotBound Inter, Inter, sans-serif",
          fontSize: 27 * scaleFactor,
          fontWeight: 600,
          lineHeight: 1.27,
          letterSpacing: "-0.02em",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const ConversationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scaleFactor = width / 1920;

  return (
    <FilmBackground variant="violet">
      <div
        style={{
          position: "absolute",
          left: width * 0.065,
          top: height * 0.105,
          width: width * 0.42,
        }}
      >
        <div
          style={{
            opacity: interpolate(frame, [0, 13], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Eyebrow fontSize={27 * scaleFactor}>
            Configured example · Visualized conversation
          </Eyebrow>
        </div>
        <Interactive.Div
          name="Conversation headline"
          style={{
            marginTop: 34 * scaleFactor,
            color: "#F8F7FC",
            fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
            fontSize: 106 * scaleFactor,
            fontWeight: 800,
            letterSpacing: "-0.06em",
            lineHeight: 0.9,
            opacity: interpolate(frame, [6, 25], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [6, 25], ["0px 60px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          Not a voicemail maze.
        </Interactive.Div>
        <Interactive.Div
          name="Conversation support"
          style={{
            marginTop: 42 * scaleFactor,
            width: width * 0.37,
            color: "#D8D6E2",
            fontFamily: "BotBound Inter, Inter, sans-serif",
            fontSize: 36 * scaleFactor,
            fontWeight: 400,
            letterSpacing: "-0.022em",
            lineHeight: 1.28,
            opacity: interpolate(frame, [24, 44], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          It listens, checks what’s possible, and moves the customer forward.
        </Interactive.Div>
        <div
          style={{
            marginTop: 60 * scaleFactor,
            display: "flex",
            alignItems: "center",
            gap: 26 * scaleFactor,
            opacity: interpolate(frame, [38, 58], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Img
            src={staticFile("brand/botbound-app-icon.png")}
            style={{
              width: 72 * scaleFactor,
              height: 72 * scaleFactor,
              borderRadius: 19 * scaleFactor,
            }}
          />
          <Waveform width={310 * scaleFactor} height={74 * scaleFactor} bars={24} />
          <div
            style={{
              color: "#B9A4FF",
              fontFamily: "BotBound Plex Mono, monospace",
              fontSize: 16 * scaleFactor,
              fontWeight: 700,
              letterSpacing: "0.1em",
            }}
          >
            LIVE
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: width * 0.065,
          top: height * 0.095,
          width: width * 0.43,
          height: height * 0.81,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 22 * scaleFactor,
          padding: `${46 * scaleFactor}px`,
          borderRadius: 42 * scaleFactor,
          border: "1px solid rgba(196,181,253,0.24)",
          background: "linear-gradient(155deg, rgba(14,13,24,0.97), rgba(22,13,45,0.96))",
          boxShadow: "0 60px 180px rgba(0,0,0,0.48), 0 0 120px rgba(139,92,246,0.14)",
        }}
      >
        <TranscriptLine label="Caller" at={10} frame={frame} scaleFactor={scaleFactor}>
          “Can you fit in a cake pickup Friday?”
        </TranscriptLine>
        <TranscriptLine
          label="BotBound"
          at={45}
          frame={frame}
          scaleFactor={scaleFactor}
          align="right"
        >
          “Absolutely. I can hold 4:30. Does that work?”
        </TranscriptLine>
        <TranscriptLine label="Caller" at={84} frame={frame} scaleFactor={scaleFactor}>
          “Perfect.”
        </TranscriptLine>
        <TranscriptLine
          label="BotBound"
          at={112}
          frame={frame}
          scaleFactor={scaleFactor}
          align="right"
        >
          “You’re booked. I just texted the details.”
        </TranscriptLine>
      </div>
    </FilmBackground>
  );
};
