import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../../lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold tracking-normal touch-press transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-black hover:shadow-md",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md",
        outline:
          "border border-input bg-background text-foreground shadow-sm hover:border-foreground/45 hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-md",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary font-semibold underline-offset-4 hover:underline",
        // Retained for compatibility with legacy action surfaces. The visual is
        // intentionally neutral and high-contrast rather than decorative.
        glass:
          "wl-panel border border-border bg-background text-foreground hover:border-foreground/35 hover:bg-accent transition-colors",
        chrome:
          "border border-black bg-[#1d1d1f] text-white shadow-sm hover:bg-black hover:text-white transition-colors",
        editorial:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_0_#000,0_8px_18px_rgba(29,29,31,0.18)] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_1px_0_#000] border border-primary/80",
      },
      size: {
        default:
          "h-9 px-4 py-2 after:content-[''] after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 after:min-h-[44px] after:h-full",
        sm: "h-8 px-3 text-xs after:content-[''] after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 after:min-h-[44px] after:h-full",
        lg: "h-10 px-8",
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
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
ShadButton.displayName = "ShadButton";

export { ShadButton, buttonVariants };
