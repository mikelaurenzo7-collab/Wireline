import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { motion } from "motion/react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
          "glass border border-white/10 text-ink/70 hover:text-ink hover:border-white/20 transition-all",
        // Chrome variant — white/10 dark-surface treatment for TopBar, Sidebar, and other
        // dark-chrome shells. Never use on cream/light backgrounds.
        chrome:
          "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20 hover:text-white/90 transition-colors",

        // Editorial — the highest-fidelity print-like button. Flat, zero-radius
        // (or very tight), rich depth via inner light + deep shadow. Use for
        // primary conversion moments where we want the button to feel like a
        // physical object on the page.
        editorial:
          "bg-gradient-to-b from-[#8B3FD6] to-[#6B2B99] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_2px_0_#3B154C,0_8px_18px_rgba(59,21,76,0.35)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_1px_0_#3B154C] border border-[#5A1F7A]/60",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
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
