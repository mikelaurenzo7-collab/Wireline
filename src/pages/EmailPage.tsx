import { Mail, MessageSquareText } from "lucide-react";
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
        <section className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="wl-card-lg">
            <p
              className="wl-eyebrow"
              style={{ color: "var(--wireline-color-action-primary-default)" }}
            >
              One queue, two channels
            </p>
            <h2 className="mt-3 font-[var(--wireline-font-family-display)] text-[28px] font-normal leading-[1.05] tracking-[-0.025em] text-foreground">
              Review email threads and SMS follow-up without landing in a blank shell.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Outcomes, handoffs, and reply context should stay readable the moment the page opens —
              even while live data is still catching up.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div
              className="wl-card flex items-start gap-3"
              style={
                activeTab === "email"
                  ? {
                      borderColor: "color-mix(in srgb, var(--wireline-color-action-primary-default) 30%, var(--wireline-color-border-default))",
                    }
                  : undefined
              }
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--wireline-color-feedback-success-surface)] text-primary">
                <Mail size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Email outcomes</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Mark a thread resolved, waiting, booked, or ready for handoff.
                </p>
              </div>
            </div>
            <div
              className="wl-card flex items-start gap-3"
              style={
                activeTab === "sms"
                  ? {
                      borderColor: "color-mix(in srgb, var(--wireline-color-action-primary-default) 30%, var(--wireline-color-border-default))",
                    }
                  : undefined
              }
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--wireline-color-surface-subtle)] text-primary">
                <MessageSquareText size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">SMS follow-up</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Keep confirmations, reminders, and live message threads in the same lane.
                </p>
              </div>
            </div>
          </div>
        </section>
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
