import { useEffect, useRef } from "react";
import { Link } from "react-router";

import { cn } from "../../lib/utils";

export type WorkspaceTabItem = {
  id: string;
  label: string;
  /** Accessible name when `label` is abbreviated for narrow viewports. */
  ariaLabel?: string;
  /** Short visual label used on narrow viewports. */
  shortLabel?: string;
  href?: string;
};

type WorkspaceTabStripProps = {
  tabs: readonly WorkspaceTabItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  ariaLabel: string;
  className?: string;
  density?: "default" | "compact";
  align?: "center" | "start";
  wrap?: boolean;
};

function tabClassName(active: boolean, density: "default" | "compact") {
  return cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60",
    density === "compact" ? "min-h-10 px-3 text-[13px] sm:px-3.5" : "min-h-[44px] px-4 text-sm",
    active
      ? "border-primary/35 bg-primary/15 text-primary shadow-none"
      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

function WorkspaceTabLabel({ tab }: { tab: WorkspaceTabItem }) {
  if (!tab.shortLabel) return tab.label;

  return (
    <>
      <span className="sm:hidden" aria-hidden="true">
        {tab.shortLabel}
      </span>
      <span className="hidden sm:inline" aria-hidden="true">
        {tab.label}
      </span>
    </>
  );
}

/** Shared workspace tab strip for settings, inbox, studio, and operate surfaces. */
export function WorkspaceTabStrip({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  className,
  density = "default",
  align = "center",
  wrap = false,
}: WorkspaceTabStripProps) {
  const compact = density === "compact";
  const navRef = useRef<HTMLElement | null>(null);
  // Deliberately a count, not `tabs` itself. Three callers build the array
  // inline (`[...PHONE_TABS]`, `VALID_TABS.map(...)`, the approvals `.map(...)`),
  // so its identity changes on every render — depending on it would re-run the
  // effect below constantly and yank the strip back to the selected tab while
  // someone was scrolling it. The effect reads the DOM, never `tabs`.
  const tabCount = tabs.length;

  /*
   * Bring the selected tab into view when the strip is scrolled off.
   * Landing directly on a late route (say /settings/compliance on a phone) left
   * the strip parked at scrollLeft 0, so the selected tab sat ~460px outside a
   * 298px viewport and nothing on screen named the page. Adjusts only this
   * element's horizontal scroll, so the page's own scroll position is untouched.
   */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (nav.scrollWidth <= nav.clientWidth + 1) return;

    const active = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;

    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const gutter = 12;

    if (activeRect.left < navRect.left + gutter) {
      nav.scrollLeft -= navRect.left + gutter - activeRect.left;
    } else if (activeRect.right > navRect.right - gutter) {
      nav.scrollLeft += activeRect.right - (navRect.right - gutter);
    }
  }, [activeId, tabCount]);

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      data-density={density}
      data-align={align}
      className={cn(
        "wl-workspace-tabs w-full",
        wrap
          ? "overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] lg:overflow-visible [&::-webkit-scrollbar]:hidden"
          : "overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        compact ? "min-h-10" : "mb-4 min-h-[44px] border-b border-border/70 pb-3",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center",
          wrap ? "min-w-max lg:w-full lg:min-w-0 lg:flex-wrap" : "min-w-max",
          compact ? "gap-1" : "gap-2",
          wrap
            ? align === "start"
              ? "justify-start"
              : "lg:justify-center"
            : align === "center" && "mx-auto",
        )}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const fullLabel = tab.ariaLabel ?? tab.label;
          const accessibleLabel = tab.ariaLabel ?? (tab.shortLabel ? fullLabel : undefined);
          if (tab.href) {
            return (
              <Link
                key={tab.id}
                to={tab.href}
                aria-label={accessibleLabel}
                title={fullLabel}
                aria-current={active ? "page" : undefined}
                data-active={active ? "true" : "false"}
                className={tabClassName(active, density)}
              >
                <WorkspaceTabLabel tab={tab} />
              </Link>
            );
          }
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={accessibleLabel}
              title={fullLabel}
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : "false"}
              onClick={() => onSelect?.(tab.id)}
              className={tabClassName(active, density)}
            >
              <WorkspaceTabLabel tab={tab} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
