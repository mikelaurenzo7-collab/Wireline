import * as React from "react";
import { motion, HTMLMotionProps } from "motion/react";
import { cn } from "../../../lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Elevation level — uses the new editorial shadow system */
  elevation?: "0" | "1" | "2" | "3" | "glow";
  /** Enable refined hover lift (uses luxury spring) */
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation = "1", interactive = false, ...props }, ref) => {
    const elevClass = `elev-${elevation}`;

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
          className={cn(
            "rounded-lg border bg-card text-card-foreground cursor-pointer transition-all duration-200 wl-card-shine",
            elevClass,
            className,
          )}
          {...(props as HTMLMotionProps<"div">)}
        />
      );
    }

    return (
      <div
        ref={ref}
        className={cn("rounded-lg border bg-card text-card-foreground", elevClass, className)}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
);
CardHeader.displayName = "CardHeader";

const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
);
CardTitle.displayName = "CardTitle";

const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-sm text-muted-foreground", className)} {...props} />
);
CardDescription.displayName = "CardDescription";

const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-6 pt-0", className)} {...props} />
);
CardContent.displayName = "CardContent";

const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
