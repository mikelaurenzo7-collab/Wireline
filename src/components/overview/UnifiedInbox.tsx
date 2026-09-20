import { Inbox, MessageSquare } from "lucide-react";
import { Link } from "react-router";

import { Button, EmptyState, Skeleton } from "../atoms";
import { StatusNotice } from "../molecules";
import {
  conversationChannelHref,
  conversationChannelIcon,
  conversationChannelLabel,
  conversationPreview,
  formatConversationTime,
  type RecentConversation,
} from "./overview-types";

export default function UnifiedInbox({
  conversations,
  selectedId,
  onSelect,
  loading,
  unavailable,
}: {
  conversations: RecentConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  unavailable: boolean;
}) {
  const selected =
    conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0];
  const SelectedIcon = selected ? conversationChannelIcon(selected.channel) : Inbox;

  return (
    <section
      className="wl-paper wl-paper-elevated overflow-hidden"
      aria-labelledby="unified-inbox-title"
    >
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            Voice · Text · Email
          </p>
          <h2 id="unified-inbox-title" className="mt-1 text-lg font-semibold text-foreground">
            Unified Inbox
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            ["All", "/inbox"],
            ["Calls", "/inbox?tab=voice"],
            ["Texts", "/inbox?tab=sms"],
            ["Email", "/inbox?tab=email"],
          ].map(([label, href], index) => (
            <Link
              key={label}
              to={href}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                index === 0
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid min-h-[430px] lg:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.18fr)]">
        <div className="border-b border-border p-3 lg:border-b-0 lg:border-r">
          {loading ? (
            <div className="grid gap-2" aria-busy="true" aria-label="Loading conversations">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="rounded-xl border border-border p-3">
                  <Skeleton shape="text" className="h-4 w-32" />
                  <Skeleton shape="text" className="mt-2 h-3 w-full" />
                </div>
              ))}
            </div>
          ) : unavailable ? (
            <StatusNotice tone="warning" title="Inbox Preview Unavailable">
              Open Inbox or refresh to try again. Your conversation history is unchanged.
            </StatusNotice>
          ) : conversations.length === 0 ? (
            <EmptyState
              density="compact"
              titleTone="ui"
              icon={<Inbox aria-hidden="true" />}
              title="No Conversations Yet"
              action={
                <Button asChild size="sm">
                  <Link to="/studio">Test a Bot</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-1.5" aria-label="Recent customer conversations">
              {conversations.map((conversation) => {
                const Icon = conversationChannelIcon(conversation.channel);
                const active = selected?.id === conversation.id;
                return (
                  <li key={`${conversation.channel}-${conversation.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      aria-pressed={active}
                      className={`flex min-h-[72px] w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors wl-focus-ring-halo ${
                        active
                          ? "border-primary/30 bg-primary/5"
                          : "border-transparent hover:border-border hover:bg-muted/35"
                      }`}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <strong className="truncate text-sm font-semibold text-foreground">
                            {conversation.contact || "Unknown contact"}
                          </strong>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatConversationTime(conversation.occurred_at)}
                          </span>
                        </span>
                        <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                          {conversationPreview(conversation)}
                        </span>
                        <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                          {conversationChannelLabel(conversation.channel)}
                          {conversation.agent_name ? ` · ${conversation.agent_name}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button asChild variant="secondary" size="sm" className="mt-3 w-full justify-center">
            <Link to="/inbox">Open Inbox</Link>
          </Button>
        </div>

        <div className="min-w-0 p-5 sm:p-6">
          {selected ? (
            <div className="flex h-full min-h-[300px] flex-col">
              <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <SelectedIcon size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                      {conversationChannelLabel(selected.channel)} Conversation
                    </p>
                    <h3 className="mt-1 truncate text-xl font-semibold text-foreground">
                      {selected.contact || "Unknown Contact"}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        selected.agent_name,
                        formatConversationTime(selected.occurred_at, selected.duration_seconds),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <Button asChild variant="secondary" size="sm" className="shrink-0 justify-center">
                  <Link to={conversationChannelHref(selected.channel)}>Open Thread</Link>
                </Button>
              </div>

              <div className="flex flex-1 flex-col justify-between gap-6 py-6">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Conversation Summary
                  </p>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground">
                    {conversationPreview(selected)}
                  </p>
                  {selected.headline &&
                  selected.summary &&
                  selected.headline !== selected.summary ? (
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
                      {selected.summary}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ["Channel", conversationChannelLabel(selected.channel)],
                    ["Handled By", selected.agent_name || "BotBound Bot"],
                    ["Status", "Recorded"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border bg-muted/25 p-3">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {label}
                      </span>
                      <strong className="mt-1.5 block truncate text-sm font-semibold text-foreground">
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              density="compact"
              titleTone="ui"
              icon={<MessageSquare aria-hidden="true" />}
              title="Select a Conversation"
            />
          )}
        </div>
      </div>
    </section>
  );
}
