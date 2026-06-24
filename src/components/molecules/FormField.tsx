import * as React from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required = false,
  children,
  className,
}: FormFieldProps) {
  const descriptionId = htmlFor && description ? `${htmlFor}-description` : undefined;
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </label>
      {description ? (
        <p id={descriptionId} className="text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="text-sm font-medium leading-5 text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
