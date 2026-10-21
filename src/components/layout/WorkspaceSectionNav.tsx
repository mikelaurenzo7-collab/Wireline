import { useLocation, useSearchParams } from "react-router";

import { WORKSPACE_SECTIONS, workspaceSectionForPath } from "../../constants/navigation";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useStudioActiveAgentId } from "../../hooks/useStudioActiveAgentId";
import { cn } from "../../lib/utils";
import { WorkspaceTabStrip } from "./WorkspaceTabStrip";

/**
 * Set Up · Knowledge · Computer. The same strip opens every Workspace page so
 * the Bot's setup, what it knows, and its live computer work read as one place.
 * Each link carries the current Bot so switching sections never switches Bots.
 *
 * Explicit Computer navigation gives the task the workspace. The conversation
 * remains mounted on wide screens and can be restored beside it.
 */
export default function WorkspaceSectionNav({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { requestedId, resolvedId } = useStudioActiveAgentId();
  const sideBySide = useMediaQuery("(min-width: 1180px)");
  const activeId =
    pathname === "/studio" && params.get("focus") === "computer"
      ? "computer"
      : (workspaceSectionForPath(pathname) ?? "setup");
  // An explicit Bot remains the scope even when its roster entry is unavailable.
  // The destination owns validation; navigation must not choose a different Bot.
  const navigationAgentId = requestedId?.trim() || resolvedId;
  const agentQuery = navigationAgentId ? `agent=${encodeURIComponent(navigationAgentId)}` : "";

  const hrefFor = (section: (typeof WORKSPACE_SECTIONS)[number]) => {
    if (section.id === "computer" && sideBySide) {
      return `/studio?${agentQuery ? `${agentQuery}&` : ""}panel=computer&focus=computer`;
    }
    return `${section.href}${agentQuery ? `?${agentQuery}` : ""}`;
  };

  return (
    <WorkspaceTabStrip
      ariaLabel="Workspace sections"
      tabs={WORKSPACE_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        href: hrefFor(section),
      }))}
      activeId={activeId}
      density="compact"
      align="start"
      className={cn("mb-0 w-auto border-b-0 pb-0", className)}
    />
  );
}
