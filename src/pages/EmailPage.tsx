import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import EmailInbox from "../components/EmailInbox";
import SmsThreads from "../components/SmsThreads";
import WorkspaceControlBand from "../components/layout/WorkspaceControlBand";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
import { authFetch } from "../lib/api";
import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";

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
  const { agents, loading: agentsLoading } = useAgents();
  const [mailboxes, setMailboxes] = useState<MailboxAccount[]>([]);
  const [mailboxesLoading, setMailboxesLoading] = useState(true);
  const [mailboxesError, setMailboxesError] = useState(false);
  const [mailboxAttempt, setMailboxAttempt] = useState(0);

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
    setMailboxesLoading(true);
    setMailboxesError(false);
    authFetch("/api/emails/accounts")
      .then(async (response) => {
        if (!response.ok) throw new Error("Mailboxes unavailable");
        return response.json();
      })
      .then((body) => {
        if (cancelled) return;
        if (!Array.isArray(body?.accounts)) throw new Error("Mailboxes unavailable");
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
      .catch(() => {
        if (!cancelled) setMailboxesError(true);
      })
      .finally(() => {
        if (!cancelled) setMailboxesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mailboxAttempt]);

  const availableMailboxes = useMemo(
    () =>
      activeAgentId ? mailboxes.filter((mailbox) => mailbox.agentId === activeAgentId) : mailboxes,
    [activeAgentId, mailboxes],
  );
  const requestedAccountId = params.get("account")?.trim() || "";
  const activeAccountId = availableMailboxes.some((mailbox) => mailbox.id === requestedAccountId)
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

  const scopedLoading =
    Boolean(requestedAgentId && agentsLoading) ||
    Boolean(activeTab === "email" && requestedAccountId && mailboxesLoading);
  const mailboxScopeUnavailable =
    activeTab === "email" && Boolean(requestedAccountId) && mailboxesError;
  const invalidScope =
    Boolean(requestedAgentId && !agentsLoading && !activeAgentId) ||
    Boolean(
      activeTab === "email" &&
      requestedAccountId &&
      !mailboxesLoading &&
      !mailboxesError &&
      !activeAccountId,
    );
  const showBotFilter = agents.length > 1 || Boolean(requestedAgentId);
  const showMailboxFilter =
    activeTab === "email" && (availableMailboxes.length > 1 || Boolean(requestedAccountId));
  const scopeControls =
    showBotFilter || showMailboxFilter ? (
      <>
        {showBotFilter ? (
          <select
            value={requestedAgentId}
            onChange={(event) => setAgentScope(event.target.value)}
            aria-label="Filter Inbox by Bot"
            className="min-h-[44px] min-w-0 max-w-[10rem] shrink-0 rounded-lg border border-border bg-card px-3 text-base font-semibold text-foreground sm:min-h-9 sm:px-2 sm:text-xs wl-focus-ring-halo"
          >
            <option value="">All Bots</option>
            {requestedAgentId && !activeAgentId ? (
              <option value={requestedAgentId} disabled>
                Selected Bot unavailable
              </option>
            ) : null}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        ) : null}
        {showMailboxFilter ? (
          <select
            value={requestedAccountId}
            onChange={(event) => setMailboxScope(event.target.value)}
            aria-label="Filter email by mailbox"
            className="min-h-[44px] min-w-0 max-w-[13rem] shrink-0 rounded-lg border border-border bg-card px-3 text-base font-semibold text-foreground sm:min-h-9 sm:px-2 sm:text-xs wl-focus-ring-halo"
          >
            <option value="">All mailboxes</option>
            {requestedAccountId && !activeAccountId ? (
              <option value={requestedAccountId} disabled>
                Selected mailbox unavailable
              </option>
            ) : null}
            {availableMailboxes.map((mailbox) => (
              <option key={mailbox.id} value={mailbox.id}>
                {mailbox.emailAddress}
              </option>
            ))}
          </select>
        ) : null}
      </>
    ) : undefined;

  return (
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-4">
      <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageIntro title="Inbox" titleHidden />
        <WorkspaceControlBand
          ariaLabel="Inbox controls"
          primary={
            <WorkspaceTabStrip
              ariaLabel="Inbox channels"
              tabs={inboxTabs}
              activeId={activeTab}
              onSelect={(id) => setActiveTab(id as InboxTabId)}
              align="start"
              density="compact"
              className="mb-0 min-w-0 flex-1 border-b-0 pb-0"
            />
          }
          secondary={scopeControls}
        />
        <div className="wl-inbox-route flex min-h-0 flex-1 flex-col">
          {scopedLoading ? (
            <StatusNotice title="Loading selected inbox" aria-busy="true">
              Checking the Bot and mailbox in this link.
            </StatusNotice>
          ) : mailboxScopeUnavailable ? (
            <StatusNotice
              tone="warning"
              title="Selected mailbox unavailable"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setMailboxAttempt((value) => value + 1)}
                >
                  Try again
                </Button>
              }
            >
              Your mailbox filter is preserved. Retry when the connection recovers.
            </StatusNotice>
          ) : invalidScope ? (
            <StatusNotice
              tone="warning"
              title="Choose an available inbox"
              action={
                <Button type="button" variant="secondary" onClick={() => setAgentScope("")}>
                  Show all conversations
                </Button>
              }
            >
              The Bot or mailbox in this link is no longer available. Choose a filter above or
              explicitly show all conversations.
            </StatusNotice>
          ) : activeTab === "email" ? (
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
