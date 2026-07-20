import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList } from "lucide-react";

import { authFetch } from "../lib/api";
import { Button, EmptyState } from "./atoms";
import { CardRowSkeleton } from "./atoms/skeleton-presets";
import { StatusNotice } from "./molecules";
import {
  deriveLifecycleStatus,
  formatLifecycleLabel,
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
  /** Shown only when outcomes exist — avoids empty-state CTA noise. */
  followUpsHref?: string;
};

type TaskLite = {
  source_id?: string | null;
  sourceId?: string | null;
  status?: string | null;
  task_type?: string | null;
  taskType?: string | null;
};

function normalizeCall(row: Record<string, unknown>): OutcomeLedgerRow {
  return {
    id: String(row.id ?? ""),
    agent_id: String(row.agent_id ?? row.agentId ?? ""),
    customer_number: (row.customer_number ?? row.customerNumber ?? null) as string | null,
    direction: (row.direction as CallLog["direction"]) ?? "inbound",
    duration_seconds: Number(row.duration_seconds ?? row.durationSeconds ?? 0),
    cost: Number(row.cost ?? 0),
    summary: (row.summary as string) ?? null,
    transcript: (row.transcript as string) ?? null,
    recording_url: (row.recording_url ?? row.recordingUrl ?? null) as string | null,
    intent_label: (row.intent_label ?? row.intentLabel ?? null) as CallLog["intent_label"],
    sentiment: (row.sentiment as CallLog["sentiment"]) ?? null,
    coaching_note: (row.coaching_note ?? row.coachingNote ?? null) as string | null,
    outcome_tag: (row.outcome_tag ?? row.outcomeTag ?? null) as string | null,
    lead_score: (row.lead_score ?? row.leadScore ?? null) as number | null,
    campaign_source: (row.campaign_source ?? row.campaignSource ?? null) as string | null,
    created_at: String(row.created_at ?? row.createdAt ?? ""),
    owner_label: (row.agent_name ?? row.agentName ?? null) as string | null,
  };
}

export default function OutcomeLedger({
  agentId,
  limit = 8,
  compact = false,
  showViewAll = true,
  followUpsHref,
}: OutcomeLedgerProps) {
  const [rows, setRows] = useState<OutcomeLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callsRes, pendingRes, completedRes] = await Promise.all([
        authFetch(`/api/calls?limit=${limit}`),
        authFetch("/api/Assistants/tasks?status=pending"),
        authFetch("/api/Assistants/tasks?status=completed"),
      ]);
      const callsBody = callsRes.ok ? await callsRes.json() : { calls: [] };
      const pendingBody = pendingRes.ok ? await pendingRes.json() : { tasks: [] };
      const completedBody = completedRes.ok ? await completedRes.json() : { tasks: [] };
      const calls = Array.isArray(callsBody?.calls) ? callsBody.calls : [];
      const pendingTasks = (
        Array.isArray(pendingBody?.tasks) ? pendingBody.tasks : []
      ) as TaskLite[];
      const completedTasks = (
        Array.isArray(completedBody?.tasks) ? completedBody.tasks : []
      ) as TaskLite[];

      const pendingBySource = new Map<string, TaskLite[]>();
      const completedBySource = new Map<string, TaskLite[]>();
      for (const task of pendingTasks) {
        const sourceId = String(task.source_id || task.sourceId || "");
        if (!sourceId) continue;
        const list = pendingBySource.get(sourceId) || [];
        list.push(task);
        pendingBySource.set(sourceId, list);
      }
      for (const task of completedTasks) {
        const sourceId = String(task.source_id || task.sourceId || "");
        if (!sourceId) continue;
        const list = completedBySource.get(sourceId) || [];
        list.push(task);
        completedBySource.set(sourceId, list);
      }

      const normalized = calls
        .map((row: Record<string, unknown>) => normalizeCall(row))
        .filter((row: OutcomeLedgerRow) => !agentId || row.agent_id === agentId)
        .map((row: OutcomeLedgerRow) => {
          const pending = pendingBySource.get(row.id) || [];
          const completed = completedBySource.get(row.id) || [];
          const lastAction = pending[0] || completed[0];
          const pending_task_count = pending.length;
          const completed_task_count = completed.length;
          const last_action_type = (lastAction?.task_type || lastAction?.taskType || null) as
            | string
            | null;
          const last_action_status = (lastAction?.status || null) as string | null;
          const lifecycle_status = deriveLifecycleStatus({
            outcomeTag: row.outcome_tag,
            pendingTaskCount: pending_task_count,
            completedTaskCount: completed_task_count,
            lastActionStatus: last_action_status,
          });
          return {
            ...row,
            pending_task_count,
            completed_task_count,
            last_action_type,
            last_action_status,
            lifecycle_status,
            compliance_state:
              (row.outcome_tag || "").toLowerCase() === "dnc" ? "dnc_honored" : "clear",
          };
        });
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
    return <CardRowSkeleton rows={compact ? 3 : Math.min(limit, 4)} />;
  }

  if (error) {
    return (
      <StatusNotice
        tone="destructive"
        title="Customer outcomes unavailable"
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        }
      >
        {error}
      </StatusNotice>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        density="compact"
        titleTone="ui"
        withHalo={false}
        icon={<ClipboardList aria-hidden="true" />}
        title="No call outcomes yet"
        description="Complete a live call to populate the ledger."
        action={
          <Button asChild size="sm">
            <Link
              to={
                agentId
                  ? `/studio?agent=${encodeURIComponent(agentId)}&section=test`
                  : "/studio?create=1"
              }
            >
              Test a call
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className={compact ? "grid gap-2" : "grid gap-3"}>
      {followUpsHref ? (
        <div className="mb-1 flex justify-end">
          <Link to={followUpsHref} className="text-xs font-semibold text-primary hover:underline">
            Review follow-ups →
          </Link>
        </div>
      ) : null}
      {rows.map((row) => (
        <article key={row.id} className="rounded-xl border border-border bg-card px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                {formatOutcomeLabel(row.outcome_tag)}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {formatLifecycleLabel(row.lifecycle_status)}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {row.direction} · {row.duration_seconds ?? 0}s
            </span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground sm:line-clamp-2">
            {summarizeOutcomeRow(row)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {row.owner_label ? <span>Owner: {row.owner_label}</span> : null}
            {row.campaign_source ? <span>Source: {row.campaign_source}</span> : null}
            {row.lead_score != null && row.lead_score > 0 ? (
              <span>Score: {row.lead_score}</span>
            ) : null}
            {row.compliance_state && row.compliance_state !== "clear" ? (
              <span>Compliance: {row.compliance_state}</span>
            ) : null}
            {row.last_action_type ? (
              <span>
                Last action: {row.last_action_type.replace(/_/g, " ")}
                {row.last_action_status ? ` (${row.last_action_status})` : ""}
              </span>
            ) : null}
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
