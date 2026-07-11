import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const nativeSelectVariants = cva(
  "h-11 w-full appearance-none rounded-[var(--wireline-radius-xl)] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] px-3.5 py-2 pr-10 text-base text-[var(--wireline-color-text-primary)] shadow-sm transition-colors focus-visible:outline-none focus-visible:border-[var(--wireline-color-focus-default)] focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)]/40 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      state: {
        default: "",
        invalid:
          "border-[var(--wireline-color-status-error)] focus-visible:border-[var(--wireline-color-status-error)] focus-visible:ring-[var(--wireline-color-feedback-error-surface)]",
      },
    },
    defaultVariants: { state: "default" },
  },
);

export interface NativeSelectProps
  extends React.ComponentProps<"select">, VariantProps<typeof nativeSelectVariants> {}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, state, children, "aria-invalid": ariaInvalid, ...props }, ref) => (
    <span className="relative block">
      <select
        ref={ref}
        data-slot="native-select"
        aria-invalid={ariaInvalid ?? (state === "invalid" ? true : undefined)}
        className={cn(nativeSelectVariants({ state }), className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
