import ClientSubTabs from "./ClientSubTabs";
import SettingsTabSwitcher from "../admin/SettingsTabSwitcher";
import { useAppChromeTabs } from "../../hooks/useAppChromeTabs";
import { cn } from "../../lib/utils";

type AppChromeSubTabsProps = {
  className?: string;
  density?: "default" | "compact";
  instanceId?: string;
};

/**
 * App-wide section tabs — primary + secondary strips in the workspace top bar.
 */
export default function AppChromeSubTabs({
  className,
  density = "default",
  instanceId = "default",
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
      role="group"
      aria-label="Page section navigation"
      className={cn(
        "flex w-full min-w-0 max-w-full shrink-0 flex-col items-stretch gap-1.5 overflow-visible sm:flex-row sm:flex-wrap sm:items-center",
        density === "compact" ? "mb-0" : "",
        className,
      )}
    >
      <ClientSubTabs
        tabs={primary.tabs}
        activeId={primary.activeId}
        onChange={primary.setActiveId}
        aria-label={secondary ? `${primary.ariaLabel} — choose category` : primary.ariaLabel}
        layoutIdPrefix={primary.layoutIdPrefix}
        instanceId={`${instanceId}-primary`}
        density={density}
        className="mb-0 w-full min-w-0 justify-start overflow-x-auto sm:w-auto md:mb-0 lg:justify-start"
      />
      {secondary && secondary.tabs.length > 0 && (
        <>
          <span aria-hidden="true" className="h-px w-full shrink-0 bg-black/10 sm:h-5 sm:w-px" />
          <ClientSubTabs
            tabs={secondary.tabs}
            activeId={secondary.activeId}
            onChange={secondary.setActiveId}
            aria-label={`${secondary.ariaLabel} — choose view`}
            layoutIdPrefix={secondary.layoutIdPrefix}
            instanceId={`${instanceId}-secondary`}
            density={density}
            className="mb-0 w-full min-w-0 justify-start overflow-x-auto sm:w-auto md:mb-0 lg:justify-start"
          />
        </>
      )}
    </div>
  );
}
