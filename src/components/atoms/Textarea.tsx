import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const textareaVariants = cva(
  "flex min-h-24 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/8 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      state: {
        default: "",
        invalid: "border-[var(--wl-error)] focus-visible:border-[var(--wl-error)] focus-visible:ring-[color-mix(in_srgb,var(--wl-error)_20%,transparent)]",
      },
      resize: {
        none: "resize-none",
        vertical: "resize-y",
      },
    },
    defaultVariants: {
      state: "default",
      resize: "vertical",
    },
  },
);

export interface TextareaProps
  extends React.ComponentProps<"textarea">,
    VariantProps<typeof textareaVariants> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, state, resize, "aria-invalid": ariaInvalid, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      aria-invalid={ariaInvalid ?? (state === "invalid" ? true : undefined)}
      className={cn(textareaVariants({ state, resize }), className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
