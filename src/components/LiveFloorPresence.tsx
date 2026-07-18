import { PhoneCall } from "lucide-react";

import { WL_APP_CLASSES } from "../lib/wireline-design-system";

export type LiveSignalPresence = {
  id: string;
  agentId?: string | null;
  customerNumber?: string | null;
  status?: string | null;
  label?: string | null;
};

function isActiveSignal(signal: LiveSignalPresence): boolean {
  const status = (signal.status || "").toLowerCase();
  return Boolean(status) && !["ended", "completed"].includes(status);
}

export default function LiveFloorPresence({
  signals,
  agentNameForId,
}: {
  signals: LiveSignalPresence[];
  agentNameForId: (agentId: string) => string;
}) {
  const active = signals.filter(isActiveSignal).filter((signal) => signal.agentId);
  if (!active.length) return null;

  return (
    <section
      className="mb-5 rounded-xl border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] p-4 sm:p-5"
      aria-label="Live customer calls"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={WL_APP_CLASSES.wiredEyebrow}>Live now</p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {active.length} customer call{active.length === 1 ? "" : "s"} in progress
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Live until each call ends and its outcome is recorded.
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-[var(--wireline-color-status-success)]">
          <PhoneCall className="size-5" aria-hidden="true" />
        </span>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {active.slice(0, 4).map((signal) => (
          <li
            key={signal.id}
            className="rounded-lg border border-border/70 bg-background px-3 py-2.5"
          >
            <p className="truncate text-sm font-semibold text-foreground">
              {signal.customerNumber || "Active caller"}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {agentNameForId(signal.agentId!)} · {signal.label || signal.status || "In progress"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
