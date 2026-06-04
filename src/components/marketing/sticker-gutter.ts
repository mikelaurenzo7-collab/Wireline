import type React from "react";
import type { RobotPose } from "./RobotHead";

/** Gap between sticker edge and the centered content column (px). */
export const STICKER_CONTENT_GAP_PX = 36;

/** Extra inset when pose props (phone, etc.) face toward the content column. */
export const STICKER_POSE_INWARD_RATIO = 0.14;

/** Half-width of the primary copy column (max-w-4xl = 56rem). */
export const STICKER_CONTENT_HALF = "28rem";

function poseInwardPadding(sizePx: number, pose?: RobotPose): number {
  if (!pose || pose === "typing") return 0;
  return Math.round(sizePx * STICKER_POSE_INWARD_RATIO);
}

/**
 * Place a sticker fully outside the centered content corridor.
 * Works for max-w-4xl hero copy and max-w-7xl section containers.
 */
export function stickerGutterInset(
  side: "left" | "right",
  sizePx: number,
  contentHalfRem: string = STICKER_CONTENT_HALF,
  pose?: RobotPose,
): React.CSSProperties {
  const gap = STICKER_CONTENT_GAP_PX + poseInwardPadding(sizePx, pose);
  const offset = `max(1.5rem, calc(50% - min(${contentHalfRem}, 50% - 2rem) - ${sizePx + gap}px))`;
  return side === "left" ? { left: offset } : { right: offset };
}

/** FAQ / narrow sections — stickers sit outside max-w-3xl (48rem) copy. */
export function stickerGutterInsetNarrow(
  side: "left" | "right",
  sizePx: number,
  pose?: RobotPose,
): React.CSSProperties {
  return stickerGutterInset(side, sizePx, "24rem", pose);
}

/** CSS value for horizontal gutter mask (hides center content corridor). */
export function stickerCorridorMaskStyle(corridorHalfRem: string): React.CSSProperties {
  return {
    ["--wl-sticker-corridor" as string]: corridorHalfRem,
  };
}
