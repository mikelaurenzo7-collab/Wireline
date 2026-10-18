import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { BrandWordmark, Eyebrow } from "../components/Brand";

export type BotBoundLogoCallProps = {
  variant: "square" | "vertical";
};

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const blinkAt = (frame: number, center: number) =>
  interpolate(Math.abs(frame - center), [0, 1, 3], [0.06, 0.2, 1], clamp);

const voiceBars = [0.34, 0.58, 0.82, 0.44, 0.95, 0.66, 0.4, 0.76, 1, 0.58, 0.86, 0.48];

const CONNECT_FRAME = 44;
const SPEAK_FRAME = 58;
const BOOKED_FRAME = 183;

const isSpeechPhrase = (frame: number) =>
  (frame >= SPEAK_FRAME && frame < 84) ||
  (frame >= 91 && frame < 121) ||
  (frame >= 130 && frame < 158) ||
  (frame >= 166 && frame < 179);

const beatOpacity = (frame: number, timing: number[]) =>
  interpolate(frame, [timing[0], timing[1], timing[2], timing[3]], [0, 1, 1, 0], clamp);

const AtmosphericField: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "radial-gradient(circle at 52% 43%, #1A1032 0%, #0A0910 42%, #050508 78%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -120,
          opacity: 0.19,
          backgroundImage:
            "linear-gradient(rgba(196,181,253,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(196,181,253,0.10) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          backgroundPosition: interpolate(
            frame,
            [0, durationInFrames - 1],
            ["0px 0px", "72px 72px"],
            clamp,
          ),
          maskImage: "radial-gradient(circle at 50% 46%, black 0%, transparent 72%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          left: "50%",
          top: "42%",
          marginLeft: -450,
          marginTop: -450,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139,92,246,0.28) 0%, rgba(139,92,246,0.08) 45%, rgba(139,92,246,0) 72%)",
          filter: "blur(26px)",
          scale: interpolate(frame, [0, 36, durationInFrames - 1], [0.8, 1, 1.08], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(5,5,8,0.04) 0%, rgba(5,5,8,0.05) 55%, rgba(5,5,8,0.58) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const StageWords: React.FC<{ vertical: boolean }> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const words = [
    { label: "RING.", timing: [0, 7, 33, 45] },
    { label: "ANSWER.", timing: [34, 48, 88, 101] },
    { label: "LISTEN.", timing: [88, 101, 147, 160] },
    { label: "BOOK.", timing: [148, 163, 201, 216] },
  ];

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: vertical ? 292 : 164,
        height: vertical ? 260 : 190,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {words.map(({ label, timing }) => (
        <div
          key={label}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "transparent",
            WebkitTextStroke: vertical
              ? "2px rgba(196,181,253,0.18)"
              : "1.5px rgba(196,181,253,0.17)",
            fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
            fontSize: vertical ? 176 : 148,
            fontWeight: 800,
            letterSpacing: "-0.065em",
            opacity: interpolate(
              frame,
              [timing[0], timing[1], timing[2], timing[3]],
              [0, 1, 1, 0],
              clamp,
            ),
            scale: interpolate(frame, [timing[0], timing[3]], [0.94, 1.025], {
              ...clamp,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [timing[0], timing[3]], ["34px 0px", "-18px 0px"], clamp),
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
};

const SignalWire: React.FC<{ vertical: boolean }> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pulseFrame = frame % 92;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: vertical ? 96 : 76,
        right: vertical ? 96 : 76,
        top: vertical ? 268 : 142,
        height: 1,
        background:
          "linear-gradient(90deg, rgba(199,204,214,0), rgba(199,204,214,0.34) 18%, rgba(167,139,250,0.38) 68%, rgba(167,139,250,0))",
        opacity: interpolate(
          frame,
          [8, 24, durationInFrames - 22, durationInFrames - 1],
          [0, 1, 1, 0],
          clamp,
        ),
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -1,
          left: interpolate(pulseFrame, [0, 91], ["-9%", "101%"], clamp),
          width: vertical ? 92 : 72,
          height: 3,
          borderRadius: 999,
          background: "linear-gradient(90deg, transparent, #F8F7FC 46%, #A78BFA 58%, transparent)",
          boxShadow: "0 0 22px rgba(167,139,250,0.64)",
          opacity: interpolate(pulseFrame, [0, 10, 78, 91], [0, 1, 1, 0], clamp),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "68%",
          top: -4,
          width: 9,
          height: 9,
          borderRadius: "50%",
          backgroundColor: "#A78BFA",
          boxShadow: "0 0 18px rgba(167,139,250,0.8)",
          scale: interpolate(frame % 46, [0, 23, 45], [0.78, 1.22, 0.78], clamp),
        }}
      />
    </div>
  );
};

