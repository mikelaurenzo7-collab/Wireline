import type { ReactNode } from "react";
import ClientRouteViewport from "./ClientRouteViewport";
import SettingsTabSwitcher from "../admin/SettingsTabSwitcher";

type AdminHubViewportProps = {
  children: ReactNode;
  /** Allow vertical scroll for long admin pages (e.g. Integrations). */
  scroll?: boolean;
  className?: string;
};

/**
 * Unified admin shell: settings tab strip + full-height body region.
 * Used by Settings, DNC, Audit, and Integrations — not the Agents fleet page.
 */
export default function AdminHubViewport({ children, scroll, className }: AdminHubViewportProps) {
  return (
    <ClientRouteViewport scroll={scroll} className={className}>
      <SettingsTabSwitcher />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
    </ClientRouteViewport>
  );
}
