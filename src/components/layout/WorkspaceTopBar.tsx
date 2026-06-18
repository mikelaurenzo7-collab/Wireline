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
        "workspace-top-bar sticky top-0 z-30 shrink-0 border-b border-white/[0.07] bg-card/85 dark:bg-velvet/85 backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.65)_inset] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] transition-colors duration-200",
        className,
      )}
    >
      {/* Desktop: title · tabs · tools in one row. Mobile: title + tools, then full-width tabs (no overlap). */}
      <div
        className={cn(
          "px-3 md:px-6 lg:px-10 py-2 md:py-3",
          subtitle ? "min-h-[3.75rem] md:min-h-[4rem]" : "min-h-[3.25rem] md:min-h-[3.5rem]",
        )}
      >
        <div className="flex items-center gap-2 lg:gap-3">
          <div
            className={cn(
              "min-w-0 flex-1 lg:flex-none flex flex-col justify-center gap-0.5 sm:max-w-[14rem] lg:max-w-[18rem]",
              WL_APP_CLASSES.pageContextAccent,
            )}
          >
            {eyebrow && (
              <p className={cn(WL_APP_CLASSES.workspaceEyebrow, "truncate")}>{eyebrow}</p>
            )}
            <h1
              id="workspace-page-title"
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
            className="hidden lg:block w-px h-6 bg-black/10 dark:bg-white/10 shrink-0 self-center mx-2"
          />
          <div className="hidden lg:flex flex-1 min-w-0 self-center overflow-x-auto tab-strip-scroll">
            <AppChromeSubTabs density="compact" instanceId="desktop" />
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
                className="h-8 w-8 rounded-md text-muted hover:text-foreground hover:bg-black/[0.04] touch-press hover:scale-[1.05]"
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
          <AppChromeSubTabs density="compact" instanceId="mobile" />
        </div>
      </div>
      {subtitle && (
        <p
          className={cn(
            WL_APP_CLASSES.bodyCaption,
            // Never truncate on mobile — allow natural wrap up to 2 lines; give breathing room
            "px-3 pb-2 pt-0 sm:pt-0 border-t border-white/[0.05] sm:border-t-0 min-w-0 line-clamp-2 sm:line-clamp-2 text-pretty max-w-[calc(100%-1.5rem)]",
            WL_APP_CLASSES.pageContextAccent,
          )}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
}
