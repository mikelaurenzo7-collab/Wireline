import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface AppPageIntroProps {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * In-app page header when a route does not use PageShell (e.g. Command Center).
 * Matches PageShell editorial hierarchy: eyebrow → display title → caption.
 */
export default function AppPageIntro({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: AppPageIntroProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 pb-2 md:pb-3", className)}>
      <div className="min-w-0 flex-1 sm:max-w-2xl">
        {eyebrow && <p className="text-eyebrow text-brand mb-1">{eyebrow}</p>}
        <h1 className="page-title-aurora font-display italic text-xl sm:text-2xl md:text-[1.65rem] leading-tight tracking-tight text-balance">
          {title}
        </h1>
        {subtitle && <div className="mt-1.5 text-caption max-w-2xl text-pretty">{subtitle}</div>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
