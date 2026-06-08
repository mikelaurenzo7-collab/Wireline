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
      {/* Desktop: title · tabs · tools in one row. Mobile: title + tools, then full-width tabs (no overlap). */}
      <div
        className={cn(
          "px-3 lg:px-4 py-1.5 sm:py-1",
          subtitle ? "min-h-[3.5rem] sm:min-h-[3.25rem]" : "min-h-[3rem] sm:min-h-[2.75rem]",
        )}
      >
        <div className="flex items-center gap-2 lg:gap-2.5">
          <div
            className={cn(
              "min-w-0 flex-1 lg:flex-none flex flex-col justify-center gap-0.5 sm:max-w-[11rem] lg:max-w-[15rem]",
              WL_APP_CLASSES.pageContextAccent,
            )}
          >
            {eyebrow && (
              <p className={cn(WL_APP_CLASSES.workspaceEyebrow, "truncate hidden sm:block")}>
                {eyebrow}
              </p>
            )}
            <h1
              className={cn(
                WL_APP_CLASSES.workspaceTitle,
                "truncate sm:max-w-none m-0 font-semibold",
              )}
            >
              {title}
            </h1>
          </div>
          <span
            aria-hidden="true"
            className="hidden lg:block w-px h-5 bg-black/10 shrink-0 self-center"
          />
          <div className="hidden lg:flex flex-1 min-w-0 self-center overflow-x-auto tab-strip-scroll">
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
        <div className="lg:hidden mt-1.5 -mx-1 px-1 overflow-x-auto tab-strip-scroll tab-strip-scroll--fade">
          <AppChromeSubTabs density="compact" />
        </div>
      </div>
      {subtitle && (
        <p
          className={cn(
            WL_APP_CLASSES.bodyCaption,
            "px-3 pb-2 pt-0 sm:pt-0 border-t border-black/[0.05] sm:border-t-0 min-w-0 line-clamp-1 sm:line-clamp-2 text-pretty",
            WL_APP_CLASSES.pageContextAccent,
          )}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
}
