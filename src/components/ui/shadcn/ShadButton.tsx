import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../../lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold tracking-wider touch-press transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-primary/30",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-md",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Glass variant — translucent cream surface for icon/action buttons on glass cards and modals.
        // Keeps the frosted-glass aesthetic without re-implementing it ad-hoc.
        glass:
          "wl-panel border border-white/10 text-foreground/70 hover:text-foreground hover:border-white/20 transition-all",
        // Chrome variant — white/10 dark-surface treatment for TopBar, Sidebar, and other
        // dark-chrome shells. Never use on cream/light backgrounds.
        chrome:
          "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20 hover:text-white/90 transition-colors",

        // Editorial — the highest-fidelity button. Rich depth via inner light +
        // deep shadow, tinted to the Midnight iris accent.
        editorial:
          "bg-brand text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_0_#3a4ba8,0_8px_18px_rgba(85,112,230,0.35)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_1px_0_#3a4ba8] border border-brand-deep/60",
      },
      size: {
        // Premium density: compact visual heights with invisible hit-area expansion.
        // Visual: 36px (h-9), hit-target: 44px via ::after pseudo-element.
        default:
          "h-9 px-4 py-2 after:content-[''] after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 after:min-h-[44px] after:h-full",
        // Secondary compact: 32px visual, 44px hit area.
        sm: "h-8 px-3 text-xs after:content-[''] after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 after:min-h-[44px] after:h-full",
        lg: "h-10 px-8",
        // Icon: 20px visual icon within 36px visual button, 44px hit area.
        icon: "h-9 w-9 [&_svg]:size-5 after:content-[''] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:min-h-[44px] after:min-w-[44px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ShadButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  disableAnimations?: boolean;
}

const ShadButton = React.forwardRef<HTMLButtonElement, ShadButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      disableAnimations: _disableAnimations = false,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    // touch-press class handles the physics zero-latency natively
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
ShadButton.displayName = "ShadButton";

export { ShadButton, buttonVariants };
