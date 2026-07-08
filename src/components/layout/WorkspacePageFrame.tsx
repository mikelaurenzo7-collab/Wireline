import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

type WorkspacePageFrameProps = {
  children: ReactNode;
  className?: string;
  /** Settings-style narrow rail */
  narrow?: boolean;
};

/** Consistent content rail for authenticated workspace pages. */
export function WorkspacePageFrame({
  children,
  className,
  narrow = false,
}: WorkspacePageFrameProps) {
  return (
    <div
      className={cn(
        "wl-workspace-page mx-auto flex w-full flex-col gap-5 pb-8 sm:gap-6",
        narrow ? "max-w-[700px]" : "max-w-[980px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

type WorkspacePageIntroProps = {
  title: string;
  action?: ReactNode;
  /** Centered display serif (default) or left-aligned operate header. */
  align?: "center" | "start";
};

/** Minimal page title — no eyebrows or explanatory copy in the workspace shell. */
export function WorkspacePageIntro({ title, action, align = "center" }: WorkspacePageIntroProps) {
  const start = align === "start";
  return (
    <header
      className={cn(
        "wl-workspace-page-intro flex items-center justify-between gap-4",
        start && "mx-0 max-w-none",
      )}
    >
      <h1 className={cn("wl-display-3", start && "text-left")}>{title}</h1>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
