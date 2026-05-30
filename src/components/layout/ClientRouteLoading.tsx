/** Branded loading shell for full-height app routes. */

import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

type Props = {
  icon: ReactNode;

  label?: string;

  className?: string;
};

export default function ClientRouteLoading({ icon, label = "Loading…", className }: Props) {
  return (
    <div
      className={cn("flex flex-1 items-center justify-center min-h-[40vh]", className)}
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <span
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-[1.8] animate-pulse"
          />

          <span
            aria-hidden
            className="absolute -inset-3 rounded-full border border-brand/20 animate-[spin_8s_linear_infinite]"
          />

          <div className="relative">{icon}</div>
        </div>

        <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted animate-pulse">
          {label}
        </span>
      </div>
    </div>
  );
}
