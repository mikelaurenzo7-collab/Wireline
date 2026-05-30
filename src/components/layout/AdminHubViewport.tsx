import type { ReactNode } from "react";
import ClientRouteViewport from "./ClientRouteViewport";
import SettingsTabSwitcher from "../admin/SettingsTabSwitcher";
import { cn } from "../../lib/utils";

type AdminHubViewportProps = {
  children: ReactNode;
  /** Allow vertical scroll for long admin pages (e.g. Integrations). */
  scroll?: boolean;
  className?: string;
};

/**
 * Unified admin shell: settings tab strip + full-height body region.
 * Used by Settings, Agents, DNC, Audit, and Integrations.
 */
export default function AdminHubViewport({ children, scroll, className }: AdminHubViewportProps) {
  return (
    <ClientRouteViewport className={cn(scroll && "overflow-y-auto", className)}>
      <SettingsTabSwitcher />
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </ClientRouteViewport>
  );
}
