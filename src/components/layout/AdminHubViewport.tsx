import type { ReactNode } from "react";
import ClientRouteViewport from "./ClientRouteViewport";

type AdminHubViewportProps = {
  children: ReactNode;
  /** Allow vertical scroll for long admin pages (e.g. Integrations, Audit). */
  scroll?: boolean;
  className?: string;
};

/**
 * Unified admin shell: settings tab strip + full-height body region.
 * Used by Settings, DNC, Audit, and Integrations — not the Agents Assistants page.
 *
 * Long pages use `scroll` so ClientRouteViewport owns the sole scroll axis
 * Fixed-height pages keep inner panel scroll.
 */
export default function AdminHubViewport({ children, scroll, className }: AdminHubViewportProps) {
  return (
    <ClientRouteViewport scroll={scroll} className={className}>
      {scroll ? (
        <div className="route-scroll-body">{children}</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
      )}
    </ClientRouteViewport>
  );
}
