import * as React from "react";
import { Skeleton as CanonicalSkeleton, type SkeletonProps as CanonicalSkeletonProps } from "../../atoms/Skeleton";

export interface SkeletonProps extends Omit<CanonicalSkeletonProps, "shape"> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <CanonicalSkeleton
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading"
      aria-hidden={undefined}
      className={className}
      {...props}
    />
  );
}

export { Skeleton };
