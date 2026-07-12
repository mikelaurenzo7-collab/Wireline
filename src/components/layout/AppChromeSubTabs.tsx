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
        "flex w-full min-w-0 max-w-full shrink-0 items-center gap-1.5 overflow-x-auto tab-strip-scroll max-lg:tab-strip-scroll--fade [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap",
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
        className="mb-0 md:mb-0 justify-start lg:justify-start"
      />
      {secondary && secondary.tabs.length > 0 && (
        <>
          <span aria-hidden="true" className="w-px h-5 bg-black/10 shrink-0" />
          <ClientSubTabs
            tabs={secondary.tabs}
            activeId={secondary.activeId}
            onChange={secondary.setActiveId}
            aria-label={`${secondary.ariaLabel} — choose view`}
            layoutIdPrefix={secondary.layoutIdPrefix}
            instanceId={`${instanceId}-secondary`}
            density={density}
            className="mb-0 md:mb-0 justify-start lg:justify-start"
          />
        </>
      )}
    </div>
  );
}
