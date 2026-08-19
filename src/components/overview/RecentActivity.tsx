import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

import {
  conversationChannelIcon,
  conversationChannelLabel,
  formatConversationTime,
  type RecentConversation,
} from "./overview-types";
import { Skeleton } from "../atoms";

function reportHref(conversation: RecentConversation) {
  const params = new URLSearchParams({
    tab: "all",
    conversation: conversation.id,
    channel: conversation.channel,
  });
  return `/inbox?${params.toString()}`;
}

/**
 * Home owns a glance, not the conversation record.
 *
 * Keep every row intentionally metadata-only: who, channel, bot, time. The
 * report/summary belongs behind the click in Inbox. This prevents generated
 * call prose from turning Home into a transcript wall while preserving a fast
 * route to the useful detail.
 */
export default function RecentActivity({
  conversations,
  loading,
  unavailable,
}: {
  conversations: RecentConversation[];
  loading: boolean;
  unavailable: boolean;
}) {
  return (
    <section className="wl-paper wl-paper-elevated overflow-hidden" aria-labelledby="recent-title">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
        <h2 id="recent-title" className="text-sm font-semibold text-foreground">
          Recent
        </h2>
        <Link to="/inbox" className="text-xs font-semibold text-primary hover:underline">
          Inbox
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-1 p-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex min-h-16 items-center gap-3 rounded-xl px-3 py-2">
              <Skeleton shape="surface" className="size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton shape="text" className="h-4 w-32" />
                <Skeleton shape="text" className="mt-2 h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      ) : unavailable ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Recent activity is temporarily unavailable.
        </div>
      ) : conversations.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No conversations yet.
        </div>
      ) : (
        <ul className="divide-y divide-border/70">
          {conversations.slice(0, 4).map((conversation) => {
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
                <Link
                  to={reportHref(conversation)}
                  className="group flex min-h-[68px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary/60 sm:px-5"
                  aria-label={`Open ${channel.toLowerCase()} report for ${conversation.contact}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {conversation.contact || "Unknown contact"}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{meta}</span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
