import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/utils";

type BrutalButtonVariant = "brand" | "ink" | "outline" | "danger";
type BrutalButtonSize = "sm" | "md" | "lg";
type BrutalButtonShadow = "none" | "sm" | "md" | "lg";

export interface BrutalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BrutalButtonVariant;
  size?: BrutalButtonSize;
  shadow?: BrutalButtonShadow;
  /** Show a leading icon. Renders inside a flex container with the label. */
  leadingIcon?: ReactNode;
  /** Show a trailing icon. */
  trailingIcon?: ReactNode;
  /** Render as a full-width block. */
  block?: boolean;
}

const VARIANT_CLASSES: Record<BrutalButtonVariant, string> = {
  brand: "bg-brand text-ink",
  ink: "bg-ink text-brand",
  outline: "bg-white text-ink",
  danger: "bg-red-500 text-white",
};

const SIZE_CLASSES: Record<BrutalButtonSize, string> = {
  sm: "h-10 px-4 text-[10px]",
  md: "h-12 px-6 text-xs",
  lg: "h-14 px-8 text-xs",
};

const SHADOW_CLASSES: Record<BrutalButtonShadow, string> = {
  none: "shadow-none",
  sm: "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
  md: "shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
  lg: "shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]",
};

/**
 * Brutalist button primitive. Captures the recurring pattern across the app:
 *   border-2 + chunky offset shadow + uppercase tracking + active translate.
 * Replaces inline `brutal-btn !bg-… h-14 …` strings.
 */
export const BrutalButton = forwardRef<HTMLButtonElement, BrutalButtonProps>(function BrutalButton(
  {
    variant = "brand",
    size = "md",
    shadow = "md",
    leadingIcon,
    trailingIcon,
    block,
    className,
    children,
    type,
    disabled,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled}
      className={cn(
        "border-2 border-ink font-black uppercase tracking-widest italic transition-all",
        "inline-flex items-center justify-center gap-3",
        "active:translate-x-1 active:translate-y-1 active:shadow-none",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        SHADOW_CLASSES[shadow],
        block && "w-full",
        className
      )}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});
