/**
 * SectionStickers — gutter-placed robot stickers with editorial motion.
 */
import { RobotHead, type RobotPose } from "./RobotHead";
import {
  stickerGutterInset,
  stickerGutterInsetNarrow,
  stickerCorridorMaskStyle,
} from "./sticker-gutter";

export type SectionStickerSlot = {
  variant: 1 | 2 | 3 | 4 | 5 | 6;
  pose?: RobotPose;
  size: number;
  opacity: number;
  side: "left" | "right";
  top?: string;
  bottom?: string;
  contentHalfRem?: string;
  narrow?: boolean;
  delayMs?: number;
  floatMs?: number;
  floatDelayMs?: number;
};

type SectionStickersProps = {
  slots: SectionStickerSlot[];
  className?: string;
  testId?: string;
  /** Hero treatment: paper halo + full saturation (no ghost-tier opacity). */
  vivid?: boolean;
  /** `overlay` = absolute inset-0 on a section; `fill` = relative box (padding gutters). */
  layout?: "overlay" | "fill";
  /** Minimum viewport width to show stickers (Tailwind breakpoint name). */
  minBreakpoint?: "lg" | "xl";
  /** Content corridor half-width — robots are masked outside this zone. */
  corridorHalfRem?: string;
};

export function SectionStickers({
  slots,
  className = "",
  testId,
  vivid = false,
  layout = "overlay",
  minBreakpoint = "lg",
  corridorHalfRem = "28rem",
}: SectionStickersProps) {
  const visibilityClass = minBreakpoint === "xl" ? "hidden xl:block" : "hidden lg:block";
  const layoutClass =
    layout === "fill"
      ? "pointer-events-none relative h-full w-full wl-sticker-gutter-mask"
      : "pointer-events-none absolute inset-0 z-[1] wl-sticker-gutter-mask";

  return (
    <>
      <style>{`
        @keyframes wl-sticker-enter {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.92);
          }
          to {
            opacity: var(--sticker-opacity, 0.45);
            transform: translateY(0) scale(1);
          }
        }
        @keyframes wl-sticker-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .wl-sticker-enter {
          animation: wl-sticker-enter 1.05s cubic-bezier(0.23, 1, 0.32, 1) forwards;
          opacity: 0;
        }
        .wl-sticker-float {
          animation: wl-sticker-float var(--float-ms, 5200ms) ease-in-out infinite;
        }
        .wl-sticker-slot:hover .wl-sticker-enter {
          opacity: min(calc(var(--sticker-opacity, 0.45) + 0.2), 0.95) !important;
        }
        .wl-sticker-slot:hover .wl-sticker-float {
          animation-play-state: paused;
        }
        .wl-sticker-slot:hover svg {
          filter: drop-shadow(0 6px 16px rgba(107, 43, 153, 0.2));
        }

        .wl-sticker-vivid .wl-sticker-halo {
          position: absolute;
          inset: -10px;
          border-radius: 9999px;
          background: radial-gradient(
            circle at 50% 45%,
            rgba(239, 233, 220, 0.92) 0%,
            rgba(239, 233, 220, 0.55) 45%,
            transparent 72%
          );
          z-index: -1;
        }
        .wl-sticker-vivid svg {
          filter: drop-shadow(0 5px 14px rgba(107, 43, 153, 0.28))
            drop-shadow(0 1px 0 rgba(255, 255, 255, 0.65));
        }
        .wl-sticker-vivid:hover svg {
          filter: drop-shadow(0 8px 22px rgba(107, 43, 153, 0.38))
            drop-shadow(0 1px 0 rgba(255, 255, 255, 0.75)) !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .wl-sticker-enter,
          .wl-sticker-float {
            animation: none !important;
            opacity: var(--sticker-opacity, 0.45) !important;
            transform: none !important;
          }
        }
      `}</style>
      <div
        className={`${layoutClass} ${visibilityClass} ${className}`}
        style={stickerCorridorMaskStyle(corridorHalfRem)}
        aria-hidden="true"
        data-testid={testId}
      >
        {slots.map((slot, index) => {
          const isCenter = slot.top === "50%";
          const pose = slot.pose ?? "phone";
          const gutter = slot.narrow
            ? stickerGutterInsetNarrow(slot.side, slot.size, pose)
            : stickerGutterInset(slot.side, slot.size, slot.contentHalfRem, pose);

          const enterDelay = slot.delayMs ?? index * 90;
          const floatMs = slot.floatMs ?? 5200 + index * 680;
          const floatDelay = slot.floatDelayMs ?? enterDelay + 900;

          return (
            <div
              key={index}
              className={`wl-sticker-slot absolute${isCenter ? " -translate-y-1/2" : ""}${vivid ? " wl-sticker-vivid" : ""}`}
              style={{
                ...gutter,
                ...(slot.top != null ? { top: slot.top } : {}),
                ...(slot.bottom != null ? { bottom: slot.bottom, top: "auto" } : {}),
                ["--sticker-opacity" as string]: slot.opacity,
              }}
            >
              {vivid && <span className="wl-sticker-halo" aria-hidden="true" />}
              <div
                className="wl-sticker-enter relative"
                style={{
                  ["--sticker-opacity" as string]: slot.opacity,
                  animationDelay: `${enterDelay}ms`,
                }}
              >
                <div
                  className="wl-sticker-float"
                  style={{
                    ["--float-ms" as string]: `${floatMs}ms`,
                    animationDelay: `${floatDelay}ms`,
                  }}
                >
                  <RobotHead
                    variant={slot.variant}
                    pose={pose}
                    size={slot.size}
                    animated
                    vivid={vivid}
                    gutterSide={slot.side}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
