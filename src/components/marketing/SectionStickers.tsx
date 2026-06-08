/**
 * SectionStickers — gutter-placed robot stickers with editorial motion.
 */
import { RobotHead, type RobotPose } from "./RobotHead";
import { stickerGutterInset, stickerGutterInsetNarrow } from "./sticker-gutter";
import { applyCssVar, applyEdgeInset } from "../../lib/apply-dom-layout";

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
    <div
      className={`${layoutClass} ${visibilityClass} ${className}`}
      ref={(el) => applyCssVar(el, "--wl-sticker-corridor", corridorHalfRem)}
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

        const insetLeft = "left" in gutter ? String(gutter.left) : undefined;
        const insetRight = "right" in gutter ? String(gutter.right) : undefined;

        return (
          <div
            key={index}
            className={`wl-sticker-slot absolute${isCenter ? " -translate-y-1/2" : ""}${vivid ? " wl-sticker-vivid" : ""}`}
            ref={(el) =>
              applyEdgeInset(el, {
                left: insetLeft,
                right: insetRight,
                top: slot.top,
                bottom: slot.bottom,
              })
            }
            data-sticker-opacity={slot.opacity}
          >
            {vivid && <span className="wl-sticker-halo" aria-hidden="true" />}
            <div
              className="wl-sticker-enter relative"
              data-sticker-opacity={slot.opacity}
              data-enter-delay={`${enterDelay}ms`}
            >
              <div
                className="wl-sticker-float"
                data-float-ms={`${floatMs}ms`}
                data-float-delay={`${floatDelay}ms`}
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
  );
}
