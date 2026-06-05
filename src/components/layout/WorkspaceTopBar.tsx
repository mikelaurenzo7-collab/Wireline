import { Keyboard } from "lucide-react";
import ThemeToggle from "../ThemeToggle";
import { ShadButton } from "../ui/shadcn/ShadButton";
import AppChromeSubTabs from "./AppChromeSubTabs";
import { cn } from "../../lib/utils";

type Props = {
  eyebrow?: string;
  title: string;
  className?: string;
  onShowShortcuts?: () => void;
};

/**
 * Sticky workspace top bar (lg+ main column). Title, all section tabs, and page tools
 * in one compact row — replaces the large DesktopPageContext header stack.
 */
export default function WorkspaceTopBar({ eyebrow, title, className, onShowShortcuts }: Props) {
  if (!title) return null;

  return (
    <header
      className={cn(
        "workspace-top-bar sticky top-0 z-30 shrink-0 border-b border-black/[0.07] bg-paper/97 backdrop-blur-md shadow-[0_1px_0_rgba(255,255,255,0.65)_inset]",
        className,
      )}
    >
      <div className="flex items-center gap-2 lg:gap-2.5 px-3 lg:px-4 min-h-[2.75rem] py-1">
        <div className="min-w-0 shrink-0 flex flex-col justify-center gap-0.5 sm:max-w-[11rem] lg:max-w-[13rem]">
          {eyebrow && (
            <p className="wl-label text-brand/60 leading-none truncate text-[0.625rem] hidden sm:block">
              {eyebrow}
            </p>
          )}
          <p className="text-[11px] sm:text-[12px] lg:text-[13px] font-semibold text-ink truncate leading-tight tracking-[-0.02em] max-w-[7rem] sm:max-w-none">
            {title}
          </p>
        </div>
        <span aria-hidden="true" className="w-px h-5 bg-black/10 shrink-0" />
        <div className="flex-1 min-w-0 overflow-hidden">
          <AppChromeSubTabs density="compact" />
        </div>
        <div className="flex items-center gap-0.5 shrink-0" role="toolbar" aria-label="Page tools">
          {onShowShortcuts && (
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={onShowShortcuts}
              className="h-8 w-8 rounded-md text-muted hover:text-ink hover:bg-black/[0.04]"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="w-3.5 h-3.5" strokeWidth={1.75} />
            </ShadButton>
          )}
          <ThemeToggle variant="default" compact className="rounded-md h-8 w-8" />
        </div>
      </div>
    </header>
  );
}
