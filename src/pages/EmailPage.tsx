import { useSearchParams } from "react-router";

import EmailInbox from "../components/EmailInbox";
import SmsThreads from "../components/SmsThreads";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";

type InboxTabId = "email" | "sms";

const inboxTabs: Array<{ id: InboxTabId; label: string }> = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
];

/** Inbox owns written conversations. Bot scope is a lens, not a second inbox. */
export default function EmailPage() {
  const [params, setParams] = useSearchParams();
  const { agents } = useAgents();
  const requestedTab = params.get("tab") as InboxTabId | null;
  const activeTab: InboxTabId = inboxTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as InboxTabId)
    : "email";
  const requestedAgentId = params.get("agent")?.trim() || "";
  const activeAgentId = agents.some((agent) => agent.id === requestedAgentId)
    ? requestedAgentId
    : "";

  function updateParams(mutator: (current: URLSearchParams) => void) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        mutator(updated);
        return updated;
      },
      { replace: true },
    );
  }

  function setActiveTab(tab: InboxTabId) {
    updateParams((updated) => updated.set("tab", tab));
  }

  function setAgentScope(agentId: string) {
    updateParams((updated) => {
      if (agentId) updated.set("agent", agentId);
      else updated.delete("agent");
    });
  }

  return (
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-4">
      <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageIntro title="Inbox" titleHidden />
        <div className="mb-3 flex items-center gap-2 border-b border-border/70 pb-3">
          <WorkspaceTabStrip
            ariaLabel="Inbox channels"
            tabs={inboxTabs}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as InboxTabId)}
            align="start"
            density="compact"
            className="mb-0 min-w-0 flex-1 border-b-0 pb-0"
          />
          {agents.length > 1 || activeAgentId ? (
            <select
              value={activeAgentId}
              onChange={(event) => setAgentScope(event.target.value)}
              aria-label="Filter Inbox by Bot"
              className="h-9 max-w-[9.5rem] shrink-0 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground outline-none focus:border-primary/50"
            >
              <option value="">All Bots</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="wl-inbox-route flex min-h-0 flex-1 flex-col">
          {activeTab === "email" ? (
            <EmailInbox embedded agentId={activeAgentId || null} />
          ) : (
            <SmsThreads embedded agentId={activeAgentId || null} />
          )}
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
