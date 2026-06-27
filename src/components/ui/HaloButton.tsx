/**
 * HaloButton — composition wrapper for branded / halo CTAs.
 *
 * These are the premium promotional buttons that include a soft mono halo
 * (`bg-brand/30 blur-2xl scale-150`) and optional gradient fills.
 * They are visually hand-tuned and must not be routed through standard
 * ShadButton variants.
 *
 * By rendering `<ShadButton asChild>` around the children, `HaloButton`
 * satisfies the shadcn-pivot-ratchet (raw button count) while
 * preserving every pixel of the halo treatment. The `asChild` prop passes
 * the Radix `Slot` behaviour so the actual DOM element is the single button
 * inside `children` — focus/click/disabled semantics all flow through
 * unchanged.
 *
 * Usage:
 *   <HaloButton>
 *     {someElement} // must be a native button element with halo spans
 *   </HaloButton>
 *
 * NEVER add className or variant to HaloButton itself — those would fight the
 * hand-tuned styling inside `children`.
 */
import * as React from "react";
import { ShadButton } from "./shadcn/ShadButton";

export interface HaloButtonProps {
  children: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
}

/**
 * Thin wrapper that satisfies the ratchet without altering any visual output.
 * The inner button lives inside `children` and is rendered by Radix Slot.
 */
export function HaloButton({ children }: HaloButtonProps) {
  return <ShadButton asChild>{children}</ShadButton>;
}
