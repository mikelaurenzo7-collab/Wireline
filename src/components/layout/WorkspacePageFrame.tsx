import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export type WorkspacePageMode = "standard" | "narrow" | "operate";

type WorkspacePageFrameProps = {
  children: ReactNode;
  className?: string;
  /** Page chrome mode — standard 1080px, narrow 860px, operate full-bleed rail. */
  mode?: WorkspacePageMode;
  /** @deprecated Use mode="narrow" */
  narrow?: boolean;
};

const MODE_MAX_WIDTH: Record<WorkspacePageMode, string> = {
  standard: "max-w-[1080px]",
  narrow: "max-w-[860px]",
  operate: "max-w-none",
};

/** Consistent content rail for authenticated workspace pages. */
export function WorkspacePageFrame({
  children,
  className,
  mode,
  narrow = false,
}: WorkspacePageFrameProps) {
  const resolvedMode: WorkspacePageMode = mode ?? (narrow ? "narrow" : "standard");

  return (
    <div
      data-wireline-page-mode={resolvedMode}
      className={cn(
        "wl-workspace-page mx-auto flex w-full flex-col gap-5 pb-8 sm:gap-6",
        MODE_MAX_WIDTH[resolvedMode],
        resolvedMode === "operate" && "gap-4 px-3 pt-3 sm:px-5 lg:px-6 lg:pt-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

type WorkspacePageIntroProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Start-aligned product header (default) or centered status/empty-state header. */
  align?: "center" | "start";
};

/** Minimal page title for authenticated workspace surfaces. */
export function WorkspacePageIntro({
  title,
  description,
  action,
  align = "start",
}: WorkspacePageIntroProps) {
  const start = align === "start";

  return (
    <header
      data-align={align}
      className={cn(
        "wl-workspace-page-intro flex w-full flex-col gap-3",
        start
          ? "items-start text-left sm:flex-row sm:items-start sm:justify-between sm:gap-6"
          : "mx-auto max-w-prose items-center text-center sm:flex-col",
      )}
    >
      <div className={cn("min-w-0", start ? "flex-1" : "w-full")}>
        <h1 className={cn("wl-display-3 break-words text-balance", !start && "text-center")}>
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground",
              !start && "mx-auto text-center",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className={cn("shrink-0", start ? "w-full sm:w-auto" : "w-full")}>{action}</div>
      ) : null}
    </header>
  );
}

type WorkspaceOperateIntroProps = {
  title: string;
  tabs?: ReactNode;
  action?: ReactNode;
};

/** Thin operate-mode title bar (Phone, Insights). */
export function WorkspaceOperateIntro({ title, tabs, action }: WorkspaceOperateIntroProps) {
  return (
    <header className="wl-operate-surface shrink-0 border-b border-border/60 pb-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="wl-display-3 break-words text-balance">{title}</h1>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {tabs ? <div className="mt-3">{tabs}</div> : null}
    </header>
  );
}
