import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const touchTarget =
  "after:pointer-events-none after:absolute after:inset-x-0 after:top-1/2 after:h-full after:min-h-[44px] after:-translate-y-1/2 after:content-['']";

export const buttonVariants = cva(
  "relative inline-flex min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-[var(--wireline-radius-md)] text-sm font-semibold tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-sm hover:bg-[var(--wireline-color-action-primary-pressed)] hover:shadow-md",
        primary:
          "bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-sm hover:bg-[var(--wireline-color-action-primary-pressed)] hover:shadow-md",
        destructive:
          "bg-[var(--wireline-color-status-error)] text-[var(--wireline-color-text-onAction)] shadow-sm hover:bg-[var(--wireline-color-status-error)]/90 hover:shadow-md",
        outline:
          "border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] text-[var(--wireline-color-text-primary)] shadow-sm hover:border-[var(--wireline-color-border-strong)]/45 hover:bg-[var(--wireline-color-action-primary-container)] hover:text-[var(--wireline-color-text-primary)]",
        secondary:
          "bg-[var(--wireline-color-surface-subtle)] text-[var(--wireline-color-text-primary)] shadow-sm hover:bg-[var(--wireline-color-surface-subtle)]/80 hover:shadow-md",
        ghost:
          "text-[var(--wireline-color-text-primary)] hover:bg-[var(--wireline-color-action-primary-container)] hover:text-[var(--wireline-color-text-primary)]",
        link: "h-auto text-[var(--wireline-color-action-primary-default)] underline-offset-4 hover:underline",
        glass:
          "border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] text-[var(--wireline-color-text-primary)] hover:border-[var(--wireline-color-border-strong)]/35 hover:bg-[var(--wireline-color-action-primary-container)]",
        chrome:
          "border border-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-sm hover:bg-[var(--wireline-color-action-primary-pressed)]",
        editorial:
          "border border-[var(--wireline-color-action-primary-default)]/80 bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_0_#000,0_8px_18px_rgba(29,29,31,0.18)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_1px_0_#000]",
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
