import { useSearchParams } from "react-router-dom";

import EmailInbox from "../components/EmailInbox";
import SmsThreads from "../components/SmsThreads";
import WorkspaceShell from "../components/WorkspaceShell";

type InboxTabId = "email" | "sms";

const inboxTabs: Array<{ id: InboxTabId; label: string }> = [
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
];

/**
 * Inbox — the Claude Design Email + SMS surface.
 *
 * One workspace, two channels. Each tab mounts the real thread component
 * (Wireline data via /api/emails/threads + /api/sms/threads) under a
 * shared Letterpress tab strip.
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
    <WorkspaceShell eyebrow="Conversations" title="Inbox" contentClassName="pt-2 pb-8">
      <div className="wl-inbox-route flex min-h-full flex-col">
        <nav
          aria-label="Inbox channels"
          className="mb-4 flex min-h-[44px] items-center gap-2 border-b border-[var(--wireline-color-border-default)] pb-3"
        >
          {inboxTabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setActiveTab(tab.id)}
                className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-[6px] px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--wireline-color-action-primary-default)]"
                style={
                  active
                    ? {
                        background: "var(--wireline-color-action-primary-default)",
                        color: "var(--wireline-color-text-onAction)",
                      }
                    : { color: "var(--wireline-color-text-secondary)" }
                }
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="min-h-0 flex-1">
          {activeTab === "email" ? <EmailInbox embedded /> : <SmsThreads embedded />}
        </div>
      </div>
    </WorkspaceShell>
  );
}
