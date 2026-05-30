/**
 * SectionStickers — gutter-placed robot stickers with editorial motion.
 */
import React from "react";
import { RobotHead, type RobotPose } from "./RobotHead";
import { stickerGutterInset, stickerGutterInsetNarrow } from "./sticker-gutter";

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
};

export function SectionStickers({ slots, className = "", testId }: SectionStickersProps) {
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
          filter: drop-shadow(0 6px 16px rgba(79, 30, 123, 0.2));
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
        className={`pointer-events-none absolute inset-0 z-[1] hidden xl:block ${className}`}
        aria-hidden="true"
        data-testid={testId}
      >
        {slots.map((slot, index) => {
          const isCenter = slot.top === "50%";
          const gutter = slot.narrow
            ? stickerGutterInsetNarrow(slot.side, slot.size)
            : stickerGutterInset(slot.side, slot.size, slot.contentHalfRem);

          const enterDelay = slot.delayMs ?? index * 90;
          const floatMs = slot.floatMs ?? 5200 + index * 680;
          const floatDelay = slot.floatDelayMs ?? enterDelay + 900;

          return (
            <div
              key={index}
              className={`wl-sticker-slot absolute${isCenter ? " -translate-y-1/2" : ""}`}
              style={{
                ...gutter,
                ...(slot.top != null ? { top: slot.top } : {}),
                ...(slot.bottom != null ? { bottom: slot.bottom, top: "auto" } : {}),
                ["--sticker-opacity" as string]: slot.opacity,
              }}
            >
              <div
                className="wl-sticker-enter"
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
                    pose={slot.pose ?? "phone"}
                    size={slot.size}
                    animated
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
