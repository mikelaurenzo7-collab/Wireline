import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const skeletonVariants = cva("wl-skeleton", {
  variants: {
    shape: {
      default: "rounded-[var(--wireline-radius-md)]",
      circle: "rounded-full",
      control: "rounded-[var(--wireline-radius-md)]",
      text: "h-4 rounded-[var(--wireline-radius-sm)]",
      surface: "rounded-[var(--wireline-radius-lg)]",
      paper: "rounded-[var(--wireline-radius-xl)]",
    },
  },
  defaultVariants: {
    shape: "default",
  },
});

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof skeletonVariants> {}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, shape, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(skeletonVariants({ shape }), className)}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";

export { Skeleton };
