# Wireline Shared UI Primitives

Framework: React 19 + TypeScript on Vite. Styling is Tailwind CSS 4 plus the project CSS token layers. Radix powers accessible interactive primitives; clsx, tailwind-merge, and CVA compose variants.

These are the principal shared atoms and molecules used across authenticated routes. Every listing below is the complete source file.

## Button
- File: src/components/atoms/Button.tsx
- Description: CVA-driven button with primary, secondary, ghost, danger, and icon treatments.

~~~tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

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
~~~

## Input
- File: src/components/atoms/Input.tsx
- Description: Shared text input with Wireline focus, disabled, and validation styling.

~~~tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const inputVariants = cva(
  "flex h-11 w-full rounded-[var(--wireline-radius-xl)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3.5 py-2 text-base text-[var(--wireline-color-text-primary)] shadow-sm transition-colors placeholder:text-[var(--wireline-color-text-secondary)] focus-visible:outline-none focus-visible:border-[var(--wireline-color-focus-default)] focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)]/40 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      state: {
        default: "",
        invalid:
          "border-[var(--wireline-color-status-error)]/70 focus-visible:border-[var(--wireline-color-status-error)] focus-visible:ring-[var(--wireline-color-feedback-error-surface)]/30",
      },
    },
    defaultVariants: { state: "default" },
  },
);

export interface InputProps
  extends React.ComponentProps<"input">, VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, state, "aria-invalid": ariaInvalid, ...props }, ref) => (
    <input
      ref={ref}
      data-slot="input"
      aria-invalid={ariaInvalid ?? (state === "invalid" ? true : undefined)}
      className={cn(inputVariants({ state }), className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
~~~

## Badge
- File: src/components/atoms/Badge.tsx
- Description: Compact status or category label with semantic variants.

~~~tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  // A badge is counts and one-word states; it never wraps internally. The
  // "Not connected" state wrapped to two lines inside the 340px Salesforce
  // summary card and collided with the card title.
  "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--wireline-color-surface-subtle)] text-[var(--wireline-color-text-primary)]",
        success:
          "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]",
        warning:
          "border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)] text-[var(--wireline-color-status-warning)]",
        destructive:
          "border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)] text-[var(--wireline-color-status-error)]",
        info: "border-[var(--wireline-color-feedback-info-border)] bg-[var(--wireline-color-feedback-info-surface)] text-[var(--wireline-color-status-info)]",
        outline:
          "border-[var(--wireline-color-border-default)] bg-transparent text-[var(--wireline-color-text-primary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge };
~~~

## NativeSelect
- File: src/components/atoms/NativeSelect.tsx
- Description: Styled native select for forms that need browser-native behavior.

~~~tsx
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const nativeSelectVariants = cva(
  "h-11 w-full appearance-none rounded-[var(--wireline-radius-xl)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3.5 py-2 pr-10 text-base text-[var(--wireline-color-text-primary)] shadow-sm transition-colors focus-visible:outline-none focus-visible:border-[var(--wireline-color-focus-default)] focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)]/40 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      state: {
        default: "",
        invalid:
          "border-[var(--wireline-color-status-error)] focus-visible:border-[var(--wireline-color-status-error)] focus-visible:ring-[var(--wireline-color-feedback-error-surface)]",
      },
    },
    defaultVariants: { state: "default" },
  },
);

