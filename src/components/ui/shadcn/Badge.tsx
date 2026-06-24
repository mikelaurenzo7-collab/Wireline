import * as React from "react";
import { Badge as CanonicalBadge, type BadgeProps as CanonicalBadgeProps } from "../../atoms/Badge";

type LegacyVariant = "default" | "secondary" | "destructive" | "outline";

export interface BadgeProps extends Omit<CanonicalBadgeProps, "variant"> {
  variant?: LegacyVariant;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ variant = "default", ...props }, ref) => {
  const canonicalVariant = variant === "secondary" ? "default" : variant;
  return <CanonicalBadge ref={ref} variant={canonicalVariant} {...props} />;
});

Badge.displayName = "Badge";

export { Badge };
