/** Full-height viewport wrapper for authenticated app routes inside AppShell.
 *  Desktop: participates in the flex height chain (`flex-1 min-h-0`).
 *  `scroll` — this wrapper scrolls (long-form pages).
 *  default — `overflow-hidden`; child split panes / PageShell panels scroll. */

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import ClientRouteAmbience from "./ClientRouteAmbience";

type ClientRouteViewportProps = {
  children: ReactNode;
  className?: string;
  /** When true, the outer shell scrolls (long-form pages like Help, Integrations). */
  scroll?: boolean;
  /** Route-tinted ambient glow (off by default — solid cream canvas). */
  ambience?: boolean;
};

export default function ClientRouteViewport({
  children,
  className,
  scroll = false,
  ambience = false,
}: ClientRouteViewportProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col w-full",
        scroll
          ? "route-shell-scroll scroll-viewport flex-1 min-h-0 overflow-y-auto overscroll-contain"
          : "flex-1 min-h-0 overflow-hidden",
        className,
      )}
    >
      {ambience && <ClientRouteAmbience />}
      <div
        className={cn(
          "relative z-[1] flex flex-col",
          scroll ? "route-scroll-inner" : "flex-1 min-h-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}
