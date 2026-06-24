import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A reusable content surface with stable regions for title, description,
 * body, and actions. It owns the recurring panel treatment while allowing
 * feature components to retain domain-specific layout through className.
 */
export const cardVariants = cva("rounded-md text-card-foreground", {
  variants: {
    elevation: {
      "0": "border border-border bg-card",
      "1": "wl-panel",
      "2": "wl-panel shadow-md",
      "3": "wl-panel-elevated",
      glow: "wl-panel-elevated",
    },
  },
  defaultVariants: {
    elevation: "1",
  },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  /** Applies the established low-lift hover affordance for click-through cards. */
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation, interactive = false, ...props }, ref) => {
    const sharedProps = {
      "data-slot": "card",
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
          whileHover={{
            y: -1,
            transition: { type: "spring", stiffness: 380, damping: 28 },
          }}
          {...sharedProps}
          {...(props as HTMLMotionProps<"div">)}
        />
      );
    }

    return <div ref={ref} {...sharedProps} {...props} />;
  },
);
Card.displayName = "Card";

const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-slot="card-header" className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
);
CardHeader.displayName = "CardHeader";

const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 data-slot="card-title" className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
);
CardTitle.displayName = "CardTitle";

const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
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

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
