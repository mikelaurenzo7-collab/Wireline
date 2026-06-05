import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { WL_CHANNEL_CLASSES } from "../../lib/wireline-ops-design";

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
    <div className={cn(WL_CHANNEL_CLASSES.inboxList, detailOpen && "hidden lg:flex", className)}>
      <div className={WL_CHANNEL_CLASSES.inboxListHeader}>
        <span className="wl-label-muted">{label}</span>
        {count != null && (
          <span className="text-[10px] font-mono text-muted tabular-nums">{count}</span>
        )}
      </div>
      <div className="flex-1 min-h-0 scroll-viewport panel-scroll p-2">{children}</div>
    </div>
  );
}

/** Right detail column in a channel inbox. */
export function ChannelInboxDetailPane({
  detailOpen,
  children,
  className,
}: {
  detailOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(WL_CHANNEL_CLASSES.inboxDetail, !detailOpen && "hidden lg:flex", className)}>
      {children}
    </div>
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
