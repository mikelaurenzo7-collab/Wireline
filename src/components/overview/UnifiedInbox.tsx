import { Inbox } from "lucide-react";
import { Link } from "react-router";

import { Button, EmptyState, Skeleton } from "../atoms";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../atoms/Dialog";
import { StatusNotice } from "../molecules";
import {
  conversationChannelHref,
  conversationChannelIcon,
  conversationChannelLabel,
  conversationPreview,
  formatConversationTime,
  type RecentConversation,
} from "./overview-types";

/**
 * Compact omnichannel conversation index.
 *
 * Rows never render generated summaries. The report is progressive disclosure:
 * select a row, then read the summary in a focused dialog. This keeps the
 * high-frequency list scannable and prevents model prose from becoming UI chrome.
 */
export default function UnifiedInbox({
  conversations,
  selectedId,
  onSelect,
  loading,
  unavailable,
}: {
  conversations: RecentConversation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  loading: boolean;
  unavailable: boolean;
}) {
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  return (
    <section className="wl-paper wl-paper-elevated overflow-hidden" aria-label="Conversations">
      {loading ? (
        <div className="grid gap-1 p-2" aria-busy="true" aria-label="Loading conversations">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="flex min-h-[68px] items-center gap-3 px-3 py-2">
              <Skeleton shape="surface" className="size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton shape="text" className="h-4 w-36" />
                <Skeleton shape="text" className="mt-2 h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      ) : unavailable ? (
        <div className="p-4">
          <StatusNotice tone="warning" title="Inbox unavailable">
            Your conversation history is unchanged. Refresh to try again.
          </StatusNotice>
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          density="compact"
          titleTone="ui"
          icon={<Inbox aria-hidden="true" />}
          title="No conversations yet"
          action={
            <Button asChild size="sm">
              <Link to="/studio">Test a Bot</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border/70" aria-label="Recent conversations">
          {conversations.map((conversation) => {
            const Icon = conversationChannelIcon(conversation.channel);
            const channel = conversationChannelLabel(conversation.channel);
            const meta = [
              channel,
              conversation.agent_name?.trim() || null,
              formatConversationTime(conversation.occurred_at, conversation.duration_seconds),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={`${conversation.channel}:${conversation.id}`}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  className="group flex min-h-[70px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary/60 sm:px-5"
                  aria-label={`Open ${channel.toLowerCase()} report for ${conversation.contact}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-semibold text-foreground">
                      {conversation.contact || "Unknown contact"}
                    </strong>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{meta}</span>
                  </span>
                  <span className="text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    View
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && onSelect(null)}>
        {selected ? (
          <DialogContent presentation="drawer" className="sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:p-5">
            <div className="p-5 sm:p-0">
              <DialogHeader>
                <DialogTitle>{selected.contact || "Conversation"}</DialogTitle>
                <DialogDescription>
                  {[
                    conversationChannelLabel(selected.channel),
                    selected.agent_name?.trim() || null,
                    formatConversationTime(selected.occurred_at, selected.duration_seconds),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-5 border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Report
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground">{conversationPreview(selected)}</p>
                {selected.headline && selected.summary && selected.headline !== selected.summary ? (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{selected.summary}</p>
                ) : null}
              </div>

              <div className="mt-5 flex justify-end">
                <Button asChild size="sm" variant="secondary">
                  <Link to={conversationChannelHref(selected.channel)}>Open channel</Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}