const CallRings: React.FC<{ size: number; connected: boolean }> = ({ size, connected }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        left: size * 0.175,
        top: size * 0.275,
        width: size * 0.3,
        height: size * 0.3,
        pointerEvents: "none",
      }}
    >
      {[0, 1, 2].map((ring) => {
        const local = (frame + ring * 10) % (connected ? 54 : 32);
        return (
          <div
            key={ring}
            style={{
              position: "absolute",
              inset: "29%",
              borderRadius: "50%",
              border: `${connected ? 2 : 4}px solid rgba(167,139,250,0.9)`,
              opacity:
                interpolate(
                  local,
                  [0, connected ? 10 : 6, connected ? 53 : 31],
                  [0, connected ? 0.48 : 0.9, 0],
                  clamp,
                ) *
                (connected
                  ? interpolate(frame, [CONNECT_FRAME, CONNECT_FRAME + 16], [0.62, 0], clamp)
                  : 1),
              scale: interpolate(
                local,
                [0, connected ? 53 : 31],
                [0.65, connected ? 2.4 : 2.85],
                clamp,
              ),
              boxShadow: "0 0 24px rgba(139,92,246,0.42)",
            }}
          />
        );
      })}
    </div>
  );
};

const AnimatedOperator: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();
  const connected = frame >= CONNECT_FRAME;
  const speaking = isSpeechPhrase(frame);
  const eyeWake = interpolate(frame, [CONNECT_FRAME, CONNECT_FRAME + 7], [0.08, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const leftBlink = Math.min(blinkAt(frame, 78), blinkAt(frame, 137), blinkAt(frame, 174));
  const rightBlink = Math.min(
    blinkAt(frame, 78),
    blinkAt(frame, 137),
    blinkAt(frame, 174),
    blinkAt(frame, 199),
  );
  const speechOpen = speaking
    ? 0.22 + 0.78 * Math.abs(Math.sin(frame * 0.39) * 0.62 + Math.sin(frame * 0.83) * 0.38)
    : 0;
  const ringWiggle =
    frame < CONNECT_FRAME
      ? Math.sin(frame * 1.2) * interpolate(frame, [0, CONNECT_FRAME], [2.4, 1.1], clamp)
      : Math.sin(frame * 0.3) * 0.2 + speechOpen * 0.32;
  const outcomeLift = interpolate(frame, [BOOKED_FRAME, 205], [0, -22], clamp);

  return (
    <Interactive.Div
      name="BotBound operator"
      style={{
        position: "relative",
        width: size,
        height: size,
        opacity: interpolate(frame, [0, 10], [0, 1], {
          ...clamp,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        scale: interpolate(frame, [0, 22, BOOKED_FRAME, 205], [0.84, 1, 1, 0.95], {
          ...clamp,
          easing: Easing.spring({ damping: 15, mass: 0.7, stiffness: 120 }),
          output: "perceptual-scale",
        }),
        translate: `0px ${outcomeLift + (connected ? Math.sin(frame * 0.11) * 4 + speechOpen * -1.8 : 0)}px`,
        rotate: `${connected ? Math.sin(frame * 0.072) * 0.26 : Math.sin(frame * 0.48) * 0.18}deg`,
        filter:
          "drop-shadow(0 42px 54px rgba(0,0,0,0.48)) drop-shadow(0 0 42px rgba(139,92,246,0.16))",
      }}
    >
      <CallRings size={size} connected={connected} />
      <div
        style={{
          position: "absolute",
          left: size * 0.265,
          top: size * 0.225,
          width: size * 0.57,
          height: size * 0.57,
          borderRadius: "50%",
          border: `${Math.max(1.5, size * 0.002)}px solid rgba(167,139,250,0.34)`,
          opacity: interpolate(
            frame,
            [CONNECT_FRAME - 2, CONNECT_FRAME + 2, CONNECT_FRAME + 20],
            [0, 0.78, 0],
            clamp,
          ),
          scale: interpolate(frame, [CONNECT_FRAME - 2, CONNECT_FRAME + 20], [0.72, 1.46], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          boxShadow: "0 0 34px rgba(139,92,246,0.22)",
          pointerEvents: "none",
        }}
      />
      <Img
        src={staticFile("brand/botbound-operator-primary.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: size,
          height: size,
          objectFit: "contain",
        }}
      />

      {/* The approved raster stays intact; these exact-color patches replace only facial pixels. */}
      <div
        style={{
          position: "absolute",
          left: size * 0.347,
          top: size * 0.354,
          width: size * 0.395,
          height: size * 0.198,
          borderRadius: size * 0.088,
          backgroundColor: "#08080D",
          zIndex: 3,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: size * 0.347,
          top: size * 0.354,
          width: size * 0.395,
          height: size * 0.198,
          borderRadius: size * 0.088,
          overflow: "hidden",
          zIndex: 5,
          opacity: interpolate(
            frame,
            [CONNECT_FRAME, CONNECT_FRAME + 4, CONNECT_FRAME + 26, CONNECT_FRAME + 31],
            [0, 1, 1, 0],
            clamp,
          ),
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-22%",
            bottom: "-22%",
            left: interpolate(frame, [CONNECT_FRAME, CONNECT_FRAME + 31], ["-28%", "124%"], clamp),
            width: "17%",
            rotate: "-16deg",
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.24), rgba(196,181,253,0.42), transparent)",
            filter: "blur(1px)",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: size * 0.427,
          top: size * 0.41,
          width: size * 0.055,
          height: size * 0.081,
          borderRadius: 999,
          background: "linear-gradient(180deg, #B9A4FF 0%, #7C3AED 100%)",
          boxShadow: "0 0 24px rgba(139,92,246,0.72)",
          scale: `${connected ? 1 + speechOpen * 0.035 : 1} ${connected ? Math.min(leftBlink, eyeWake) : 0.08}`,
          translate: `${connected ? Math.sin(frame * 0.088) * 1.8 : 0}px 0px`,
          zIndex: 4,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "22%",
            top: "12%",
            width: "28%",
            height: "18%",
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.74)",
            filter: "blur(0.5px)",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: size * 0.605,
          top: size * 0.41,
          width: size * 0.055,
          height: size * 0.081,
          borderRadius: 999,
          background: "linear-gradient(180deg, #B9A4FF 0%, #7C3AED 100%)",
          boxShadow: "0 0 24px rgba(139,92,246,0.72)",
          scale: `${connected ? 1 + speechOpen * 0.035 : 1} ${connected ? Math.min(rightBlink, eyeWake) : 0.08}`,
          translate: `${connected ? Math.sin(frame * 0.088) * 1.8 : 0}px 0px`,
          zIndex: 4,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "22%",
            top: "12%",
            width: "28%",
            height: "18%",
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.74)",
            filter: "blur(0.5px)",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: size * 0.405,
          top: size * 0.545,
          width: size * 0.265,
          height: size * 0.15,
          borderRadius: "50%",
          backgroundColor: "#F6F5F8",
          zIndex: 3,
        }}
      />
      <svg
        viewBox="0 0 160 90"
        style={{
          position: "absolute",
          left: size * 0.438,
          top: size * 0.585,
          width: size * 0.195,
          height: size * 0.09,
          overflow: "visible",
          zIndex: 4,
        }}
      >
        {speaking ? (
          <>
            <ellipse
              cx="80"
              cy="45"
              rx={28 + speechOpen * 10}
              ry={7 + speechOpen * 22}
              fill="#08080D"
              stroke="#08080D"
              strokeWidth="9"
            />
            <ellipse
              cx="80"
              cy={51 + speechOpen * 4}
              rx={15 + speechOpen * 5}
              ry={2 + speechOpen * 4}
              fill="#6D3DEB"
              opacity={0.2 + speechOpen * 0.4}
            />
          </>
        ) : (
          <path
            d="M 36 28 Q 80 78 124 28"
            fill="none"
            stroke="#08080D"
            strokeLinecap="round"
            strokeWidth="13"
          />
        )}
      </svg>

      {/* A restrained phone-hand layer gives the receiver a tactile response without redrawing the mark. */}
      <Img
        src={staticFile("brand/botbound-operator-primary.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: size,
          height: size,
          objectFit: "contain",
          clipPath: "polygon(7% 23%, 40% 23%, 45% 49%, 47% 100%, 3% 100%, 3% 25%)",
          rotate: `${ringWiggle}deg`,
          translate: `${Math.sin(frame * 0.54) * (connected ? 0.6 : 2.2)}px ${Math.abs(ringWiggle) * 0.78}px`,
          transformOrigin: "31% 45%",
          zIndex: 2,
          filter: `drop-shadow(0 0 ${connected ? 11 + speechOpen * 13 : 7}px rgba(139,92,246,${
            connected ? 0.18 + speechOpen * 0.16 : 0.16
          }))`,
        }}
      />
      <Img
        src={staticFile("brand/botbound-operator-primary.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: size,
          height: size,
          objectFit: "contain",
          clipPath: "polygon(42% 4%, 65% 4%, 65% 29%, 42% 29%)",
          rotate: `${
            connected
              ? Math.sin(frame * 0.15) * 0.82 + speechOpen * 0.66
              : Math.sin(frame * 0.62) * 2.4
          }deg`,
          transformOrigin: "53% 27%",
          zIndex: 2,
        }}
      />
    </Interactive.Div>
  );
};

