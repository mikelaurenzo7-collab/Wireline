import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] border text-sm font-semibold leading-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground shadow-[0_8px_18px_-15px_rgba(67,35,177,0.58)] hover:border-[color:var(--wl-accent-hover)] hover:bg-[color:var(--wl-accent-hover)] active:translate-y-px",
        secondary:
          "border-border bg-card text-foreground shadow-[var(--wl-shadow-sm)] hover:border-[color:var(--wl-line-strong)] hover:bg-secondary active:translate-y-px",
        outline:
          "border-border bg-transparent text-foreground hover:border-primary/45 hover:bg-secondary active:translate-y-px",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-secondary active:translate-y-px",
        destructive:
          "border-[var(--wl-error)] bg-[var(--wl-error)] text-white shadow-[var(--wl-shadow-sm)] hover:brightness-95 active:translate-y-px",
        link: "min-h-0 border-transparent bg-transparent px-0 py-0 text-primary hover:text-[color:var(--wl-accent-hover)] hover:underline underline-offset-4",
      },
      size: {
        xs: "min-h-8 gap-1.5 px-2.5 text-xs",
        sm: "min-h-9 px-3 text-sm",
        md: "min-h-10 px-4 text-sm",
        lg: "min-h-11 px-5 text-base",
        icon: "size-10 min-h-10 min-w-10 p-0",
        "icon-sm": "size-8 min-h-8 min-w-8 p-0",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "disabled">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  disabled?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, loading = false, disabled = false, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
      <span className={cn(loading && "opacity-75")}>{children}</span>
    </button>
  ),
);
Button.displayName = "Button";
