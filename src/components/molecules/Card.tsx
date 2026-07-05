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
