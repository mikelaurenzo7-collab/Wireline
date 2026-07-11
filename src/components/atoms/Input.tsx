import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const inputVariants = cva(
  "flex h-11 w-full rounded-[var(--wireline-radius-xl)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3.5 py-2 text-base text-[var(--wireline-color-text-primary)] shadow-sm transition-colors placeholder:text-[var(--wireline-color-text-secondary)] focus-visible:outline-none focus-visible:border-[var(--wireline-color-focus-default)] focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)]/40 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      state: {
        default: "",
        invalid:
          "border-[var(--wireline-color-status-error)]/70 focus-visible:border-[var(--wireline-color-status-error)] focus-visible:ring-[var(--wireline-color-feedback-error-surface)]/30",
      },
    },
    defaultVariants: { state: "default" },
  },
);

export interface InputProps
  extends React.ComponentProps<"input">, VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, state, "aria-invalid": ariaInvalid, ...props }, ref) => (
    <input
      ref={ref}
      data-slot="input"
      aria-invalid={ariaInvalid ?? (state === "invalid" ? true : undefined)}
      className={cn(inputVariants({ state }), className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
