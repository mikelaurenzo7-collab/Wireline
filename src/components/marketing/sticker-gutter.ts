import type React from "react";

/** Gap between sticker edge and the centered content column (px). */
export const STICKER_CONTENT_GAP_PX = 28;

/** Half-width of the primary copy column (max-w-4xl = 56rem). */
export const STICKER_CONTENT_HALF = "28rem";

/**
 * Place a sticker fully outside the centered content corridor.
 * Works for max-w-4xl hero copy and max-w-7xl section containers.
 */
export function stickerGutterInset(
  side: "left" | "right",
  sizePx: number,
  contentHalfRem: string = STICKER_CONTENT_HALF,
): React.CSSProperties {
  const offset = `max(1.25rem, calc(50% - min(${contentHalfRem}, 50% - 1.5rem) - ${sizePx + STICKER_CONTENT_GAP_PX}px))`;
  return side === "left" ? { left: offset } : { right: offset };
}

/** FAQ / narrow sections — stickers sit outside max-w-3xl (48rem) copy. */
export function stickerGutterInsetNarrow(
  side: "left" | "right",
  sizePx: number,
): React.CSSProperties {
  return stickerGutterInset(side, sizePx, "24rem");
}
