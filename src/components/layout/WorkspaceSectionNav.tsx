import { useLocation } from "react-router";

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
 * With room for both, Computer opens beside the Set Up conversation so the chat
 * stays visible; smaller screens open the Computer page instead.
 */
export default function WorkspaceSectionNav({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const { resolvedId } = useStudioActiveAgentId();
  const sideBySide = useMediaQuery("(min-width: 1180px)");
  const activeId = workspaceSectionForPath(pathname) ?? "setup";
  const agentQuery = resolvedId ? `agent=${encodeURIComponent(resolvedId)}` : "";

  const hrefFor = (section: (typeof WORKSPACE_SECTIONS)[number]) => {
    if (section.id === "computer" && sideBySide) {
      return `/studio?${agentQuery ? `${agentQuery}&` : ""}panel=computer`;
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
