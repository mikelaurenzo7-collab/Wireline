import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  // `min-h-*` on the primitive, not only on the `button` element rule in
  // foundation.css: with `asChild` the rendered node is the child — usually a
  // react-router <Link>, so an <a> that matches neither `button` nor
  // `[role="button"]` and inherited no floor at all. Every `<Button asChild>`
  // therefore rendered at its size variant's bare height (36px for the default)
  // next to real buttons at 40px, most visibly in the Overview action rows.
  // Carrying the floor here makes the control the same height whatever element
  // it becomes. The `link` variant opts out below — it is text, not a control.
  "relative inline-flex min-h-[var(--wireline-interaction-target-minimum,40px)] min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-[var(--wireline-radius-md)] text-sm font-semibold tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wireline-color-canvas-default)] disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60 aria-busy:cursor-wait aria-busy:opacity-80 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
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
        link: "h-auto min-h-0 text-[var(--wireline-color-action-primary-default)] underline-offset-4 hover:underline",
        glass:
          "border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] text-[var(--wireline-color-text-primary)] hover:border-[var(--wireline-color-border-strong)]/35 hover:bg-[var(--wireline-color-action-primary-container)]",
        chrome:
          "border border-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-sm hover:bg-[var(--wireline-color-action-primary-pressed)]",
        editorial:
          "border border-[var(--wireline-color-action-primary-default)]/80 bg-[var(--wireline-color-action-primary-default)] text-[var(--wireline-color-text-onAction)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_0_rgba(17,17,17,1),0_8px_18px_rgba(17,17,17,0.18)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_1px_0_rgba(17,17,17,1)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        md: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9 px-0 [&_svg]:size-5",
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

type SlottedInteractionProps = {
  onClick?: React.MouseEventHandler<HTMLElement>;
  onClickCapture?: React.MouseEventHandler<HTMLElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  onKeyDownCapture?: React.KeyboardEventHandler<HTMLElement>;
};

function resolvesAriaDisabled(value: React.AriaAttributes["aria-disabled"]): boolean {
  return value === true || value === "true";
}

function stopDisabledActivation(event: React.SyntheticEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

function isActivationKey(event: React.KeyboardEvent<HTMLElement>): boolean {
  return event.key === "Enter" || event.key === " ";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      disableAnimations: _disableAnimations,
      disabled,
      onClick,
      onClickCapture,
      onKeyDown,
      onKeyDownCapture,
      "aria-disabled": ariaDisabledProp,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const resolvedSize = size ?? "default";
    const ariaDisabled = resolvesAriaDisabled(ariaDisabledProp) || (asChild && disabled === true);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (ariaDisabled) {
        stopDisabledActivation(event);
        return;
      }
      onClick?.(event);
    };

    const handleClickCapture = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (ariaDisabled) {
        stopDisabledActivation(event);
        return;
      }
      onClickCapture?.(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (ariaDisabled && isActivationKey(event)) {
        stopDisabledActivation(event);
        return;
      }
      onKeyDown?.(event);
    };

    const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (ariaDisabled && isActivationKey(event)) {
        stopDisabledActivation(event);
        return;
      }
      onKeyDownCapture?.(event);
    };

    /*
     * Radix Slot composes child handlers before slot handlers. For a disabled
     * slotted link, guarding only the wrapper's bubble handler is therefore too
     * late: the child's own navigation handler may already have run. Replace
     * the slotted child's activation handlers while disabled, including capture
     * handlers, so disabled means inert regardless of composition order.
     */
    const guardedChildren =
      asChild && ariaDisabled && React.isValidElement<SlottedInteractionProps>(children)
        ? React.cloneElement(children, {
            onClick: stopDisabledActivation,
            onClickCapture: stopDisabledActivation,
            onKeyDown: (event) => {
              if (isActivationKey(event)) stopDisabledActivation(event);
              else children.props.onKeyDown?.(event);
            },
            onKeyDownCapture: (event) => {
              if (isActivationKey(event)) stopDisabledActivation(event);
              else children.props.onKeyDownCapture?.(event);
            },
          })
        : children;

    return (
      <Comp
        data-slot="button"
        data-size={resolvedSize}
        className={cn(buttonVariants({ variant, size: resolvedSize, className }))}
        ref={ref}
        disabled={asChild ? undefined : disabled}
        aria-disabled={ariaDisabled || ariaDisabledProp || undefined}
        onClick={ariaDisabled || onClick ? handleClick : undefined}
        onClickCapture={ariaDisabled || onClickCapture ? handleClickCapture : undefined}
        onKeyDown={ariaDisabled || onKeyDown ? handleKeyDown : undefined}
        onKeyDownCapture={ariaDisabled || onKeyDownCapture ? handleKeyDownCapture : undefined}
        {...props}
      >
        {guardedChildren}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button };
