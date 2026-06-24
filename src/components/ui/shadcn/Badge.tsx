import * as React from "react";
import {
  Badge as CanonicalBadge,
  type BadgeProps as CanonicalBadgeProps,
} from "../../atoms/Badge";

type LegacyBadgeVariant = "default" | "secondary" | "destructive" | "outline";

export interface BadgeProps extends Omit<CanonicalBadgeProps, "variant"> {
  /** Compatibility mapping while legacy call sites migrate to semantic states. */
  variant?: LegacyBadgeVariant;
}

const variantMap: Record<LegacyBadgeVariant, NonNullable<CanonicalBadgeProps["variant"]>> = {
  default: "default",
  secondary: "default",
  destructive: "destructive",
  outline: "outline",
};

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ variant = "default", ...props }, ref) => (
  <CanonicalBadge ref={ref} variant={variantMap[variant]} {...props} />
));
Badge.displayName = "Badge";

export { Badge };
