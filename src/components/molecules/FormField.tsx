import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const formFieldVariants = cva("grid gap-1.5", {
  variants: {
    density: {
      default: "gap-1.5",
      compact: "gap-1",
    },
  },
  defaultVariants: {
    density: "default",
  },
});

export interface FormFieldProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof formFieldVariants> {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required = false,
  density,
  className,
  children,
  ...props
}: FormFieldProps) {
  const descriptionId = React.useId();
  const errorId = React.useId();
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div data-slot="form-field" className={cn(formFieldVariants({ density }), className)} {...props}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {required && <span aria-hidden="true" className="ml-1 text-destructive">*</span>}
      </label>
      {description && (
        <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {control}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
