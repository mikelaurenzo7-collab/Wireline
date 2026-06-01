/** Branded loading shell for full-height app routes.
 *  Wave 4 experiential enrichment: richer aurora poetry, new motion language,
 *  paper tactility, and velvet dark support.
 */

import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Medallion } from "../ui/Medallion";

type Props = {
  icon: ReactNode;
  label?: string;
  className?: string;
};

export default function ClientRouteLoading({ icon, label = "Loading…", className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-center min-h-[40vh] paper-texture",
        className,
      )}
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          {/* Soft aurora halo — uses new elevated glow language */}
          <span
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full bg-brand/25 blur-3xl scale-[2.2] animate-[pulse_3.2s_ease-in-out_infinite]"
          />

          {/* Slow crystalline orbit — refined with editorial ease */}
          <span
            aria-hidden
            className="absolute -inset-4 rounded-full border border-brand/15 animate-[spin_12s_var(--ease-editorial)_infinite]"
          />

          {/* Inner specular ring for gem depth */}
          <span
            aria-hidden
            className="absolute -inset-1.5 rounded-full border border-white/10 dark:border-white/5"
          />

          <Medallion size="lg" withHalo={false} shimmer>
            {icon}
          </Medallion>
        </div>

        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted/70 animate-pulse">
          {label}
        </span>
      </div>
    </div>
  );
}
