import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const touchTarget =
  "after:pointer-events-none after:absolute after:inset-x-0 after:top-1/2 after:h-full after:min-h-[44px] after:-translate-y-1/2 after:content-['']";

export const buttonVariants = cva(
  "relative inline-flex min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-[var(--wireline-radius-md)] text-sm font-semibold tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60 aria-busy:cursor-wait aria-busy:opacity-80 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm),var(--wireline-elevation-inset)] hover:bg-[var(--wireline-color-action-primary-hover)] hover:shadow-[var(--wireline-elevation-md),var(--wireline-elevation-insetRaised)]",
        primary:
          "bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm),var(--wireline-elevation-inset)] hover:bg-[var(--wireline-color-action-primary-hover)] hover:shadow-[var(--wireline-elevation-md),var(--wireline-elevation-insetRaised)]",
        wire: "bg-[var(--wireline-color-action-secondary-container)] text-[var(--wireline-color-action-secondary-default)] border border-[color-mix(in_srgb,var(--wireline-color-action-secondary-default)_32%,transparent)] shadow-[var(--wireline-elevation-wireGlow),var(--wireline-elevation-inset)] hover:bg-[var(--wireline-color-action-secondary-containerStrong)] hover:border-[color-mix(in_srgb,var(--wireline-color-action-secondary-default)_48%,transparent)] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--wireline-color-action-secondary-default)_40%,transparent),0_12px_36px_-12px_color-mix(in_srgb,var(--wireline-color-action-secondary-default)_36%,transparent)]",
        destructive:
          "bg-[var(--wireline-color-status-error)] text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm),var(--wireline-elevation-inset)] hover:bg-[var(--wireline-color-status-error)]/90 hover:shadow-[var(--wireline-elevation-md),var(--wireline-elevation-insetRaised)]",
        outline:
          "border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] text-[var(--wireline-color-text-primary)] shadow-[var(--wireline-elevation-xs),var(--wireline-elevation-inset)] hover:border-[var(--wireline-color-border-strong)]/45 hover:bg-[var(--wireline-color-action-primary-container)] hover:text-[var(--wireline-color-text-primary)]",
        secondary:
          "bg-[var(--wireline-color-surface-subtle)] text-[var(--wireline-color-text-primary)] shadow-[var(--wireline-elevation-xs),var(--wireline-elevation-inset)] hover:bg-[var(--wireline-color-surface-subtle)]/80 hover:shadow-[var(--wireline-elevation-sm),var(--wireline-elevation-insetRaised)]",
        ghost:
          "text-[var(--wireline-color-text-primary)] hover:bg-[var(--wireline-color-action-primary-container)] hover:text-[var(--wireline-color-text-primary)]",
        link: "h-auto text-[var(--wireline-color-action-primary-default)] underline-offset-4 hover:underline",
        glass:
          "border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] text-[var(--wireline-color-text-primary)] hover:border-[var(--wireline-color-border-strong)]/35 hover:bg-[var(--wireline-color-action-primary-container)]",
        chrome:
          "border border-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-sm hover:bg-[var(--wireline-color-action-primary-pressed)]",
        editorial:
          "border border-[var(--wireline-color-action-primary-default)]/80 bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_0_rgba(17,17,17,1),0_8px_18px_rgba(17,17,17,0.18)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_1px_0_rgba(17,17,17,1)]",
      },
      size: {
        default: `h-9 px-4 py-2 ${touchTarget}`,
        md: `h-9 px-4 py-2 ${touchTarget}`,
        sm: `h-8 px-3 text-xs ${touchTarget}`,
        lg: `h-10 px-8 ${touchTarget}`,
        icon: "h-9 w-9 px-0 [&_svg]:size-5 after:pointer-events-none after:absolute after:left-1/2 after:top-1/2 after:min-h-[44px] after:min-w-[44px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Retained while existing motion-heavy surfaces migrate. The atom itself
   * intentionally owns no non-essential motion, so this is a no-op.
   */
  disableAnimations?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, disableAnimations: _disableAnimations, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
