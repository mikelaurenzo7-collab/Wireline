import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const skeletonVariants = cva("animate-pulse bg-muted", {
  variants: {
    shape: {
      default: "rounded-md",
      circle: "rounded-full",
      control: "rounded-[var(--radius-md)]",
      text: "h-4 rounded",
      surface: "rounded-[var(--radius-lg)]",
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
