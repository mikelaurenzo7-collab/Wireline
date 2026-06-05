/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CallbacksList — Scheduled callback queue.
 * Extracted from the monolithic OutboundDialer.tsx.
 */
import { CalendarClock, Loader2, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { safeDate } from "../../lib/safe-date";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { EmptyState } from "../ui/EmptyState";
import {
  OPS_CHANNEL_EMPTY,
  OPS_CHANNEL_TOOLBAR,
  WL_OPS_CLASSES,
} from "../../lib/wireline-ops-design";

export default function CallbacksList({
  callbacks,
  loading,
  onRefresh,
}: {
  callbacks: any[];
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
        <p className="text-eyebrow">Loading callbacks</p>
      </div>
    );
  }

  if (callbacks.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        eyebrow={OPS_CHANNEL_EMPTY.callbacks.eyebrow}
        title={OPS_CHANNEL_EMPTY.callbacks.title}
        description={OPS_CHANNEL_EMPTY.callbacks.description}
        density="compact"
        withHalo={false}
        actions={[
          {
            label: OPS_CHANNEL_TOOLBAR.triage.refresh,
            onClick: onRefresh,
            primary: true,
          },
        ]}
      />
    );
  }

  const now = new Date();

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="text-eyebrow">{callbacks.length} scheduled · auto-dialed at due time</span>
        <ShadButton
          type="button"
          disableAnimations
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className={cn(
            "h-7 rounded-full text-[9px] uppercase tracking-[0.28em] text-muted hover:text-brand hover:border-brand/40 touch-press",
            WL_OPS_CLASSES.filterChip,
          )}
        >
          <RefreshCw className="w-2.5 h-2.5" /> {OPS_CHANNEL_TOOLBAR.triage.refresh}
        </ShadButton>
      </div>
      <ul className="flex-1 overflow-y-auto divide-y divide-white/5 scrollbar-hide">
        {callbacks.map((cb) => {
          const scheduledAt = safeDate(cb.callback_scheduled_at);
          if (!scheduledAt) return null;
          const isPast = scheduledAt < now;
          const minutesUntil = Math.max(
            0,
            Math.round((scheduledAt.getTime() - now.getTime()) / 60_000),
          );
          const relativeLabel = isPast
            ? "Dialing soon…"
            : minutesUntil < 60
              ? `in ${minutesUntil}m`
              : minutesUntil < 1440
                ? `in ${Math.round(minutesUntil / 60)}h`
                : scheduledAt.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });

          return (
            <li
              key={cb.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors touch-press"
            >
              <div
                className={cn(
                  "mt-0.5 w-2 h-2 rounded-full flex-shrink-0",
                  isPast ? "bg-amber-400 animate-pulse" : "bg-brand",
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink font-medium truncate">
                    {cb.customer_name || cb.customer_number}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] uppercase tracking-[0.3em] flex-shrink-0",
                      isPast ? "text-amber-600" : "text-brand",
                    )}
                  >
                    {relativeLabel}
                  </span>
                </div>
                {cb.customer_name && (
                  <p className="text-[10px] text-muted mt-0.5">{cb.customer_number}</p>
                )}
                {cb.last_contact_summary && (
                  <p className="text-[10px] text-ink/40 mt-1 line-clamp-1">
                    {cb.last_contact_summary}
                  </p>
                )}
                <p className="text-[9px] text-ink/40 mt-1">
                  {scheduledAt.toLocaleString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