const VoiceRail: React.FC<{ vertical: boolean }> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const connected = frame >= CONNECT_FRAME;
  const booked = frame >= BOOKED_FRAME;
  const speaking = isSpeechPhrase(frame);
  const statusBeats = [
    { label: "Incoming call", timing: [0, 1, 40, 44] },
    { label: "BotBound answered", timing: [44, 48, 89, 93] },
    { label: "Capturing intent", timing: [93, 97, 141, 145] },
    { label: "Following your playbook", timing: [145, 149, 179, 183] },
    { label: "Next step booked", timing: [183, 187, 239, 240] },
  ];

  return (
    <Interactive.Div
      name="Live call rail"
      style={{
        position: "absolute",
        left: vertical ? 96 : 76,
        right: vertical ? 96 : 76,
        bottom: vertical ? 220 : 74,
        minHeight: vertical ? 250 : 176,
        padding: vertical ? "34px 38px" : "25px 30px",
        borderRadius: vertical ? 42 : 34,
        border: "1px solid rgba(196,181,253,0.28)",
        background: "linear-gradient(180deg, rgba(20,16,34,0.94), rgba(8,8,13,0.94))",
        boxShadow: "0 34px 90px rgba(0,0,0,0.44), inset 0 1px rgba(255,255,255,0.04)",
        opacity: interpolate(frame, [18, 34], [0, 1], {
          ...clamp,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [18, 38], ["0px 34px", "0px 0px"], {
          ...clamp,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          border: "1px solid rgba(196,181,253,0.34)",
          background:
            "radial-gradient(circle at 50% 0%, rgba(139,92,246,0.18), rgba(16,12,29,0.1) 58%, transparent 86%)",
          boxShadow: "inset 0 1px rgba(255,255,255,0.04), 0 0 58px rgba(139,92,246,0.12)",
          opacity: interpolate(frame, [BOOKED_FRAME - 2, BOOKED_FRAME + 13], [0, 1], clamp),
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 34,
          right: 34,
          top: 0,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(199,204,214,0.34), rgba(167,139,250,0.4), transparent)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -1,
            left: interpolate(frame % 86, [0, 85], ["-12%", "104%"], clamp),
            width: vertical ? 82 : 64,
            height: 3,
            borderRadius: 999,
            background: "linear-gradient(90deg, transparent, #F8F7FC, #A78BFA, transparent)",
            boxShadow: "0 0 18px rgba(167,139,250,0.62)",
          }}
        />
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: booked ? "#F8F7FC" : "#C4B5FD",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: vertical ? 24 : 20,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              width: vertical ? 14 : 12,
              height: vertical ? 14 : 12,
              borderRadius: "50%",
              backgroundColor: booked ? "#F8F7FC" : connected ? "#A78BFA" : "#C7CCD6",
              boxShadow: `0 0 24px ${booked ? "#A78BFA" : connected ? "#8B5CF6" : "#C7CCD6"}`,
              scale: booked
                ? interpolate(
                    frame,
                    [BOOKED_FRAME, BOOKED_FRAME + 8, BOOKED_FRAME + 17],
                    [0.62, 1.38, 1],
                    clamp,
                  )
                : 1,
            }}
          />
          <span
            style={{
              position: "relative",
              display: "inline-block",
              width: vertical ? 430 : 360,
              height: vertical ? 29 : 24,
            }}
          >
            {statusBeats.map(({ label, timing }) => (
              <span
                key={label}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  whiteSpace: "nowrap",
                  opacity: beatOpacity(frame, timing),
                  translate: interpolate(
                    frame,
                    [timing[0], timing[1], timing[2], timing[3]],
                    ["0px 8px", "0px 0px", "0px 0px", "0px -7px"],
                    clamp,
                  ),
                }}
              >
                {label}
              </span>
            ))}
          </span>
        </div>
        <div
          style={{
            position: "relative",
            minWidth: vertical ? 176 : 136,
            height: vertical ? 29 : 24,
            color: "#8E899B",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: vertical ? 21 : 18,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textAlign: "right",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(frame, [BOOKED_FRAME - 4, BOOKED_FRAME + 5], [1, 0], clamp),
            }}
          >
            00:{String(Math.max(0, Math.floor((frame - CONNECT_FRAME) / 30))).padStart(2, "0")}
          </span>
          <span
            style={{
              position: "absolute",
              inset: 0,
              color: "#C4B5FD",
              opacity: interpolate(frame, [BOOKED_FRAME + 3, BOOKED_FRAME + 13], [0, 1], clamp),
            }}
          >
            BOTBOUND.ME
          </span>
        </div>
      </div>
      <div
        style={{
          position: "relative",
          height: vertical ? 88 : 62,
          marginTop: vertical ? 30 : 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: vertical ? 16 : 13,
        }}
      >
        {voiceBars.map((bar, index) => (
          <div
            key={index}
            style={{
              width: vertical ? 29 : 23,
              height:
                (vertical ? 82 : 58) *
                bar *
                (connected
                  ? speaking
                    ? interpolate((frame + index * 3) % 25, [0, 12, 24], [0.28, 1, 0.28], clamp)
                    : 0.2
                  : 0.18),
              borderRadius: 999,
              background:
                index >= 3 && index <= 9
                  ? "linear-gradient(180deg, #D8CCFF 0%, #8B5CF6 100%)"
                  : "rgba(196,181,253,0.28)",
              boxShadow: index >= 3 && index <= 9 ? "0 0 20px rgba(139,92,246,0.28)" : undefined,
              opacity: interpolate(frame, [BOOKED_FRAME, BOOKED_FRAME + 14], [1, 0], clamp),
              scale: interpolate(frame, [BOOKED_FRAME, BOOKED_FRAME + 14], [1, 0.4], clamp),
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: vertical ? 500 : 390,
            height: 1,
            marginLeft: vertical ? -250 : -195,
            marginTop: -1,
            background:
              "linear-gradient(90deg, transparent, rgba(199,204,214,0.56), #A78BFA 50%, rgba(199,204,214,0.56), transparent)",
            boxShadow: "0 0 18px rgba(139,92,246,0.35)",
            opacity: interpolate(frame, [BOOKED_FRAME + 4, BOOKED_FRAME + 16], [0, 1], clamp),
            scale: interpolate(frame, [BOOKED_FRAME + 4, BOOKED_FRAME + 17], [0.12, 1], {
              ...clamp,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#C7CCD6",
            fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
            fontSize: vertical ? 21 : 17,
            fontWeight: 700,
            letterSpacing: "0.18em",
            opacity: interpolate(frame, [BOOKED_FRAME + 13, BOOKED_FRAME + 25], [0, 1], clamp),
            textShadow: "0 0 20px rgba(139,92,246,0.32)",
          }}
        >
          CALLS · TEXTS · EMAIL
        </div>
      </div>
    </Interactive.Div>
  );
};

export const BotBoundLogoCall: React.FC<BotBoundLogoCallProps> = ({ variant }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const vertical = variant === "vertical";
  const headerBeats = [
    { label: "RING 01", timing: [0, 1, 18, 21] },
    { label: "RING 02", timing: [21, 24, 41, 44] },
    { label: "PHONE BOT · LIVE", timing: [44, 47, 180, 183] },
    { label: "CALL HANDLED", timing: [183, 186, 239, 240] },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: "#050508", color: "#F8F7FC" }}>
      <AtmosphericField />
      <StageWords vertical={vertical} />
      <Audio
        src={staticFile("audio/botbound-score.mp3")}
        volume={(audioFrame) =>
          interpolate(
            audioFrame,
            [0, 18, durationInFrames - 30, durationInFrames - 1],
            [0, 0.16, 0.16, 0],
            clamp,
          )
        }
      />
      <Sequence from={0} durationInFrames={24} layout="none">
        <Audio src={staticFile("audio/phone-ring.wav")} volume={1} />
      </Sequence>
      <Sequence from={21} durationInFrames={24} layout="none">
        <Audio src={staticFile("audio/phone-ring.wav")} volume={0.75} toneFrequency={0.96} />
      </Sequence>
      <Sequence from={CONNECT_FRAME} durationInFrames={51} layout="none">
        <Audio src={staticFile("audio/transfer-chime-approved.wav")} volume={0.72} />
      </Sequence>
      <Sequence from={BOOKED_FRAME} durationInFrames={30} layout="none">
        <Audio
          src={staticFile("audio/transfer-chime-approved.wav")}
          volume={0.54}
          toneFrequency={1.08}
          trimBefore={22}
          trimAfter={49}
        />
      </Sequence>

      <Interactive.Div
        name="Brand header"
        style={{
          position: "absolute",
          top: vertical ? 150 : 68,
          left: vertical ? 96 : 76,
          right: vertical ? 96 : 76,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: interpolate(frame, [0, 14], [0, 1], clamp),
          translate: interpolate(frame, [0, 16], ["0px -22px", "0px 0px"], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <BrandWordmark fontSize={vertical ? 62 : 54} />
        <Eyebrow fontSize={vertical ? 23 : 20}>
          <span
            style={{
              position: "relative",
              display: "inline-block",
              width: vertical ? 280 : 248,
              height: vertical ? 27 : 23,
              textAlign: "right",
            }}
          >
            {headerBeats.map(({ label, timing }) => (
              <span
                key={label}
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  whiteSpace: "nowrap",
                  opacity: beatOpacity(frame, timing),
                  translate: interpolate(
                    frame,
                    [timing[0], timing[1], timing[2], timing[3]],
                    ["0px 7px", "0px 0px", "0px 0px", "0px -6px"],
                    clamp,
                  ),
                }}
              >
                {label}
              </span>
            ))}
          </span>
        </Eyebrow>
      </Interactive.Div>

      <SignalWire vertical={vertical} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: vertical ? 334 : 98,
          marginLeft: vertical ? -460 : -370,
        }}
      >
        <AnimatedOperator size={vertical ? 920 : 740} />
      </div>

      {vertical ? (
        <div
          style={{
            position: "absolute",
            left: 96,
            right: 96,
            top: 1218,
            height: 156,
            textAlign: "center",
          }}
        >
          <Interactive.Div
            name="Answer statement"
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(frame, [49, 61, 101, 113], [0, 1, 1, 0], clamp),
              translate: interpolate(frame, [49, 65], ["0px 22px", "0px 0px"], {
                ...clamp,
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
              fontSize: 88,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 0.94,
            }}
          >
            <div
              style={{
                marginBottom: 16,
                color: "#C7CCD6",
                fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
                fontSize: 23,
                fontWeight: 700,
                letterSpacing: "0.16em",
                lineHeight: 1,
              }}
            >
              ON THE SECOND RING
            </div>
            BOTBOUND <span style={{ color: "#A78BFA" }}>ANSWERS.</span>
          </Interactive.Div>
          <Interactive.Div
            name="On-brand statement"
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(frame, [105, 118, 169, 181], [0, 1, 1, 0], clamp),
              translate: interpolate(frame, [105, 121], ["0px 22px", "0px 0px"], {
                ...clamp,
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
              fontSize: 84,
              fontWeight: 800,
              letterSpacing: "-0.032em",
              lineHeight: 0.94,
            }}
          >
            ON-BRAND.
            <br />
            <span style={{ color: "#A78BFA" }}>READY TO HELP.</span>
          </Interactive.Div>
        </div>
      ) : null}

      <VoiceRail vertical={vertical} />

      <Interactive.Div
        name="Brand close"
        style={{
          position: "absolute",
          left: vertical ? 124 : 110,
          right: vertical ? 124 : 110,
          bottom: vertical ? 496 : 244,
          textAlign: "center",
          opacity: interpolate(frame, [187, 201], [0, 1], clamp),
          scale: interpolate(frame, [187, 204], [0.92, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 16, mass: 0.7, stiffness: 130 }),
            output: "perceptual-scale",
          }),
          fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
          fontSize: vertical ? 84 : 40,
          fontWeight: 800,
          letterSpacing: vertical ? "-0.025em" : "-0.01em",
          lineHeight: vertical ? 0.98 : 1,
          color: "#F8F7FC",
          textShadow: "0 0 30px rgba(139,92,246,0.2)",
        }}
      >
        PUT YOUR BOT{vertical ? <br /> : " "}
        <span style={{ color: "#A78BFA" }}>ON THE LINE.</span>
        <div
          style={{
            width: vertical ? 430 : 350,
            maxWidth: "74%",
            height: 2,
            margin: vertical ? "24px auto 0" : "15px auto 0",
            borderRadius: 999,
            background:
              "linear-gradient(90deg, transparent, rgba(199,204,214,0.76), #A78BFA, transparent)",
            boxShadow: "0 0 18px rgba(139,92,246,0.35)",
            scale: interpolate(frame, [194, 211], [0.08, 1], {
              ...clamp,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
