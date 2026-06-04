import { Keyboard } from "lucide-react";
import ThemeToggle from "../ThemeToggle";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { cn } from "../../lib/utils";
import { WL_APP_CLASSES } from "../../lib/wireline-director-design";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
  onShowShortcuts?: () => void;
};

/**
 * lg+ page context — eyebrow, title, and route subtitle in the cream workspace.
 * Theme + shortcuts live here on desktop (sidebar stays nav-only).
 */
export default function DesktopPageContext({
  eyebrow,
  title,
  subtitle,
  className,
  onShowShortcuts,
}: Props) {
  if (!title && !subtitle) return null;

  return (
    <header
      className={cn(
        "hidden lg:block shrink-0 px-1 sm:px-2 wl-page-context-accent",
        WL_APP_CLASSES.pageContext,
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="wl-label text-brand/70 mb-1">{eyebrow}</p>}
          <h1 className="font-display italic text-[1.65rem] leading-[1.05] tracking-[-0.02em] text-ink text-balance">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-[13px] leading-snug text-muted max-w-2xl text-pretty">
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={cn(WL_APP_CLASSES.chromeToolbar, "shrink-0")}
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
              className="h-8 w-8 rounded-md text-muted hover:text-ink hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="w-4 h-4" strokeWidth={1.75} />
            </ShadButton>
          )}
          <ThemeToggle variant="default" compact className="rounded-md" />
        </div>
      </div>
      <div className="mt-3 aurora-divider" aria-hidden="true" />
    </header>
  );
}
