import { useCallback, type ComponentType, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";

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
  const focusTab = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (!tab) return;
      onChange(tab.id);
      document.getElementById(`${layoutIdPrefix}-tab-${tab.id}`)?.focus();
    },
    [tabs, onChange, layoutIdPrefix],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = tabs.findIndex((t) => t.id === activeId);
      if (currentIndex < 0) return;

      let nextIndex: number | null = null;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % tabs.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      focusTab(nextIndex);
    },
    [tabs, activeId, focusTab],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "shrink-0 flex items-center justify-center gap-1 overflow-x-auto scroll-viewport mb-2 md:mb-3 pb-0.5",
        className,
      )}
    >
      <div className="app-tab-strip wl-subtab-strip flex items-center gap-0.5 p-0.5 wl-panel">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const Icon = tab.icon;
          return (
            <ShadButton
              key={tab.id}
              id={`${layoutIdPrefix}-tab-${tab.id}`}
              type="button"
              variant="ghost"
              disableAnimations
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                "touch-press relative shrink-0 inline-flex min-h-9 sm:min-h-10 h-auto items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 transition-colors text-[10px] sm:text-[11px] uppercase tracking-[0.1em] font-medium whitespace-nowrap rounded-none",
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
            </ShadButton>
          );
        })}
      </div>
    </div>
  );
}
