import { Link } from "react-router-dom";

import { cn } from "../../lib/utils";

export type WorkspaceTabItem = {
  id: string;
  label: string;
  href?: string;
};

type WorkspaceTabStripProps = {
  tabs: readonly WorkspaceTabItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  ariaLabel: string;
  className?: string;
};

function tabClassName(active: boolean) {
  return cn(
    "inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40",
    active
      ? "bg-primary text-primary-foreground shadow-[var(--wireline-elevation-sm)]"
      : "text-foreground hover:bg-muted",
  );
}

/** Centered workspace tab strip — settings, inbox, training, and operate surfaces. */
export function WorkspaceTabStrip({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  className,
}: WorkspaceTabStripProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "wl-workspace-tabs mb-4 flex min-h-[44px] w-full items-center justify-center gap-2 overflow-x-auto border-b border-border/70 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        if (tab.href) {
          return (
            <Link
              key={tab.id}
              to={tab.href}
              aria-current={active ? "page" : undefined}
              className={tabClassName(active)}
            >
              {tab.label}
            </Link>
          );
        }
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect?.(tab.id)}
            className={tabClassName(active)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
