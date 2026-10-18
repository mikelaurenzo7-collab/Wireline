import { Audio, Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { BrandWordmark, Eyebrow } from "../components/Brand";

export type CallDirection = "inbound" | "outbound";
export type CallFormat = "horizontal" | "vertical" | "square";

export type CinematicCallCampaignProps = {
  direction: CallDirection;
  format: CallFormat;
};

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const directionCopy = {
  inbound: {
    chapter: "THE SECOND RING",
    signal: "INBOUND / ANSWERED",
    promise: "CATCH THE\nNEXT CALL.",
    proof: "Answers. Qualifies. Books.",
    video: "campaign-call/inbound-second-ring.mp4",
    voice: "campaign-call/inbound-voice.wav",
  },
  outbound: {
    chapter: "THE FIRST MOVE",
    signal: "OUTBOUND / CONNECTED",
    promise: "MAKE THE\nFIRST MOVE.",
    proof: "Calls. Qualifies. Books.",
    video: "campaign-call/outbound-first-move.mp4",
    voice: "campaign-call/outbound-voice.mp3",
  },
} satisfies Record<CallDirection, Record<string, string>>;

const waveform = [0.26, 0.48, 0.82, 0.38, 0.96, 0.58, 0.3, 0.7, 1, 0.44, 0.76, 0.34];

const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.045 }) => {
  const frame = useCurrentFrame();
  const x = (frame * 19) % 83;
  const y = (frame * 31) % 71;

  return (
    <AbsoluteFill
      aria-hidden
      style={{
        pointerEvents: "none",
        opacity,
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E\")",
        backgroundPosition: `${x}px ${y}px`,
        mixBlendMode: "soft-light",
      }}
    />
  );
};

