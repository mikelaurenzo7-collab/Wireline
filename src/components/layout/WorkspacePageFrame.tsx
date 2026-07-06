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
};

/** Minimal page title — no eyebrows or explanatory copy in the workspace shell. */
export function WorkspacePageIntro({ title, action }: WorkspacePageIntroProps) {
  return (
    <header className="wl-workspace-page-intro flex items-center justify-between gap-4">
      <h1 className="wl-display-3">{title}</h1>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
