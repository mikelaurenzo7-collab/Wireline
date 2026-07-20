import { useCallback, type ComponentType, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";

export type ClientSubTab = {
  id: string;
  label: string;
  /** Short visual label used only on narrow viewports. */
  shortLabel?: string;
  /** Full accessible label when the visual label is shortened. */
  ariaLabel?: string;
  icon?: ComponentType<{ className?: string }>;
};

type ClientSubTabsProps = {
  tabs: ClientSubTab[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  density?: "default" | "compact";
  "aria-label"?: string;
  layoutIdPrefix?: string;
  instanceId?: string;
};

/**
 * URL-driven sub-tabs for channel pages (Phone logs/outbound, Recaps, etc.).
 * Matches HubTabs / SettingsTabSwitcher with a restrained active indicator.
 */
export default function ClientSubTabs({
  tabs,
  activeId,
  onChange,
  className,
  density = "default",
  "aria-label": ariaLabel = "Page sections",
  layoutIdPrefix = "client-subtab",
  instanceId,
}: ClientSubTabsProps) {
  const domIdPrefix = instanceId ? `${layoutIdPrefix}-${instanceId}` : layoutIdPrefix;
  const focusTab = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (!tab) return;
      onChange(tab.id);
      document.getElementById(`${domIdPrefix}-tab-${tab.id}`)?.focus();
    },
    [tabs, onChange, domIdPrefix],
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
        "tab-strip-scroll max-sm:tab-strip-scroll--fade flex shrink-0 items-center gap-1",
        density === "compact" ? "mb-0 justify-start" : "mb-2 justify-center md:mb-3",
        className,
      )}
    >
      <div
        className={cn(
          "app-tab-strip wl-subtab-strip flex min-w-0 items-center gap-0.5 wl-panel",
          density === "compact" ? "border-0 bg-transparent p-0.5 shadow-none" : "p-0.5",
        )}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          const Icon = tab.icon;
          const fullLabel = tab.ariaLabel ?? tab.label;
          return (
            <ShadButton
              key={tab.id}
              id={`${domIdPrefix}-tab-${tab.id}`}
              type="button"
              variant="ghost"
              disableAnimations
              role="tab"
              aria-label={fullLabel}
              title={fullLabel}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                if (!active) onChange(tab.id);
              }}
              className={cn(
                "relative inline-flex h-auto max-w-[8.5rem] shrink-0 items-center gap-1 overflow-hidden rounded-none text-ellipsis whitespace-nowrap font-medium normal-case tracking-normal transition-colors sm:max-w-[12rem]",
                density === "compact"
                  ? "min-h-7 px-1.5 py-0.5 text-[0.6875rem]"
                  : "min-h-9 gap-1.5 px-2 py-1 text-[0.75rem] sm:min-h-10 sm:px-3 sm:py-1.5 sm:text-[var(--wireline-typography-overline-size)]",
                active ? "app-tab-active" : "text-muted hover:bg-black/4 hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`${domIdPrefix}-pill`}
                  aria-hidden="true"
                  className="app-tab-active-bg absolute inset-0"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              {Icon && (
                <Icon
                  className={cn(
                    "relative z-[1] shrink-0",
                    density === "compact" ? "h-3 w-3" : "h-3.5 w-3.5",
                  )}
                />
              )}
              {tab.shortLabel ? (
                <>
                  <span className="relative z-[1] min-w-0 truncate sm:hidden">{tab.shortLabel}</span>
                  <span className="relative z-[1] hidden min-w-0 truncate sm:inline">
                    {tab.label}
                  </span>
                </>
              ) : (
                <span className="relative z-[1] min-w-0 truncate">{tab.label}</span>
              )}
            </ShadButton>
          );
        })}
      </div>
    </div>
  );
}
