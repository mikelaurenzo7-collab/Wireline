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
        "wl-workspace-page mx-auto flex w-full flex-col gap-4 pb-5 sm:gap-5",
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
  /**
   * Drop the visible heading when something else already names the section.
   * `true` hides it at every breakpoint — right when a tab strip below carries
   * the name on mobile too (Settings, Inbox). `"lg"` hides it only at `lg` and
   * up, where the workspace sidebar names the page — right when mobile has no
   * substitute (Connections sits under the dock's "More", with no tab strip,
   * so below `lg` this heading is the page's only on-screen name). Either way
   * the heading stays in the accessibility tree.
   */
  titleHidden?: boolean | "lg";
};

/** Minimal page title for authenticated workspace surfaces. */
export function WorkspacePageIntro({
  title,
  description,
  action,
  align = "start",
  titleHidden = false,
}: WorkspacePageIntroProps) {
  const start = align === "start";

  // Nothing left to show: render the accessible heading alone. `sr-only` is
  // absolutely positioned, so it leaves the frame's flex flow entirely and
  // contributes no gap — a wrapper here would leave a blank band instead.
  // (Only for the fully-hidden variant — the "lg" variant still shows below lg.)
  if (titleHidden === true && !description && !action) {
    return <h1 className="sr-only">{title}</h1>;
  }

  return (
    <header
      data-align={align}
      className={cn(
        "wl-workspace-page-intro flex w-full flex-col gap-3",
        start
          ? "items-start text-left md:flex-row md:items-start md:justify-between md:gap-6"
          : "mx-auto max-w-prose items-center text-center sm:flex-col",
      )}
    >
      <div className={cn("min-w-0", start ? "flex-1" : "w-full")}>
        <h1
          className={cn(
            titleHidden === true ? "sr-only" : "wl-display-3 break-words text-balance uppercase",
            titleHidden === "lg" && "lg:sr-only",
            !titleHidden && !start && "text-center",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground",
              !titleHidden && "mt-2",
              titleHidden === "lg" && "mt-2 lg:mt-0",
              !start && "mx-auto text-center",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div
          className={cn(
            "shrink-0",
            start ? "w-full [&>*]:w-full md:w-auto md:[&>*]:w-auto" : "w-full",
          )}
        >
          {action}
        </div>
      ) : null}
    </header>
  );
}

type WorkspaceOperateIntroProps = {
  title: string;
  tabs?: ReactNode;
  action?: ReactNode;
  /**
   * Drop the visible heading at `lg` and up, where the workspace sidebar already
   * names the selected section — printing "Calls" under a selected "Calls" rail
   * item labels the page twice. The heading stays `sr-only` (kept in the
   * accessibility tree so the page retains a document outline) rather than
   * removed, and it stays visible below `lg`, where the sidebar is hidden and
   * this is the page's only on-screen name.
   */
  titleHidden?: boolean;
};

/** Thin operate-mode title bar (Phone, Insights). */
export function WorkspaceOperateIntro({
  title,
  tabs,
  action,
  titleHidden = false,
}: WorkspaceOperateIntroProps) {
  const showBarAlways = Boolean(tabs || action);
  return (
    <header
      className={cn(
        "wl-operate-surface shrink-0 border-b border-border/60 pb-3",
        // First-run Insights has a page title on the phone and nothing else.
        // Keep that name under the dock's More sheet, and drop the empty
        // bordered bar on desktop where the rail already says Activity.
        !showBarAlways && titleHidden && "lg:hidden",
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1
            className={cn(
              "wl-display-3 break-words text-balance uppercase",
              titleHidden && "lg:sr-only",
            )}
          >
            {title}
          </h1>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {/* When the heading collapses to sr-only at lg+, pull the tab strip up so
          the operate bar doesn't keep a phantom gap where the title used to sit. */}
      {tabs ? <div className={cn("mt-3", titleHidden && !action && "lg:mt-0")}>{tabs}</div> : null}
    </header>
  );
}
