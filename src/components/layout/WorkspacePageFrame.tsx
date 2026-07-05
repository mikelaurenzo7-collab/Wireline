import type { ReactNode } from "react";

import { WiredEyebrow } from "../ui/WiredEyebrow";
import { cn } from "../../lib/utils";

type WorkspacePageFrameProps = {
  children: ReactNode;
  className?: string;
  /** Settings-style narrow rail */
  narrow?: boolean;
};

/** Consistent centered content rail for authenticated workspace pages. */
export function WorkspacePageFrame({
  children,
  className,
  narrow = false,
}: WorkspacePageFrameProps) {
  return (
    <div
      className={cn(
        "wl-workspace-page mx-auto flex w-full flex-col gap-6 pb-8 sm:gap-7",
        narrow ? "max-w-[700px]" : "max-w-[980px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

type WorkspacePageIntroProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Centered page intro when the shell header is intentionally omitted. */
export function WorkspacePageIntro({
  eyebrow,
  title,
  description,
  action,
}: WorkspacePageIntroProps) {
  return (
    <header className="wl-workspace-page-intro text-center">
      {eyebrow ? <WiredEyebrow>{eyebrow}</WiredEyebrow> : null}
      <h1 className={cn("wl-display-3", eyebrow && "mt-3")}>{title}</h1>
      {description ? (
        <p className="mx-auto mt-4 max-w-[48ch] text-sm leading-7 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </header>
  );
}
