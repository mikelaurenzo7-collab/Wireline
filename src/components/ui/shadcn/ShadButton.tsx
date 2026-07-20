import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { motion } from "motion/react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../../lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.1)] hover:from-primary/95 hover:to-primary/85 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_8px_rgba(0,0,0,0.15)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] border border-primary/20",
        destructive:
          "bg-gradient-to-b from-destructive to-destructive/90 text-destructive-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.1)] hover:from-destructive/95 hover:to-destructive/85 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_8px_rgba(0,0,0,0.15)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] border border-destructive/20",
        outline:
          "border border-input bg-gradient-to-b from-background to-background/95 shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-primary/40 hover:shadow-md active:shadow-sm",
        secondary:
          "bg-gradient-to-b from-secondary to-secondary/80 text-secondary-foreground shadow-sm hover:from-secondary/90 hover:to-secondary/70 hover:shadow-md border border-secondary/20 active:shadow-sm",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline",
        // Glass variant — translucent cream surface for icon/action buttons on glass cards and modals.
        // Keeps the frosted-glass aesthetic without re-implementing it ad-hoc.
        glass:
          "wl-panel border border-white/10 text-ink/70 hover:text-ink hover:border-white/30 hover:shadow-lg transition-all active:scale-[0.98]",
        // Chrome variant — white/10 dark-surface treatment for TopBar, Sidebar, and other
        // dark-chrome shells. Never use on cream/light backgrounds.
        chrome:
          "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/30 hover:text-white transition-colors active:scale-[0.98]",

        // Editorial — the highest-fidelity print-like button. Flat, zero-radius
        // (or very tight), rich depth via inner light + deep shadow. Use for
        // primary conversion moments where we want the button to feel like a
        // physical object on the page.
        editorial:
          "bg-gradient-to-b from-[#8B3FD6] to-[#6B2B99] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_0_#3B154C,0_8px_18px_rgba(59,21,76,0.35)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_0_#3B154C,0_12px_24px_rgba(59,21,76,0.45)] hover:from-[#9B4BE6] hover:to-[#7B31A9] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_1px_0_#3B154C] border border-[#5A1F7A]/60",
      },
      size: {
        // Premium density: compact visual heights with invisible hit-area expansion.
        // Visual: 36px (h-9), hit-target: 44px via ::after pseudo-element.
        default:
          "h-9 px-4 py-2 after:content-[''] after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 after:min-h-[44px] after:h-full",
        // Secondary compact: 32px visual, 44px hit area.
        sm: "h-8 rounded-md px-3 text-xs after:content-[''] after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 after:min-h-[44px] after:h-full",
        lg: "h-10 rounded-md px-8",
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
  ({ className, variant, size, asChild = false, disableAnimations = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    // If animations are disabled or we're using Slot, use a regular button
    if (disableAnimations || asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
      );
    }

    // Cast to avoid motion/react type complexity with ButtonHTMLAttributes
    const MotionButton = motion.button as React.ComponentType<
      Omit<
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
      > & {
        whileHover?: object;
        whileTap?: object;
        transition?: object;
      } & React.RefAttributes<HTMLButtonElement>
    >;

    // Premium micro-interactions — spring physics for buttery smoothness
    return (
      <MotionButton
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 25,
        }}
        {...props}
      />
    );
  },
);
ShadButton.displayName = "ShadButton";

export { ShadButton, buttonVariants };
