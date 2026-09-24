import type { ElementType } from "react";

import { cn } from "../../lib/utils";
import { BOTBOUND_BRAND_NAME } from "../../lib/brand";
import BotBoundMark from "./BotBoundMark";

export { BOTBOUND_BRAND_NAME };

export type BotBoundLockupSize = "compact" | "standard" | "large" | "display";
export type BotBoundLockupSurface = "bare" | "tile";

type BotBoundWordmarkProps = {
  as?: ElementType;
  className?: string;
  inline?: boolean;
};

/** Canonical customer-facing BotBound wordmark. Both B glyphs stay complete. */
export function BotBoundWordmark({
  as: Tag = "span",
  className,
  inline = false,
}: BotBoundWordmarkProps) {
  return (
    <Tag
      className={cn("bb-wordmark", className)}
      data-inline={inline ? "true" : "false"}
      data-botbound-brand-name="true"
      aria-label={BOTBOUND_BRAND_NAME}
    >
      <span className="bb-wordmark__bot">Bot</span>
      <span className="bb-wordmark__bound">Bound</span>
    </Tag>
  );
}

type BotBoundLockupProps = {
  size?: BotBoundLockupSize;
  surface?: BotBoundLockupSurface;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  signal?: boolean;
};

/** Canonical letterpress phone glyph + BotBound wordmark lockup. */
export function BotBoundLockup({
  size = "standard",
  surface = "bare",
  className,
  markClassName,
  wordmarkClassName,
  signal = true,
}: BotBoundLockupProps) {
  return (
    <span
      className={cn("bb-lockup", className)}
      data-size={size}
      data-surface={surface}
      data-botbound-brand-lockup="true"
    >
      <span className={cn("bb-lockup__mark", markClassName)} aria-hidden="true">
        <BotBoundMark signal={signal} />
      </span>
      <BotBoundWordmark className={cn("bb-lockup__wordmark", wordmarkClassName)} />
    </span>
  );
}
