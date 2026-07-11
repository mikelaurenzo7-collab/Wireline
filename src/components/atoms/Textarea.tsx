import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const textareaVariants = cva(
  "flex min-h-24 w-full rounded-[var(--wireline-radius-xl)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3.5 py-2.5 text-base text-[var(--wireline-color-text-primary)] shadow-sm transition-colors placeholder:text-[var(--wireline-color-text-secondary)] focus-visible:outline-none focus-visible:border-[var(--wireline-color-focus-default)] focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)]/40 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      state: {
        default: "",
        invalid:
          "border-[var(--wireline-color-status-error)] focus-visible:border-[var(--wireline-color-status-error)] focus-visible:ring-[var(--wireline-color-feedback-error-surface)]/20",
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
  extends React.ComponentProps<"textarea">, VariantProps<typeof textareaVariants> {}

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
