import * as React from "react";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { Button } from "@/components/atoms/Button";
import { cn } from "@/lib/utils";

export const toastVariants = cva(
  "fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg",
  {
    variants: {
      variant: {
        success:
          "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]",
        error: "border-destructive/30 bg-destructive text-destructive-foreground",
        info: "border-border bg-card text-foreground",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

export interface ToastProps extends VariantProps<typeof toastVariants> {
  message: React.ReactNode;
  onClose?: () => void;
  /** @deprecated Use variant. */
  type?: "success" | "error" | "info";
}

export function Toast({ message, variant, type, onClose }: ToastProps) {
  const resolvedVariant = variant ?? type ?? "info";

  return (
    <div
      data-slot="toast"
      role={resolvedVariant === "error" ? "alert" : "status"}
      aria-live={resolvedVariant === "error" ? "assertive" : "polite"}
      className={cn(toastVariants({ variant: resolvedVariant }))}
    >
      <div className="min-w-0 flex-1 text-sm font-medium">{message}</div>
      {onClose && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Dismiss notification"
          onClick={onClose}
          className="-mr-2 -mt-1 h-7 w-7 shrink-0 text-current opacity-80 hover:bg-black/10 hover:text-current"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
