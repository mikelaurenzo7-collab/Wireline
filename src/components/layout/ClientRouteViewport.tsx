/** Full-height viewport wrapper for authenticated app routes inside AppShell. */

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import ClientRouteAmbience from "./ClientRouteAmbience";

type ClientRouteViewportProps = {
  children: ReactNode;
  className?: string;
  /** When true, the outer shell scrolls (long-form pages like Help, Founder). */
  scroll?: boolean;
  /** Route-tinted ambient glow (default on). */
  ambience?: boolean;
};

export default function ClientRouteViewport({
  children,
  className,
  scroll = false,
  ambience = true,
}: ClientRouteViewportProps) {
  return (
    <div
      className={cn(
        "relative h-full min-h-0 flex flex-col",
        scroll ? "overflow-y-auto" : "overflow-hidden",
        className,
      )}
    >
      {ambience && <ClientRouteAmbience />}
      <div className="relative z-[1] flex flex-col flex-1 min-h-0">{children}</div>
    </div>
  );
}
