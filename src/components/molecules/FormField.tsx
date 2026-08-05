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

type FieldControlProps = {
  id?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-disabled"?: React.AriaAttributes["aria-disabled"];
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-required"?: React.AriaAttributes["aria-required"];
};

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
  const generatedControlId = React.useId();
  const descriptionId = React.useId();
  const errorId = React.useId();
  const child = React.isValidElement<FieldControlProps>(children) ? children : null;
  const controlId = child?.props.id ?? htmlFor ?? generatedControlId;
  const existingDescribedBy = child?.props["aria-describedby"]?.trim();
  const describedBy = [
    existingDescribedBy || null,
    description ? descriptionId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");
  const isDisabled =
    child?.props.disabled === true ||
    child?.props["aria-disabled"] === true ||
    child?.props["aria-disabled"] === "true";
  const isRequired = required || child?.props.required === true;
  const ariaInvalid = error ? true : child?.props["aria-invalid"];
  const isInvalid = ariaInvalid === true || ariaInvalid === "true";

  const control = child
    ? React.cloneElement(child, {
        id: controlId,
        required: isRequired ? true : undefined,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": ariaInvalid,
        "aria-required": isRequired ? true : child.props["aria-required"],
      })
    : children;

  return (
    <div
      data-slot="form-field"
      data-disabled={isDisabled || undefined}
      data-invalid={isInvalid || undefined}
      className={cn(formFieldVariants({ density }), className)}
      {...props}
    >
      <label
        htmlFor={controlId}
        className={cn(
          "text-sm font-medium leading-none text-foreground",
          isDisabled && "cursor-not-allowed opacity-70",
        )}
      >
        {label}
        {isRequired && (
          <span aria-hidden="true" className="ml-1 text-destructive">
            *
          </span>
        )}
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
