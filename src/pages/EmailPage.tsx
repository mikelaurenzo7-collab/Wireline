import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import EmailInbox from "../components/EmailInbox";
import SmsThreads from "../components/SmsThreads";
import {
  WorkspacePageFrame,
  WorkspacePageIntro,
} from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";

type InboxTabId = "email" | "sms";

type MailboxAccount = {
  id: string;
  emailAddress: string;
  provider: string;
  agentId?: string | null;
};

const inboxTabs: Array<{ id: InboxTabId; label: string }> = [
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
];

/**
 * Inbox owns written conversations. Bot and mailbox are orthogonal lenses over
 * one canonical Inbox, not separate duplicated workspaces.
 */
export default function EmailPage() {
  const [params, setParams] = useSearchParams();
  const { agents } = useAgents();
  const [mailboxes, setMailboxes] = useState<MailboxAccount[]>([]);

  const requestedTab = params.get("tab") as InboxTabId | null;
  const activeTab: InboxTabId = inboxTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as InboxTabId)
    : "email";
  const requestedAgentId = params.get("agent")?.trim() || "";
  const activeAgentId = agents.some((agent) => agent.id === requestedAgentId)
    ? requestedAgentId
    : "";

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/emails/accounts")
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => {
        if (cancelled || !Array.isArray(body?.accounts)) return;
        setMailboxes(
          body.accounts.filter(
            (account: unknown): account is MailboxAccount =>
              Boolean(account) &&
              typeof account === "object" &&
              typeof (account as MailboxAccount).id === "string" &&
              typeof (account as MailboxAccount).emailAddress === "string",
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const availableMailboxes = useMemo(
    () =>
      activeAgentId
        ? mailboxes.filter((mailbox) => mailbox.agentId === activeAgentId)
        : mailboxes,
    [activeAgentId, mailboxes],
  );
  const requestedAccountId = params.get("account")?.trim() || "";
  const activeAccountId = availableMailboxes.some(
    (mailbox) => mailbox.id === requestedAccountId,
  )
    ? requestedAccountId
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
    updateParams((updated) => {
      updated.set("tab", tab);
      if (tab !== "email") updated.delete("account");
    });
  }

  function setAgentScope(agentId: string) {
    updateParams((updated) => {
      if (agentId) updated.set("agent", agentId);
      else updated.delete("agent");
      updated.delete("account");
    });
  }

  function setMailboxScope(accountId: string) {
    updateParams((updated) => {
      if (accountId) updated.set("account", accountId);
      else updated.delete("account");
    });
  }

  const showBotFilter = agents.length > 1 || Boolean(activeAgentId);
  const showMailboxFilter =
    activeTab === "email" && (availableMailboxes.length > 1 || Boolean(activeAccountId));

  return (
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-4">
      <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageIntro title="Inbox" titleHidden />
        <div className="mb-3 flex flex-col gap-2 border-b border-border/70 pb-3 sm:flex-row sm:items-center">
          <WorkspaceTabStrip
            ariaLabel="Inbox channels"
            tabs={inboxTabs}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as InboxTabId)}
            align="start"
            density="compact"
            className="mb-0 min-w-0 flex-1 border-b-0 pb-0"
          />
          {showBotFilter || showMailboxFilter ? (
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 sm:shrink-0 sm:justify-end sm:overflow-visible sm:pb-0">
              {showBotFilter ? (
                <select
                  value={activeAgentId}
                  onChange={(event) => setAgentScope(event.target.value)}
                  aria-label="Filter Inbox by Bot"
                  className="h-9 min-w-0 max-w-[10rem] shrink-0 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">All Bots</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {showMailboxFilter ? (
                <select
                  value={activeAccountId}
                  onChange={(event) => setMailboxScope(event.target.value)}
                  aria-label="Filter email by mailbox"
                  className="h-9 min-w-0 max-w-[13rem] shrink-0 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">All mailboxes</option>
                  {availableMailboxes.map((mailbox) => (
                    <option key={mailbox.id} value={mailbox.id}>
                      {mailbox.emailAddress}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="wl-inbox-route flex min-h-0 flex-1 flex-col">
          {activeTab === "email" ? (
            <EmailInbox
              embedded
              agentId={activeAgentId || null}
              accountId={activeAccountId || null}
            />
          ) : (
            <SmsThreads embedded agentId={activeAgentId || null} />
          )}
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}