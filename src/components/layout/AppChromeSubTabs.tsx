import ClientSubTabs from "./ClientSubTabs";
import SettingsTabSwitcher from "../admin/SettingsTabSwitcher";
import { useAppPageSubTabs } from "../../hooks/useAppPageSubTabs";
import { cn } from "../../lib/utils";

type AppChromeSubTabsProps = {
  className?: string;
};

/**
 * App-wide section tabs — lives in the page chrome (below title), not inside route bodies.
 */
export default function AppChromeSubTabs({ className }: AppChromeSubTabsProps) {
  const chrome = useAppPageSubTabs();

  if (!chrome) return null;

  if (chrome.showAdminTabs) {
    return (
      <div className={cn("shrink-0 px-3 sm:px-4 lg:px-1", className)}>
        <SettingsTabSwitcher className="mb-0 md:mb-0" />
      </div>
    );
  }

  return (
    <div className={cn("shrink-0 px-3 sm:px-4 lg:px-1", className)}>
      <ClientSubTabs
        tabs={chrome.tabs}
        activeId={chrome.activeId}
        onChange={chrome.setActiveId}
        aria-label={chrome.ariaLabel}
        layoutIdPrefix={chrome.layoutIdPrefix}
        className="mb-0 md:mb-0 justify-start lg:justify-start"
      />
    </div>
  );
}