export interface NativeSelectProps
  extends React.ComponentProps<"select">, VariantProps<typeof nativeSelectVariants> {}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, state, children, "aria-invalid": ariaInvalid, ...props }, ref) => (
    <span className="relative block">
      <select
        ref={ref}
        data-slot="native-select"
        aria-invalid={ariaInvalid ?? (state === "invalid" ? true : undefined)}
        className={cn(nativeSelectVariants({ state }), className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
~~~

## Switch
- File: src/components/atoms/Switch.tsx
- Description: Radix switch with semantic checked and focus states.

~~~tsx
import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const switchVariants = cva(
  "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
  {
    variants: {
      size: {
        default: "h-6 w-11",
        sm: "h-5 w-9",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export const switchThumbVariants = cva(
  "pointer-events-none block rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
  {
    variants: {
      size: {
        default: "h-5 w-5",
        sm: "h-4 w-4 data-[state=checked]:translate-x-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface SwitchProps
  extends
    React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
    VariantProps<typeof switchVariants> {}

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, SwitchProps>(
  ({ className, size, ...props }, ref) => (
    <SwitchPrimitives.Root
      ref={ref}
      data-slot="switch"
      className={cn(switchVariants({ size, className }))}
      {...props}
    >
      <SwitchPrimitives.Thumb
        data-slot="switch-thumb"
        className={cn(switchThumbVariants({ size }))}
      />
    </SwitchPrimitives.Root>
  ),
);
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
~~~

## Dialog
- File: src/components/atoms/Dialog.tsx
- Description: Accessible Radix modal composition and shared dialog subcomponents.

~~~tsx
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const dialogContentVariants = cva(
  "fixed grid duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  {
    variants: {
      presentation: {
        modal:
          "wl-panel glass-xl left-[50%] top-[50%] z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-5 overflow-y-auto overscroll-contain rounded-xl border p-5 shadow-[var(--wireline-elevation-lg)] data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:p-6",
        navigation:
          "inset-x-0 bottom-0 top-16 z-[70] w-auto max-w-none gap-0 overflow-y-auto rounded-none border-x-0 border-b-0 border-t border-border bg-[var(--wireline-color-canvas-default)] p-0 shadow-none data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0",
        drawer:
          "inset-x-0 bottom-0 z-[70] max-h-[min(70dvh,40rem)] w-auto max-w-none gap-0 overflow-y-auto rounded-t-[var(--radius-xl)] border border-b-0 border-x-0 border-border bg-[var(--wireline-color-surface-default)] p-0 pb-[env(safe-area-inset-bottom)] shadow-[var(--wireline-elevation-lg)] data-[state=closed]:slide-out-to-bottom-0 data-[state=open]:slide-in-from-bottom-0",
        sidebar:
          "inset-y-0 left-0 z-[70] h-[100dvh] w-[min(84vw,20rem)] max-w-none gap-0 overflow-y-auto rounded-none border-y-0 border-l-0 border-r border-border bg-[var(--wireline-color-surface-default)] p-0 pb-[env(safe-area-inset-bottom)] shadow-[18px_0_44px_-28px_rgba(17,17,17,0.34)] data-[state=closed]:slide-out-to-left-0 data-[state=open]:slide-in-from-left-0",
      },
    },
    defaultVariants: {
      presentation: "modal",
    },
  },
);

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants> & {
    /** Allows a route-level dialog to tune its backdrop without reimplementing portal behavior. */
    overlayClassName?: string;
    /** Use a route-owned close control when a modal has persistent chrome. */
    showClose?: boolean;
  };

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, overlayClassName, presentation, showClose = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      data-slot="dialog-content"
      data-presentation={presentation ?? "modal"}
      /* `wl-cased` marks a subtree as belonging to the case system.
       *
       * Radix portals this content to `document.body`, which makes it a sibling
       * of the app shell rather than a descendant — so every cased tier, all of
       * which are scoped under a marker class, missed every modal in the
       * product. Measured with the same markup in both positions: a
       * `[data-slot="dialog-title"]` renders `uppercase` inside the marker and
       * `none` portalled; a `<label>` loses the label tracking (1.44px -> the
       * default) and a `<button>` the control tracking.
       *
       * It has to be `wl-cased` and not `wl-ui-caps`. The shell class is not a
       * neutral marker: `foundation.css` gives it `position: relative`,
       * `height: 100%`, `min-height: 100dvh` and `overflow: hidden` as the app's
       * layout root. Putting that on a portalled dialog overrode its `fixed`
       * positioning, stretched it to the full viewport, and killed its own
       * scroll — measured landing the panel at y=900 on a 900px viewport,
       * entirely below the fold. `wl-cased` carries the case tiers and the
       * `--wl-caps-*` custom properties they read, and nothing else. */
      className={cn("wl-cased", dialogContentVariants({ presentation }), className)}
      {...props}
    >
      {children}
      {showClose ? (
        <DialogPrimitive.Close className="absolute right-2 top-2 grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn("flex flex-col space-y-2 text-left", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    data-slot="dialog-title"
    className={cn(
      "break-words pr-14 text-left font-[var(--wireline-font-family-display)] text-xl font-semibold leading-[1.15] tracking-[-.025em] text-foreground",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    data-slot="dialog-description"
    className={cn(
      "max-w-prose break-words text-left text-[15px] leading-6 text-[var(--wireline-color-text-secondary)]",
      className,
    )}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogOverlay,
  DialogPortal,
};
~~~

## Card
- File: src/components/molecules/Card.tsx
- Description: Composable panel surface with header, body, footer, and interactive variants.

~~~tsx
import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A reusable content surface with stable regions for title, description,
 * body, and actions. It owns the recurring panel treatment while allowing
 * feature components to retain domain-specific layout through className.
 */
export const cardVariants = cva(
  "rounded-[var(--wireline-radius-lg)] text-[var(--wireline-color-text-primary)] wl-transition-press",
  {
    variants: {
      elevation: {
        "0": "border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] rounded-[var(--wireline-radius-md)]",
        "1": "border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] shadow-[var(--wireline-elevation-sm),var(--wireline-elevation-inset)]",
        "2": "border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] shadow-[var(--wireline-elevation-md),var(--wireline-elevation-insetRaised)]",
        "3": "border border-[var(--wireline-color-border-strong)] bg-[var(--wireline-color-surface-default)] rounded-[var(--wireline-radius-xl)] shadow-[var(--wireline-elevation-md),var(--wireline-elevation-insetRaised)]",
        paper:
          "border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] rounded-[var(--wireline-radius-xl)] shadow-[var(--wireline-elevation-sm),var(--wireline-elevation-inset)]",
        recessed:
          "border border-[var(--wireline-color-border-soft)] bg-[var(--wireline-color-surface-recessed)] shadow-[inset_0_2px_6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,248,232,0.03)]",
        glow: "border border-[var(--wireline-color-border-strong)] bg-[var(--wireline-color-surface-default)] rounded-[var(--wireline-radius-xl)] shadow-[var(--wireline-elevation-wirelineRing),var(--wireline-elevation-insetRaised)]",
        wire: "border border-[color-mix(in_srgb,var(--wireline-color-action-secondary-default)_32%,transparent)] bg-[var(--wireline-color-surface-default)] rounded-[var(--wireline-radius-xl)] shadow-[var(--wireline-elevation-wireGlow),var(--wireline-elevation-inset)]",
      },
    },
    defaultVariants: {
      elevation: "1",
    },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  /** Applies the established low-lift hover affordance for click-through cards. */
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation, interactive = false, ...props }, ref) => {
    const sharedProps = {
      "data-elevation": elevation ?? "1",
      className: cn(cardVariants({ elevation, className })),
    };

    if (interactive) {
      const MotionDiv = motion.div as React.ComponentType<
        HTMLMotionProps<"div"> & React.RefAttributes<HTMLDivElement>
      >;

      return (
        <MotionDiv
          ref={ref}
          data-slot="card"
          whileHover={{
            y: -1,
            transition: { type: "spring", stiffness: 380, damping: 28 },
          }}
          {...sharedProps}
          {...(props as HTMLMotionProps<"div">)}
        />
      );
    }

    return <div ref={ref} data-slot="card" {...sharedProps} {...props} />;
  },
);
Card.displayName = "Card";

const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="card-header"
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
);
CardHeader.displayName = "CardHeader";

/**
 * Intentionally remains a div: consumers choose their own heading level and
 * the compatibility implementation historically rendered a div here.
 */
const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="card-title"
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
);
CardTitle.displayName = "CardTitle";

const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p
    data-slot="card-description"
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
);
CardDescription.displayName = "CardDescription";

const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-slot="card-content" className={cn("p-6 pt-0", className)} {...props} />
);
CardContent.displayName = "CardContent";

const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-slot="card-footer" className={cn("flex items-center p-6 pt-0", className)} {...props} />
);
CardFooter.displayName = "CardFooter";

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
~~~

## FormField
- File: src/components/molecules/FormField.tsx
- Description: Label, help, validation, and control wrapper used by forms.

~~~tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const formFieldVariants = cva("grid gap-1.5", {
  variants: {
    density: {
      default: "gap-1.5",
      compact: "gap-1",
    },
  },
  defaultVariants: {
    density: "default",
  },
});

export interface FormFieldProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof formFieldVariants> {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}

type FieldControlProps = {
  id?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-disabled"?: React.AriaAttributes["aria-disabled"];
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-required"?: React.AriaAttributes["aria-required"];
};

function isAriaTrue(value: boolean | "true" | "false" | undefined): boolean {
  return value === true || value === "true";
}

function isAriaInvalid(value: React.AriaAttributes["aria-invalid"]): boolean {
  return value !== undefined && value !== false && value !== "false";
}

function splitIdRefs(value: string | undefined): string[] {
  return value?.trim().split(/\s+/).filter(Boolean) ?? [];
}

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required = false,
  density,
  className,
  children,
  ...props
}: FormFieldProps) {
  const generatedControlId = React.useId();
  const descriptionId = React.useId();
  const errorId = React.useId();
  const child = React.isValidElement<FieldControlProps>(children) ? children : null;
  const controlId = child?.props.id ?? htmlFor ?? generatedControlId;
  const existingDescriptionIds = splitIdRefs(child?.props["aria-describedby"]);
  const describedBy = Array.from(
    new Set([
      ...existingDescriptionIds,
      ...(description ? [descriptionId] : []),
      ...(error ? [errorId] : []),
    ]),
  ).join(" ");
  const isDisabled =
    child?.props.disabled === true || isAriaTrue(child?.props["aria-disabled"]);
  const nativeRequired = required || child?.props.required === true;
  const isRequired = nativeRequired || isAriaTrue(child?.props["aria-required"]);
  const ariaInvalid = error ? true : child?.props["aria-invalid"];
  const isInvalid = isAriaInvalid(ariaInvalid);

  const control = child
    ? React.cloneElement(child, {
        id: controlId,
        required: nativeRequired ? true : child.props.required,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": ariaInvalid,
        "aria-required": isRequired ? true : child.props["aria-required"],
      })
    : children;

  return (
    <div
      data-slot="form-field"
      data-disabled={isDisabled || undefined}
      data-invalid={isInvalid || undefined}
      data-required={isRequired || undefined}
      className={cn(formFieldVariants({ density }), className)}
      {...props}
    >
      <label
        htmlFor={controlId}
        className={cn(
          "text-sm font-medium leading-none text-foreground",
          isDisabled && "cursor-not-allowed opacity-70",
        )}
      >
        {label}
        {isRequired && (
          <span aria-hidden="true" className="ml-1 text-destructive">
            *
          </span>
        )}
      </label>
      {description && (
        <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {control}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
~~~

## MetricCard
- File: src/components/molecules/MetricCard.tsx
- Description: Operational metric panel with trend and state presentation.

~~~tsx
import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const metricCardVariants = cva(
  "wl-panel flex min-w-0 flex-col gap-3 rounded-xl border p-4",
  {
    variants: {
      tone: {
        default: "border-border bg-card",
        positive:
          "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)]",
        warning:
          "border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)]",
        danger:
          "border-[var(--wireline-color-feedback-error-border)] bg-[var(--wireline-color-feedback-error-surface)]",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

export interface MetricCardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof metricCardVariants> {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  footer?: React.ReactNode;
}

export function MetricCard({
  label,
  value,
  delta,
  trend = "neutral",
  icon,
  footer,
  tone,
  className,
  ...props
}: MetricCardProps) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendClass =
    trend === "up"
      ? "text-[var(--wireline-color-status-success)]"
      : trend === "down"
        ? "text-[var(--wireline-color-status-error)]"
        : "text-muted-foreground";

  return (
    <section
      data-slot="metric-card"
      className={cn(metricCardVariants({ tone }), "transition-colors", className)}
      {...props}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] font-medium tracking-[0.005em] text-muted-foreground">
          {label}
        </p>
        {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
      </div>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <output className="min-w-0 truncate text-[26px] font-semibold tracking-[-0.025em] text-foreground tabular-nums">
          {value}
        </output>
        {delta ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
              trendClass,
            )}
          >
            <TrendIcon aria-hidden="true" className="h-3.5 w-3.5" />
            {delta}
          </span>
        ) : null}
      </div>
      {footer ? (
        <div className="border-t border-border/70 pt-2.5 text-[12px] text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
~~~
