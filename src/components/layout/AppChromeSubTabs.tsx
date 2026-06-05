import ClientSubTabs from "./ClientSubTabs";
import SettingsTabSwitcher from "../admin/SettingsTabSwitcher";
import { useAppChromeTabs } from "../../hooks/useAppChromeTabs";
import { cn } from "../../lib/utils";

type AppChromeSubTabsProps = {
  className?: string;
  density?: "default" | "compact";
};

/**
 * App-wide section tabs — primary + secondary strips in the workspace top bar.
 */
export default function AppChromeSubTabs({
  className,
  density = "default",
}: AppChromeSubTabsProps) {
  const chrome = useAppChromeTabs();

  if (chrome.showAdminTabs) {
    return (
      <div className={cn("shrink-0", className)}>
        <SettingsTabSwitcher density={density} className="mb-0 md:mb-0" />
      </div>
    );
  }

  if (!("ariaLabel" in chrome) || chrome.tabs.length === 0) return null;

  const { secondary, ...primary } = chrome;

  return (
    <div
      className={cn(
        "shrink-0 flex items-center gap-1.5 min-w-0",
        density === "compact" ? "mb-0" : "",
        className,
      )}
    >
      <ClientSubTabs
        tabs={primary.tabs}
        activeId={primary.activeId}
        onChange={primary.setActiveId}
        aria-label={primary.ariaLabel}
        layoutIdPrefix={primary.layoutIdPrefix}
        density={density}
        className="mb-0 md:mb-0 justify-start lg:justify-start"
      />
      {secondary && secondary.tabs.length > 0 && (
        <>
          <span aria-hidden="true" className="w-px h-5 bg-black/10 shrink-0" />
          <ClientSubTabs
            tabs={secondary.tabs}
            activeId={secondary.activeId}
            onChange={secondary.setActiveId}
            aria-label={secondary.ariaLabel}
            layoutIdPrefix={secondary.layoutIdPrefix}
            density={density}
            className="mb-0 md:mb-0 justify-start lg:justify-start"
          />
        </>
      )}
    </div>
  );
}
