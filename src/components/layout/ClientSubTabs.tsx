import type { ComponentType } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";

export type ClientSubTab = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
};

type ClientSubTabsProps = {
  tabs: ClientSubTab[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  "aria-label"?: string;
  layoutIdPrefix?: string;
};

/**
 * URL-driven sub-tabs for channel pages (Phone logs/outbound, Live Ops, etc.).
 * Matches HubTabs / SettingsTabSwitcher with animated brand pill.
 */
export default function ClientSubTabs({
  tabs,
  activeId,
  onChange,
  className,
  "aria-label": ariaLabel = "Page sections",
  layoutIdPrefix = "client-subtab",
}: ClientSubTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "shrink-0 flex items-center justify-center gap-1 overflow-x-auto scrollbar-hide mb-2 md:mb-3",
        className,
      )}
    >
      <div className="app-tab-strip flex items-center gap-0.5 p-0.5 glass border border-black/8">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative shrink-0 inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 transition-colors text-[11px] uppercase tracking-[0.1em] font-medium whitespace-nowrap",
                active ? "app-tab-active" : "text-muted hover:text-ink hover:bg-black/4",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`${layoutIdPrefix}-pill`}
                  aria-hidden="true"
                  className="app-tab-active-bg absolute inset-0"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              {Icon && <Icon className="relative z-[1] w-3.5 h-3.5" />}
              <span className="relative z-[1]">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
