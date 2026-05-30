import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Medallion } from "./Medallion";
import { SectionHeader } from "./SectionHeader";

interface Action {
  label: string;
  to?: string;
  onClick?: () => void;
  primary?: boolean;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: Action[];
  className?: string;
  /** Show the signature brand halo behind the medallion */
  withHalo?: boolean;
}

/**
 * EmptyState — the canonical empty / idle / no-data pattern for the Aurora Cream system.
 * Use this everywhere instead of ad-hoc empty states.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  className,
  withHalo = true,
}: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center py-12 text-center px-6", className)}
    >
      <Medallion withHalo={withHalo} size="md" className="mb-5">
        <Icon className="w-6 h-6" />
      </Medallion>

      <SectionHeader
        eyebrow="No data yet"
        title={title}
        description={description}
        className="max-w-sm"
      />

      {actions.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {actions.map((action, index) => {
            const commonClasses =
              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-[0.985]";

            if (action.to) {
              return (
                <a
                  key={index}
                  href={action.to}
                  className={cn(
                    commonClasses,
                    action.primary
                      ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20"
                      : "glass border border-black/10 hover:border-brand/30",
                  )}
                >
                  {action.label}
                </a>
              );
            }

            return (
              <button
                key={index}
                onClick={action.onClick}
                className={cn(
                  commonClasses,
                  action.primary
                    ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20"
                    : "glass border border-black/10 hover:border-brand/30",
                )}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
