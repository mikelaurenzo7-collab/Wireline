import { useSearchParams } from "react-router-dom";

import EmailInbox from "../components/EmailInbox";
import SmsThreads from "../components/SmsThreads";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";

type InboxTabId = "email" | "sms";

const inboxTabs: Array<{ id: InboxTabId; label: string }> = [
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
];

/**
 * Inbox — email + SMS in one workspace surface.
 */
export default function EmailPage() {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab") as InboxTabId | null;
  const activeTab: InboxTabId = inboxTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as InboxTabId)
    : "email";

  function setActiveTab(tab: InboxTabId) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set("tab", tab);
        return updated;
      },
      { replace: true },
    );
  }

  return (
    <WorkspaceShell contentClassName="pt-1 pb-8">
      <WorkspacePageFrame className="min-h-full flex-1">
        <WorkspacePageIntro title="Inbox" />
        <WorkspaceTabStrip
          ariaLabel="Inbox channels"
          tabs={inboxTabs}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as InboxTabId)}
        />
        <div className="wl-inbox-route flex min-h-0 flex-1 flex-col">
          {activeTab === "email" ? <EmailInbox embedded /> : <SmsThreads embedded />}
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
