import React from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

/**
 * Button — primary gradient button matching the Aurora Cream system.
 * Use `variant="primary"` for the main CTAs, `secondary` for outlined actions.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium transition-all active:scale-[0.985] disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary:
      "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20 hover:opacity-95",
    secondary:
      "glass border border-black/10 hover:border-brand/30 text-ink",
    ghost:
      "text-muted hover:text-ink hover:bg-black/5",
  };

  const sizes = {
    sm: "h-9 px-4 text-sm rounded-lg",
    md: "h-11 px-6 text-sm rounded-xl",
    lg: "h-12 px-8 text-base rounded-2xl",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
