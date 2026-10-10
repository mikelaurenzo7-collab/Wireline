import { ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules/StatusNotice";

export type RuntimeBalanceEntry = {
  id: string;
  description: string;
  deltaUsd: number;
  balanceAfterUsd: number;
  createdAt: string | null;
};

const ENTRY_LABELS: Record<string, string> = {
  top_up: "Balance top-up",
  burn: "Runtime usage",
  refund: "Refund",
  adjustment: "Balance adjustment",
  grant: "Included allowance",
  reversal: "Balance reversal",
};

/** Keep internal reasons, provider IDs and metadata out of the customer view. */
export function readRuntimeBalanceEntries(value: unknown): RuntimeBalanceEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: RuntimeBalanceEntry[] = [];
  for (const item of value.slice(0, 20)) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !row.id ||
      typeof row.deltaUsd !== "number" ||
      !Number.isFinite(row.deltaUsd) ||
      typeof row.balanceAfterUsd !== "number" ||
      !Number.isFinite(row.balanceAfterUsd) ||
      (row.createdAt !== null &&
        (typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))))
    ) {
      return null;
    }
    const customerReason = typeof row.customerReason === "string" ? row.customerReason.trim() : "";
    const fallback =
      (typeof row.entryKind === "string" &&
        Object.hasOwn(ENTRY_LABELS, row.entryKind) &&
        ENTRY_LABELS[row.entryKind]) ||
      (row.deltaUsd < 0 ? "Balance debit" : "Balance credit");
    entries.push({
      id: row.id,
      // Legacy records copied the internal reason into customerReason.
      description: customerReason && customerReason !== row.reason ? customerReason : fallback,
      deltaUsd: row.deltaUsd,
      balanceAfterUsd: row.balanceAfterUsd,
      createdAt: row.createdAt as string | null,
    });
  }
  return entries;
}

function money(value: number) {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(2)}`;
}

export default function RuntimeBalanceActivity({
  entries,
  loading,
  unavailable,
  onRetry,
}: {
  entries: RuntimeBalanceEntry[] | null;
  loading: boolean;
  unavailable: boolean;
  onRetry: () => void;
}) {
  return (
    <details className="group mt-5 border-t border-border pt-2">
      <summary className="wl-focus-ring-halo flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        Recent Activity
        <ChevronDown
          className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-3 pb-1 pt-2">
        <p className="text-xs leading-5 text-muted-foreground">
          Up to 20 recent balance changes.{" "}
          <Link
            to="/insights?tab=revenue&view=spend"
            className="rounded-sm font-medium text-primary underline underline-offset-4 wl-focus-ring-halo"
          >
            AI spend
          </Link>{" "}
          is tracked separately.
        </p>
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            {entries ? "Refreshing activity…" : "Loading activity…"}
          </p>
        ) : unavailable ? (
          <StatusNotice
            tone="warning"
            title="Activity Unavailable"
            action={
              <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
                Retry Activity
              </Button>
            }
          >
            {entries ? "Showing last confirmed entries." : "Try again to load balance activity."}
          </StatusNotice>
        ) : null}
        {entries?.length ? (
          <ol aria-label="Recent Runtime Balance activity" className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
                <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                  <p className="text-sm font-medium text-foreground">{entry.description}</p>
                  {entry.createdAt ? (
                    <time
                      dateTime={entry.createdAt}
                      className="block text-xs text-muted-foreground"
                    >
                      {new Date(entry.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  ) : (
                    <p className="text-xs text-muted-foreground">Date unavailable</p>
                  )}
                </div>
                <div className="space-y-1 text-right tabular-nums">
                  <p className="whitespace-nowrap text-sm font-semibold text-foreground">
                    {entry.deltaUsd > 0 ? "+" : ""}
                    {money(entry.deltaUsd)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Balance {money(entry.balanceAfterUsd)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : entries && !loading && !unavailable ? (
          <p className="text-sm text-muted-foreground">No balance activity yet.</p>
        ) : null}
      </div>
    </details>
  );
}
