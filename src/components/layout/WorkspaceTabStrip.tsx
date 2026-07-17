import { Link } from "react-router-dom";

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
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40",
    density === "compact" ? "min-h-8 px-2.5 text-xs" : "min-h-[44px] px-4 text-sm",
    active
      ? "bg-primary text-primary-foreground shadow-[var(--wireline-elevation-sm)]"
      : "text-foreground hover:bg-muted",
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

/** Centered workspace tab strip — settings, inbox, training, and operate surfaces. */
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

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "wl-workspace-tabs w-full",
        wrap
          ? "overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] lg:overflow-visible [&::-webkit-scrollbar]:hidden"
          : "overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        compact ? "min-h-8" : "mb-4 min-h-[44px] border-b border-border/70 pb-3",
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
          const accessibleLabel =
            tab.ariaLabel ?? (tab.shortLabel ? fullLabel : undefined);
          if (tab.href) {
            return (
              <Link
                key={tab.id}
                to={tab.href}
                aria-label={accessibleLabel}
                title={fullLabel}
                aria-current={active ? "page" : undefined}
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
