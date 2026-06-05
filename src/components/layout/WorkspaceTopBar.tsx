import { Keyboard } from "lucide-react";
import ThemeToggle from "../ThemeToggle";
import { ShadButton } from "../ui/shadcn/ShadButton";
import AppChromeSubTabs from "./AppChromeSubTabs";
import { cn } from "../../lib/utils";
import { WL_APP_CLASSES } from "../../lib/wireline-director-design";

type Props = {
  eyebrow?: string;
  title: string;
  /** Route-level operator context (from AppShell pageCtx). */
  subtitle?: string;
  className?: string;
  onShowShortcuts?: () => void;
};

/**
 * Sticky workspace top bar (main column). Title, optional subtitle, section tabs,
 * and page tools in one compact row — replaces the large DesktopPageContext stack.
 */
export default function WorkspaceTopBar({
  eyebrow,
  title,
  subtitle,
  className,
  onShowShortcuts,
}: Props) {
  if (!title) return null;

  return (
    <header
      className={cn(
        "workspace-top-bar sticky top-0 z-30 shrink-0 border-b border-black/[0.07] bg-paper/97 backdrop-blur-md shadow-[0_1px_0_rgba(255,255,255,0.65)_inset]",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 lg:gap-2.5 px-3 lg:px-4 py-1",
          subtitle ? "min-h-[3.25rem]" : "min-h-[2.75rem]",
        )}
      >
        <div
          className={cn(
            "min-w-0 shrink-0 flex flex-col justify-center gap-0.5 sm:max-w-[11rem] lg:max-w-[15rem]",
            WL_APP_CLASSES.pageContextAccent,
          )}
        >
          {eyebrow && (
            <p className={cn(WL_APP_CLASSES.workspaceEyebrow, "truncate hidden sm:block")}>
              {eyebrow}
            </p>
          )}
          <p className={cn(WL_APP_CLASSES.workspaceTitle, "truncate max-w-[7rem] sm:max-w-none")}>
            {title}
          </p>
          {subtitle && (
            <p
              className={cn(
                WL_APP_CLASSES.bodyCaption,
                "hidden sm:block line-clamp-2 text-pretty max-w-[11rem] md:max-w-[15rem] lg:max-w-[20rem]",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        <span aria-hidden="true" className="w-px h-5 bg-black/10 shrink-0 self-center" />
        <div className="flex-1 min-w-0 overflow-hidden self-center">
          <AppChromeSubTabs density="compact" />
        </div>
        <div
          className="flex items-center gap-0.5 shrink-0 self-center"
          role="toolbar"
          aria-label="Page tools"
        >
          {onShowShortcuts && (
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={onShowShortcuts}
              className="h-8 w-8 rounded-md text-muted hover:text-ink hover:bg-black/[0.04] touch-press"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="w-3.5 h-3.5" strokeWidth={1.75} />
            </ShadButton>
          )}
          <ThemeToggle variant="default" compact className="rounded-md h-8 w-8" />
        </div>
      </div>
      {subtitle && (
        <div
          className={cn(
            "sm:hidden px-3 pb-2 pt-0 border-t border-black/[0.05]",
            WL_APP_CLASSES.pageContextAccent,
          )}
        >
          <p className={cn(WL_APP_CLASSES.bodyCaption, "line-clamp-2")}>{subtitle}</p>
        </div>
      )}
    </header>
  );
}
