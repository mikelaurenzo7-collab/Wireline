import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BrandLockup, Eyebrow } from "../components/Brand";

export const OUTBOUND_VERTICAL_SAFE_ZONE = {
  top: 220,
  right: 144,
  bottom: 340,
  left: 96,
} as const;

export const OutboundChrome: React.FC<{ section: string }> = ({ section }) => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const vertical = height / width > 1.3;
  const leftInset = vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.left : 72;
  const rightInset = vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.right : 72;

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.top : 62,
          left: leftInset,
          right: rightInset,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0, 12], ["0px -18px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <BrandLockup markSize={vertical ? 46 : 38} wordmarkSize={vertical ? 42 : 36} />
        <Eyebrow fontSize={vertical ? 21 : 18}>{section}</Eyebrow>
      </div>
      <div
        style={{
          position: "absolute",
          left: leftInset,
          right: rightInset,
          bottom: vertical ? OUTBOUND_VERTICAL_SAFE_ZONE.bottom : 62,
          height: 2,
          background:
            "linear-gradient(90deg, rgba(139,92,246,0.82), rgba(139,92,246,0.08) 42%, rgba(139,92,246,0))",
          scale: interpolate(frame, [0, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transformOrigin: "left center",
        }}
      />
    </>
  );
};

export const SceneHeadline: React.FC<{
  children: React.ReactNode;
  maxWidth?: number;
}> = ({ children, maxWidth }) => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const vertical = height / width > 1.3;

  return (
    <div
      style={{
        fontFamily: "BotBound Inter Tight, Inter Tight, sans-serif",
        fontSize: vertical ? 110 : 100,
        fontWeight: 800,
        letterSpacing: 0,
        lineHeight: 0.91,
        maxWidth: maxWidth ?? (vertical ? 900 : 860),
        textWrap: "balance",
        opacity: interpolate(frame, [2, 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: interpolate(frame, [0, 17], ["0px 36px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {children}
    </div>
  );
};

export const StatusPill: React.FC<{
  children: React.ReactNode;
  tone?: "violet" | "mint";
}> = ({ children, tone = "violet" }) => {
  const { height, width } = useVideoConfig();
  const vertical = height / width > 1.3;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        border: `1px solid ${tone === "mint" ? "rgba(94,234,212,0.38)" : "rgba(184,164,255,0.4)"}`,
        borderRadius: 999,
        backgroundColor: tone === "mint" ? "rgba(20,83,77,0.22)" : "rgba(73,45,135,0.24)",
        padding: vertical ? "15px 22px" : "13px 19px",
        color: tone === "mint" ? "#A7F3D0" : "#C4B5FD",
        fontFamily: "BotBound Plex Mono, IBM Plex Mono, monospace",
        fontSize: vertical ? 21 : 18,
        fontWeight: 700,
        letterSpacing: "0.11em",
        lineHeight: 1,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: vertical ? 10 : 9,
          height: vertical ? 10 : 9,
          borderRadius: "50%",
          backgroundColor: tone === "mint" ? "#5EEAD4" : "#A78BFA",
          boxShadow: `0 0 20px ${tone === "mint" ? "#5EEAD4" : "#8B5CF6"}`,
        }}
      />
      {children}
    </div>
  );
};
