import React from "react";
import { cn } from "../../lib/utils";

interface MedallionProps {
  children: React.ReactNode;
  className?: string;
  /** Show the soft brand halo behind the medallion */
  withHalo?: boolean;
  /** Size preset — default is the 14x14 used in empty states */
  size?: "sm" | "md" | "lg";
}

/**
 * Medallion — the signature gradient icon container used throughout the Aurora Cream system.
 * Use for empty states, section headers, identity markers, and status indicators.
 */
export function Medallion({
  children,
  className,
  withHalo = false,
  size = "md",
}: MedallionProps) {
  const sizeClasses = {
    sm: "w-9 h-9",
    md: "w-14 h-14",
    lg: "w-16 h-16",
  }[size];

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      {withHalo && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
        />
      )}
      <div
        className={cn(
          "rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand flex items-center justify-center shadow-sm shadow-brand/25",
          sizeClasses,
        )}
      >
        {children}
      </div>
    </div>
  );
}