const SignalLine: React.FC<{
  frame: number;
  vertical: boolean;
  fade?: number;
}> = ({ frame, vertical, fade = 1 }) => {
  const sweep = interpolate(frame % 84, [0, 83], [-8, 108], clamp);
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: vertical ? 62 : 72,
        right: vertical ? 62 : 72,
        top: vertical ? 312 : 74,
        height: 1,
        background:
          "linear-gradient(90deg, rgba(196,181,253,0), rgba(196,181,253,.36) 18%, rgba(248,247,252,.18) 74%, rgba(196,181,253,0))",
        opacity: fade,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${sweep}%`,
          top: -1,
          width: vertical ? 84 : 110,
          height: 3,
          borderRadius: 99,
          background: "linear-gradient(90deg, transparent, #F8F7FC, #8B5CF6, transparent)",
          boxShadow: "0 0 18px rgba(139,92,246,.8)",
        }}
      />
    </div>
  );
};

const LiveCallHud: React.FC<{
  direction: CallDirection;
  format: CallFormat;
}> = ({ direction, format }) => {
  const frame = useCurrentFrame();
  const vertical = format === "vertical";
  const square = format === "square";
  const copy = directionCopy[direction];
  const enter = spring({ frame: frame - 16, fps: 30, config: { damping: 18, stiffness: 120 } });
  const exit = interpolate(frame, [205, 230], [1, 0], clamp);
  const opacity = enter * exit;
  const elapsed = Math.max(0, frame - 43) / 30;
  const seconds = Math.floor(elapsed);
  const time = `00:${String(seconds).padStart(2, "0")}`;

  return (
    <>
      <SignalLine frame={frame} vertical={vertical} fade={opacity * 0.9} />
      <div
        style={{
          position: "absolute",
          left: vertical ? 96 : 74,
          right: vertical ? 144 : 74,
          top: vertical ? 244 : 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity,
          transform: `translateY(${interpolate(enter, [0, 1], [-16, 0], clamp)}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: vertical ? 14 : 12,
            color: "#F8F7FC",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: vertical ? 21 : 16,
            fontWeight: 700,
            letterSpacing: ".13em",
          }}
        >
          <span
            style={{
              width: vertical ? 12 : 10,
              height: vertical ? 12 : 10,
              borderRadius: "50%",
              background: "#8B5CF6",
              boxShadow: "0 0 18px rgba(139,92,246,.95)",
            }}
          />
          BOTBOUND / SCENARIO
        </div>
        <div
          style={{
            color: "rgba(248,247,252,.72)",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: vertical ? 19 : 15,
            letterSpacing: ".12em",
          }}
        >
          {time}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: vertical ? 96 : 74,
          right: vertical ? 144 : undefined,
          bottom: vertical ? 356 : square ? 76 : 54,
          width: vertical ? "auto" : 490,
          padding: vertical ? "24px 28px" : "18px 22px",
          display: "flex",
          alignItems: "center",
          gap: vertical ? 24 : 18,
          border: "1px solid rgba(248,247,252,.18)",
          borderRadius: vertical ? 24 : 18,
          background: "linear-gradient(120deg, rgba(7,7,12,.78), rgba(16,11,28,.58))",
          boxShadow: "0 24px 70px rgba(0,0,0,.35), inset 0 1px rgba(255,255,255,.08)",
          backdropFilter: "blur(18px)",
          opacity,
          transform: `translateY(${interpolate(enter, [0, 1], [28, 0], clamp)}px)`,
        }}
      >
        <div
          style={{
            position: "relative",
            width: vertical ? 78 : 58,
            height: vertical ? 78 : 58,
            flex: "0 0 auto",
            borderRadius: vertical ? 20 : 15,
            background: "linear-gradient(145deg, #9F7AEA, #6D3ED1)",
            boxShadow: "0 10px 26px rgba(139,92,246,.34)",
            overflow: "hidden",
          }}
        >
          <Img
            src={staticFile("brand/botbound-operator-primary.png")}
            style={{ width: "100%", height: "100%", objectFit: "contain", padding: "8%" }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: "#F8F7FC",
              fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
              fontSize: vertical ? 28 : 22,
              fontWeight: 750,
              letterSpacing: "-.025em",
            }}
          >
            {copy.signal}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: vertical ? 8 : 6,
              height: vertical ? 34 : 28,
              marginTop: vertical ? 9 : 5,
            }}
          >
            {waveform.map((height, index) => {
              const pulse = 0.64 + 0.36 * Math.sin((frame + index * 4.6) * 0.27);
              return (
                <div
                  key={index}
                  style={{
                    width: vertical ? 5 : 4,
                    height: `${Math.max(18, height * pulse * 100)}%`,
                    borderRadius: 9,
                    background: index < 8 ? "#C4B5FD" : "rgba(248,247,252,.38)",
                    boxShadow: index === 4 ? "0 0 10px rgba(196,181,253,.7)" : undefined,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

const SourceFilm: React.FC<CinematicCallCampaignProps> = ({ direction, format }) => {
  const frame = useCurrentFrame();
  const vertical = format === "vertical";
  const square = format === "square";
  const copy = directionCopy[direction];
  const fadeOut = interpolate(frame, [220, 241], [1, 0], clamp);
  const scale = interpolate(frame, [0, 240], vertical ? [1.045, 1.105] : [1.015, 1.055], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const position = direction === "inbound" ? "50% 52%" : "50% 50%";

  return (
    <AbsoluteFill style={{ backgroundColor: "#050508", opacity: fadeOut }}>
      <Video
        src={staticFile(copy.video)}
        muted
        objectFit="cover"
        style={{
          width: "100%",
          height: "100%",
          objectPosition: position,
          transform: `scale(${scale})`,
          filter:
            direction === "inbound"
              ? "contrast(1.06) saturate(.91) brightness(.86)"
              : "contrast(1.08) saturate(.9) brightness(.84)",
        }}
      />
      <AbsoluteFill
        style={{
          background: vertical
            ? "linear-gradient(180deg, rgba(5,5,8,.62) 0%, rgba(5,5,8,.04) 26%, rgba(5,5,8,.08) 62%, rgba(5,5,8,.76) 100%)"
            : "linear-gradient(180deg, rgba(5,5,8,.44) 0%, rgba(5,5,8,.03) 30%, rgba(5,5,8,.06) 66%, rgba(5,5,8,.62) 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 44%, transparent 34%, rgba(5,5,8,.2) 72%, rgba(5,5,8,.55) 110%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: vertical ? 34 : square ? 28 : 24,
          border: "1px solid rgba(248,247,252,.14)",
          borderRadius: vertical ? 34 : 26,
          boxShadow: "inset 0 0 80px rgba(5,5,8,.16)",
        }}
      />
      <LiveCallHud direction={direction} format={format} />
      <FilmGrain />
    </AbsoluteFill>
  );
};

const OperatorOnTheLine: React.FC<{ vertical: boolean; compact: boolean }> = ({
  vertical,
  compact,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({
    frame: frame - 5,
    fps,
    config: { damping: 14, stiffness: 96, mass: 0.8 },
  });
  const float = Math.sin(frame * 0.075) * (vertical ? 5 : 3);
  const size = vertical ? 292 : compact ? 198 : 236;

  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width: size,
        height: size,
        opacity: reveal,
        transform: `translateY(${interpolate(reveal, [0, 1], [40, float], clamp)}px) scale(${interpolate(
          reveal,
          [0, 1],
          [0.82, 1],
          clamp,
        )})`,
      }}
    >
      {[0, 1, 2].map((ring) => {
        const ringFrame = (frame + ring * 22) % 66;
        const ringScale = interpolate(ringFrame, [0, 65], [0.68, 1.52], clamp);
        const ringOpacity = interpolate(ringFrame, [0, 12, 65], [0, 0.42, 0], clamp);
        return (
          <div
            key={ring}
            style={{
              position: "absolute",
              inset: size * 0.08,
              border: `${vertical ? 3 : 2}px solid rgba(196,181,253,.8)`,
              borderRadius: "50%",
              opacity: ringOpacity,
              transform: `scale(${ringScale})`,
              boxShadow: "0 0 26px rgba(139,92,246,.24)",
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          inset: size * 0.1,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139,92,246,.31), rgba(139,92,246,.04) 58%, transparent 72%)",
          filter: `blur(${vertical ? 10 : 8}px)`,
        }}
      />
      <Img
        src={staticFile("brand/botbound-operator-primary.png")}
        style={{
          position: "absolute",
          inset: size * 0.08,
          width: size * 0.84,
          height: size * 0.84,
          objectFit: "contain",
          filter: "drop-shadow(0 18px 28px rgba(0,0,0,.44))",
          transform: `rotate(${Math.sin(frame * 0.075) * 1.2}deg)`,
        }}
      />
    </div>
  );
};

const EndCard: React.FC<CinematicCallCampaignProps> = ({ direction, format }) => {
  const frame = useCurrentFrame();
  const vertical = format === "vertical";
  const square = format === "square";
  const copy = directionCopy[direction];
  const content = spring({ frame: frame - 8, fps: 30, config: { damping: 19, stiffness: 105 } });
  const cardFade = interpolate(frame, [0, 20], [0, 1], clamp);
  const titleLines = copy.promise.split("\n");

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        opacity: cardFade,
        background:
          "radial-gradient(circle at 56% 38%, #28134A 0%, #120B21 31%, #08070C 66%, #050508 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: vertical ? 1120 : 1040,
          height: vertical ? 1120 : 1040,
          left: vertical ? -360 : "54%",
          top: vertical ? -240 : "48%",
          marginLeft: vertical ? 0 : -520,
          marginTop: vertical ? 0 : -520,
          borderRadius: "50%",
          background:
            "conic-gradient(from 220deg, rgba(139,92,246,.23), transparent 26%, rgba(196,181,253,.1), transparent 68%)",
          filter: "blur(24px)",
          transform: `rotate(${frame * 0.11}deg) scale(${interpolate(content, [0, 1], [0.8, 1], clamp)})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: vertical ? 34 : square ? 28 : 24,
          border: "1px solid rgba(248,247,252,.13)",
          borderRadius: vertical ? 34 : 26,
        }}
      />
      <SignalLine frame={frame + 25} vertical={vertical} fade={0.82} />

      <div
        style={{
          position: "absolute",
          left: vertical ? 96 : 84,
          top: vertical ? 252 : 114,
          right: vertical ? 144 : 84,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: content,
        }}
      >
        <Eyebrow fontSize={vertical ? 22 : 16}>{copy.chapter}</Eyebrow>
        <div
          style={{
            color: "rgba(248,247,252,.52)",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: vertical ? 18 : 14,
            letterSpacing: ".14em",
          }}
        >
          SCENARIO
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: vertical ? 96 : 84,
          right: vertical ? 144 : 84,
          top: vertical ? 414 : 210,
          bottom: vertical ? 480 : 124,
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          alignItems: vertical ? "flex-start" : "center",
          justifyContent: vertical ? "space-between" : "space-between",
          gap: vertical ? 28 : 76,
        }}
      >
        <div style={{ flex: vertical ? undefined : 1, maxWidth: vertical ? "100%" : 1020 }}>
          <div
            style={{
              color: "#F8F7FC",
              fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
              fontSize: vertical ? 112 : square ? 82 : 105,
              fontWeight: 820,
              letterSpacing: "-.064em",
              lineHeight: 0.86,
              opacity: content,
              transform: `translateY(${interpolate(content, [0, 1], [34, 0], clamp)}px)`,
            }}
          >
            {titleLines.map((line, index) => (
              <div key={line} style={{ color: index === 1 ? "#A78BFA" : "#F8F7FC" }}>
                {line}
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: vertical ? 34 : 28,
              color: "rgba(248,247,252,.68)",
              fontFamily: "BotBound Inter, Inter, sans-serif",
              fontSize: vertical ? 30 : 23,
              fontWeight: 500,
              letterSpacing: "-.018em",
              opacity: interpolate(frame, [18, 33], [0, 1], clamp),
            }}
          >
            {copy.proof}
          </div>
        </div>

        <div
          style={{
            alignSelf: vertical ? "center" : "center",
            marginRight: vertical ? 0 : 38,
            marginBottom: vertical ? 18 : 0,
          }}
        >
          <OperatorOnTheLine vertical={vertical} compact={square} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: vertical ? 96 : 84,
          right: vertical ? 144 : 84,
          bottom: vertical ? 356 : 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: interpolate(frame, [26, 42], [0, 1], clamp),
        }}
      >
        <BrandWordmark fontSize={vertical ? 54 : 42} />
        <div
          style={{
            color: "#F8F7FC",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: vertical ? 20 : 15,
            fontWeight: 600,
            letterSpacing: ".16em",
          }}
        >
          BOTBOUND.ME
        </div>
      </div>
      <FilmGrain opacity={0.065} />
    </AbsoluteFill>
  );
};

const CampaignSoundtrack: React.FC<{ direction: CallDirection }> = ({ direction }) => {
  const durationInFrames = 360;
  const voiceFrom = direction === "inbound" ? 8 : 16;
  return (
    <>
      <Audio
        src={staticFile("audio/botbound-score.mp3")}
        volume={(frame) =>
          interpolate(
            frame,
            [0, 6, voiceFrom + 4, 220, 250, durationInFrames - 1],
            [0, 0.14, 0.09, 0.11, 0.24, 0],
            clamp,
          )
        }
      />
      {direction === "inbound" ? (
        <Sequence from={0} durationInFrames={64} layout="none">
          <Audio
            src={staticFile("audio/phone-ring.wav")}
            volume={(frame) => interpolate(frame, [0, 7, 42, 63], [0, 0.2, 0.13, 0], clamp)}
          />
        </Sequence>
      ) : null}
      <Sequence from={voiceFrom} layout="none">
        <Audio src={staticFile(directionCopy[direction].voice)} volume={1} />
      </Sequence>
      <Sequence from={236} durationInFrames={52} layout="none">
        <Audio
          src={staticFile("audio/transfer-chime-approved.wav")}
          volume={(frame) => interpolate(frame, [0, 5, 30, 51], [0, 0.48, 0.4, 0], clamp)}
        />
      </Sequence>
    </>
  );
};

export const CinematicCallCampaign: React.FC<CinematicCallCampaignProps> = (props) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#050508" }}>
      <CampaignSoundtrack direction={props.direction} />
      <Sequence from={0} durationInFrames={242} premountFor={30}>
        <SourceFilm {...props} />
      </Sequence>
      <Sequence from={221} durationInFrames={139} premountFor={30}>
        <EndCard {...props} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const CinematicCallDoubleFeature: React.FC<{ format: "horizontal" | "vertical" }> = ({
  format,
}) => {
  const firstDuration = 360;
  return (
    <AbsoluteFill style={{ backgroundColor: "#050508" }}>
      <Sequence from={0} durationInFrames={firstDuration} premountFor={30}>
        <CinematicCallCampaign direction="inbound" format={format} />
      </Sequence>
      <Sequence from={firstDuration} durationInFrames={firstDuration} premountFor={30}>
        <CinematicCallCampaign direction="outbound" format={format} />
      </Sequence>
    </AbsoluteFill>
  );
};
