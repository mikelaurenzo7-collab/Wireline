import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const skeletonVariants = cva("animate-pulse bg-muted", {
  variants: {
    shape: {
      text: "rounded-[var(--radius-sm)]",
      control: "rounded-[var(--radius-md)]",
      surface: "rounded-[var(--radius-lg)]",
      circular: "rounded-full",
    },
    tone: {
      default: "bg-muted",
      subtle: "bg-secondary",
    },
  },
  defaultVariants: {
    shape: "control",
    tone: "default",
  },
});

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, shape, tone, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(skeletonVariants({ shape, tone }), className)}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";
