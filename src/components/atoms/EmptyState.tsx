/**
 * EmptyState atom — re-exports canonical `ui/EmptyState`.
 * Polish primitives: wl-empty, wl-eyebrow, wl-empty__icon (letterpress layer).
 */
import { cva, type VariantProps } from "class-variance-authority";

export const emptyStateVariants = cva("wl-empty wl-press-highlight", {
  variants: {
    density: {
      default: "py-8",
      compact: "py-4",
      hero: "py-12 min-h-[18rem]",
    },
  },
  defaultVariants: {
    density: "default",
  },
});

export type { EmptyStateProps } from "../ui/EmptyState";
export { EmptyState } from "../ui/EmptyState";

export type { VariantProps };
