/** Branded loading shell for full-height app routes — instrument-grade calm. */

import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Medallion } from "../ui/Medallion";
import { SignalOrbFrame } from "../ui/SignalOrbFrame";

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
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-5">
        <SignalOrbFrame size="md" withBloom refined>
          <Medallion size="lg" variant="instrument" withHalo={false}>
            {icon}
          </Medallion>
        </SignalOrbFrame>

        <span className="wl-label-muted">{label}</span>
      </div>
    </div>
  );
}
