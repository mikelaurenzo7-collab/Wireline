import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/utils";

export interface BrutalInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Optional id; auto-derived from `name` if not supplied. */
  id?: string;
}

/**
 * Brutalist input primitive. Wraps a native input in the standard label +
 * thick-bordered field used throughout the app. Pairs `aria-invalid` and
 * `aria-describedby` so screen readers actually surface validation errors —
 * something the inline-styled inputs were missing.
 */
export const BrutalInput = forwardRef<HTMLInputElement, BrutalInputProps>(function BrutalInput(
  { label, hint, error, id, name, className, ...rest },
  ref
) {
  const inputId = id ?? (name ? `field-${name}` : undefined);
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : rest["aria-describedby"];

  return (
    <div className="space-y-2">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[10px] font-black text-ink uppercase tracking-widest italic flex items-center gap-2"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "w-full p-4 border-2 border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
          "outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-[11px] bg-slate-50 transition-colors",
          error && "border-rose-500 bg-rose-50",
          className
        )}
        {...rest}
      />
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="text-[10px] font-black uppercase tracking-widest text-rose-500 italic"
        >
          {error}
        </p>
      )}
    </div>
  );
});
