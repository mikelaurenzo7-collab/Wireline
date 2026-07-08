import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";

import { authFetch } from "../lib/api";
import {
  formatOutcomeLabel,
  summarizeOutcomeRow,
  type OutcomeLedgerRow,
} from "../lib/outcome-ledger";
import type { CallLog } from "../types/api";

type OutcomeLedgerProps = {
  agentId?: string;
  limit?: number;
  compact?: boolean;
  showViewAll?: boolean;
};

function normalizeCall(row: Record<string, unknown>): OutcomeLedgerRow {
  return {
    id: String(row.id ?? ""),
    agent_id: String(row.agent_id ?? row.agentId ?? ""),
    customer_number: String(row.customer_number ?? row.customerNumber ?? ""),
    direction: (row.direction as CallLog["direction"]) ?? "inbound",
    duration_seconds: Number(row.duration_seconds ?? row.durationSeconds ?? 0),
    summary: (row.summary as string) ?? null,
    transcript: (row.transcript as string) ?? null,
    outcome_tag: (row.outcome_tag ?? row.outcomeTag ?? null) as string | null,
    lead_score: (row.lead_score ?? row.leadScore ?? null) as number | null,
    campaign_source: (row.campaign_source ?? row.campaignSource ?? null) as string | null,
    created_at: String(row.created_at ?? row.createdAt ?? ""),
  };
}

export default function OutcomeLedger({
  agentId,
  limit = 8,
  compact = false,
  showViewAll = true,
}: OutcomeLedgerProps) {
  const [rows, setRows] = useState<OutcomeLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callsRes, tasksRes] = await Promise.all([
        authFetch(`/api/calls?limit=${limit}`),
        authFetch("/api/Assistants/tasks?status=pending"),
      ]);
      const callsBody = callsRes.ok ? await callsRes.json() : { calls: [] };
      const tasksBody = tasksRes.ok ? await tasksRes.json() : { tasks: [] };
      const calls = Array.isArray(callsBody?.calls) ? callsBody.calls : [];
      const tasks = Array.isArray(tasksBody?.tasks) ? tasksBody.tasks : [];
      const taskCountBySource = new Map<string, number>();
      for (const task of tasks) {
        const sourceId = String(task.source_id || task.sourceId || "");
        if (!sourceId) continue;
        taskCountBySource.set(sourceId, (taskCountBySource.get(sourceId) || 0) + 1);
      }
      const normalized = calls
        .map((row: Record<string, unknown>) => normalizeCall(row))
        .filter((row: OutcomeLedgerRow) => !agentId || row.agent_id === agentId)
        .map((row: OutcomeLedgerRow) => ({
          ...row,
          pending_task_count: taskCountBySource.get(row.id) || 0,
        }));
      setRows(normalized);
    } catch {
      setError("Could not load outcome ledger.");
    } finally {
      setLoading(false);
    }
  }, [agentId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading outcomes…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No call outcomes yet. Complete a live call to populate the ledger.
      </p>
    );
  }

  return (
    <div className={compact ? "grid gap-2" : "grid gap-3"}>
      {rows.map((row) => (
        <article key={row.id} className="rounded-xl border border-border bg-card px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              {formatOutcomeLabel(row.outcome_tag)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {row.direction} · {row.duration_seconds ?? 0}s
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{summarizeOutcomeRow(row)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {row.campaign_source ? <span>Source: {row.campaign_source}</span> : null}
            {row.lead_score != null ? <span>Score: {row.lead_score}</span> : null}
            {(row.pending_task_count ?? 0) > 0 ? (
              <Link to="/approvals" className="font-semibold text-primary hover:underline">
                {row.pending_task_count} pending action
                {(row.pending_task_count ?? 0) === 1 ? "" : "s"}
              </Link>
            ) : null}
          </div>
        </article>
      ))}
      {showViewAll ? (
        <Link
          to="/phone?tab=logs"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          View all calls
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
