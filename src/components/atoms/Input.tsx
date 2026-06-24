import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const inputVariants = cva(
  "flex h-10 w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/8 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      state: {
        default: "",
        invalid: "border-destructive/70 focus-visible:border-destructive focus-visible:ring-destructive/20",
      },
    },
    defaultVariants: { state: "default" },
  },
);

export interface InputProps extends React.ComponentProps<"input">, VariantProps<typeof inputVariants> {}

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
