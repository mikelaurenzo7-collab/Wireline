import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { WL_CHANNEL_CLASSES } from "../../lib/wireline-ops-design";

export function resolveChannelListNavigationIndex(
  currentIndex: number,
  key: string,
  length: number,
): number | null {
  if (length < 1) return null;
  if (key === "ArrowDown") return (currentIndex + 1) % length;
  if (key === "ArrowUp") return (currentIndex - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

/** Split-pane inbox grid — thread list + detail (email, SMS, call logs). */
export function ChannelInboxGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(WL_CHANNEL_CLASSES.inboxGrid, "min-h-0", className)}>{children}</div>;
}

/** Left list column in a channel inbox. */
export function ChannelInboxListPane({
  label,
  count,
  detailOpen,
  children,
  className,
}: {
  label: string;
  count?: number;
  /** When true, hide list on mobile (detail is showing). */
  detailOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(WL_CHANNEL_CLASSES.inboxList, detailOpen && "hidden lg:flex", className)}
      aria-label={`${label} list`}
    >
      <div className={WL_CHANNEL_CLASSES.inboxListHeader}>
        <span className="wl-label-muted">{label}</span>
        {count != null && (
          <span className="wl-micro-badge font-mono text-muted tabular-nums">{count}</span>
        )}
      </div>
      <div className="flex-1 min-h-0 scroll-viewport panel-scroll p-2">{children}</div>
    </section>
  );
}

/** Right detail column in a channel inbox. */
export function ChannelInboxDetailPane({
  detailOpen,
  label = "Selected channel detail",
  children,
  className,
}: {
  detailOpen?: boolean;
  /** Accessible landmark label for the selected thread/call detail region. */
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(WL_CHANNEL_CLASSES.inboxDetail, !detailOpen && "hidden lg:flex", className)}
      aria-label={label}
    >
      {children}
    </section>
  );
}

/** Shared column header row for phone channel list tables. */
export function ChannelListColHeader({
  columns,
  className,
}: {
  columns: { label: string; className?: string }[];
  className?: string;
}) {
  return (
    <div className={cn(WL_CHANNEL_CLASSES.listColHeader, className)} role="row">
      {columns.map((col) => (
        <span key={col.label} className={cn("wl-label-muted truncate", col.className)}>
          {col.label}
        </span>
      ))}
    </div>
  );
}
