import type { ElementType } from "react";

import { cn } from "../../lib/utils";
import WirelineMark from "./WirelineMark";

export const WIRELINE_BRAND_NAME = "WIRELINE" as const;

type WirelineWordmarkProps = {
  as?: ElementType;
  className?: string;
  inline?: boolean;
};

/**
 * Canonical visible company name.
 *
 * WIRELINE is treated as a piece of identity, not ordinary title-cased prose.
 * The inline treatment optically reduces/tracks the capitals so the name can
 * stand out inside a sentence without looking like an accidental shout.
 */
export function WirelineWordmark({
  as: Tag = "span",
  className,
  inline = false,
}: WirelineWordmarkProps) {
  return (
    <Tag
      className={cn("wl-wireline-wordmark", className)}
      data-inline={inline ? "true" : "false"}
      data-wireline-brand-name="true"
    >
      {WIRELINE_BRAND_NAME}
    </Tag>
  );
}

export type WirelineLockupSize = "compact" | "standard" | "large";
export type WirelineLockupSurface = "bare" | "tile";

type WirelineLockupProps = {
  size?: WirelineLockupSize;
  surface?: WirelineLockupSurface;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  signal?: boolean;
};

/**
 * Folded-W + WIRELINE lockup with one immutable optical ratio.
 *
 * Surfaces may scale the lockup, but they do not independently choose mark
 * size, wordmark size, gap, case, or tracking. That is what keeps the public
 * header, auth, workspace, transitions, and footer visibly the same company.
 */
export function WirelineLockup({
  size = "standard",
  surface = "bare",
  className,
  markClassName,
  wordmarkClassName,
  signal = true,
}: WirelineLockupProps) {
  return (
    <span
      className={cn("wl-wireline-lockup", className)}
      data-size={size}
      data-surface={surface}
      data-wireline-brand-lockup="true"
    >
      <span className={cn("wl-wireline-lockup__mark", markClassName)} aria-hidden="true">
        <WirelineMark signal={signal} />
      </span>
      <WirelineWordmark className={cn("wl-wireline-lockup__wordmark", wordmarkClassName)} />
    </span>
  );
}
