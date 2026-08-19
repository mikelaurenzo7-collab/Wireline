import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

type WorkspaceControlBandProps = {
  primary: ReactNode;
  secondary?: ReactNode;
  className?: string;
  ariaLabel?: string;
  /** Use inside an existing bordered header such as WorkspaceOperateIntro. */
  embedded?: boolean;
};

/**
 * One compact rhythm for route-level tabs + scope/filter controls.
 *
 * Mobile stacks naturally; desktop keeps navigation and scope in one visual
 * band. Individual pages own the controls, this primitive owns their spacing.
 */
export default function WorkspaceControlBand({
  primary,
  secondary,
  className,
  ariaLabel = "Page controls",
  embedded = false,
}: WorkspaceControlBandProps) {
  return (
    <div
      data-wireline-control-band
      data-embedded={embedded ? "true" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center",
        embedded ? "mb-0 border-b-0 pb-0" : "mb-3 border-b border-border/70 pb-3",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{primary}</div>
      {secondary ? (
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 sm:shrink-0 sm:justify-end sm:overflow-visible sm:pb-0">
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
