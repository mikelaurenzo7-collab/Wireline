import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router";

import { Button } from "../components/atoms";
import EmailInbox from "../components/EmailInbox";
import { StatusNotice } from "../components/molecules";
import SmsThreads from "../components/SmsThreads";
import WorkspaceControlBand from "../components/layout/WorkspaceControlBand";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
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
  const {
    agents,
    loading: agentsLoading,
    degraded: agentsDegraded,
    refresh: refreshAgents,
  } = useAgents();
  const [mailboxes, setMailboxes] = useState<MailboxAccount[]>([]);
  const [mailboxStatus, setMailboxStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mailboxAttempt, setMailboxAttempt] = useState(0);

  const requestedTab = params.get("tab") as InboxTabId | null;
  const activeTab: InboxTabId = inboxTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as InboxTabId)
    : "email";
  const requestedAgentId = params.get("agent")?.trim() || "";
  // A deep link is an explicit scope. Never substitute an all-Bot/all-mailbox
  // request while its metadata is loading, unavailable, or no longer valid.
  const activeAgentId = requestedAgentId;
  const hasRequestedAgent = agents.some((agent) => agent.id === requestedAgentId);

  useEffect(() => {
    let cancelled = false;
    setMailboxStatus("loading");
    authFetch("/api/emails/accounts")
      .then(async (response) => {
        if (!response.ok) throw new Error("Mailbox lookup unavailable");
        return response.json();
      })
      .then((body) => {
        if (cancelled) return;
        if (!Array.isArray(body?.accounts)) throw new Error("Mailbox lookup unavailable");
        setMailboxes(
          body.accounts.filter(
            (account: unknown): account is MailboxAccount =>
              Boolean(account) &&
              typeof account === "object" &&
              typeof (account as MailboxAccount).id === "string" &&
              typeof (account as MailboxAccount).emailAddress === "string",
          ),
        );
        setMailboxStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMailboxStatus("error");
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
  const activeAccountId = activeTab === "email" ? requestedAccountId : "";
  const hasRequestedAccount = availableMailboxes.some((mailbox) => mailbox.id === activeAccountId);
  const scopeLoading = Boolean(
    (activeAgentId && agentsLoading) || (activeAccountId && mailboxStatus === "loading"),
  );
  const scopeError =
    activeAgentId && !agentsLoading && !hasRequestedAgent
      ? agentsDegraded
        ? "We couldn't verify this Bot. Retry to load its conversations."
        : "This Bot is no longer available. Choose another Bot or clear the filters."
      : activeAccountId && mailboxStatus !== "loading" && !hasRequestedAccount
        ? mailboxStatus === "error"
          ? "We couldn't verify this mailbox. Retry to load its conversations."
          : "This mailbox is no longer available in this view. Choose another mailbox or clear the filters."
        : activeAccountId && mailboxStatus === "error"
          ? "We couldn't verify this mailbox. Retry to load its conversations."
          : null;

  function retryScope() {
    if (activeAgentId) refreshAgents();
    if (activeTab === "email") {
      setMailboxStatus("loading");
      setMailboxAttempt((attempt) => attempt + 1);
    }
  }

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

  function clearScope() {
    updateParams((updated) => {
      updated.delete("agent");
      updated.delete("account");
    });
  }

  const showBotFilter = agents.length > 1 || Boolean(activeAgentId);
  const showMailboxFilter =
    activeTab === "email" && (availableMailboxes.length > 1 || Boolean(activeAccountId));
  const scopeControls =
    showBotFilter || showMailboxFilter ? (
      <>
        {showBotFilter ? (
          <select
            value={activeAgentId}
            onChange={(event) => setAgentScope(event.target.value)}
            aria-label="Filter Inbox by Bot"
            className="min-h-[44px] min-w-0 max-w-[10rem] shrink-0 rounded-lg border border-border bg-card px-3 text-base font-semibold text-foreground sm:min-h-9 sm:px-2 sm:text-xs wl-focus-ring-halo"
          >
            <option value="">All Bots</option>
            {activeAgentId && !hasRequestedAgent ? (
              <option value={activeAgentId} disabled>
                {agentsLoading ? "Loading Bot…" : "Selected Bot unavailable"}
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
            value={activeAccountId}
            onChange={(event) => setMailboxScope(event.target.value)}
            aria-label="Filter email by mailbox"
            className="min-h-[44px] min-w-0 max-w-[13rem] shrink-0 rounded-lg border border-border bg-card px-3 text-base font-semibold text-foreground sm:min-h-9 sm:px-2 sm:text-xs wl-focus-ring-halo"
          >
            <option value="">All mailboxes</option>
            {activeAccountId && !hasRequestedAccount ? (
              <option value={activeAccountId} disabled>
                {mailboxStatus === "loading" ? "Loading mailbox…" : "Selected mailbox unavailable"}
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
              ariaLabel="Inbox sections"
              tabs={[...inboxTabs, { id: "approvals", label: "Approvals", href: "/approvals" }]}
              activeId={activeTab}
              onSelect={(id) => setActiveTab(id as InboxTabId)}
              align="start"
              density="compact"
              className="mb-0 min-w-0 flex-1 border-b-0 pb-0"
            />
          }
          secondary={scopeControls}
        />
        {mailboxStatus === "error" && activeTab === "email" && !activeAccountId && !scopeError ? (
          <StatusNotice
            tone="warning"
            title="Mailbox filters unavailable"
            className="mb-3"
            action={
              <Button variant="secondary" size="sm" onClick={retryScope}>
                Retry
              </Button>
            }
          >
            Conversations remain available. Retry to restore mailbox filters.
          </StatusNotice>
        ) : null}
        <div className="wl-inbox-route flex min-h-0 flex-1 flex-col">
          {scopeLoading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading selected inbox…
            </div>
          ) : scopeError ? (
            <StatusNotice tone="warning" title="Selected inbox unavailable" className="my-3">
              <p>{scopeError}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={retryScope}>
                  Retry
                </Button>
                <Button variant="ghost" size="sm" onClick={clearScope}>
                  Clear filters
                </Button>
              </div>
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
