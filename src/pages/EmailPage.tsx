import { Link, useSearchParams } from "react-router-dom";
import { CheckSquare } from "lucide-react";

import EmailInbox from "../components/EmailInbox";
import SmsThreads from "../components/SmsThreads";
import { Button } from "../components/atoms";
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
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-8">
      <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageIntro
          title="Inbox"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link to="/approvals">
                  <CheckSquare className="size-3.5" aria-hidden="true" />
                  Approvals
                </Link>
              </Button>
              <WorkspaceTabStrip
                ariaLabel="Inbox channels"
                tabs={inboxTabs}
                activeId={activeTab}
                onSelect={(id) => setActiveTab(id as InboxTabId)}
                align="start"
                density="compact"
                className="mb-0 border-b-0 pb-0 md:w-auto"
              />
            </div>
          }
        />
        <div className="wl-inbox-route flex min-h-0 flex-1 flex-col">
          {activeTab === "email" ? <EmailInbox embedded /> : <SmsThreads embedded />}
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
