import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  Loader2,
  Mail,
  MessageSquare,
  Shield,
  Sparkles,
  X,
} from "lucide-react";

import { authFetch } from "../lib/api";
import { emitProductEventOnce } from "../lib/product-event-client";
import { ShadButton } from "./ui/shadcn/ShadButton";

export type FollowUpTaskRow = {
  id: string;
  task_type?: string;
  taskType?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  payload?: Record<string, unknown> | null;
  customer_info?: Record<string, unknown> | null;
  customerInfo?: Record<string, unknown> | null;
  source_type?: string | null;
  sourceType?: string | null;
  source_id?: string | null;
  sourceId?: string | null;
  agent?: { name?: string | null };
  agentId?: string | null;
  agent_id?: string | null;
  created_at?: string;
  createdAt?: string;
};

export type TriageBucket = {
  hot_leads: Array<Record<string, unknown>>;
  compliance: FollowUpTaskRow[];
  pending_tasks: FollowUpTaskRow[];
  knowledge_gaps: Array<Record<string, unknown>>;
  escalations: Array<Record<string, unknown>>;
  counts?: Record<string, number>;
};

type ApprovalBucket = "pending" | "compliance" | "hot_leads" | "escalations" | "knowledge_gaps";

const BUCKET_LABELS: Record<ApprovalBucket, string> = {
  pending: "Pending actions",
  compliance: "Compliance",
  hot_leads: "Hot leads",
  escalations: "Escalations",
  knowledge_gaps: "Knowledge gaps",
};

function taskType(task: FollowUpTaskRow): string {
  return (task.task_type || task.taskType || "action").replace(/_/g, " ");
}

function evidenceSnippet(task: FollowUpTaskRow): string {
  const payload = (task.payload || task.customer_info || task.customerInfo || {}) as Record<
    string,
    unknown
  >;
  const parts: string[] = [];
  if (typeof payload.body === "string") parts.push(payload.body);
  if (typeof payload.summary === "string") parts.push(payload.summary);
  if (typeof payload.reasoning === "string") parts.push(payload.reasoning);
  if (task.description) parts.push(task.description);
  if (typeof payload.to === "string") parts.unshift(`To: ${payload.to}`);
  return parts.filter(Boolean).join("\n\n").slice(0, 600) || "No evidence snippet attached.";
}

function actionIcon(task: FollowUpTaskRow) {
  const type = taskType(task).toLowerCase();
  if (type.includes("email")) return <Mail size={16} aria-hidden="true" />;
  if (type.includes("calendar") || type.includes("book")) {
    return <Calendar size={16} aria-hidden="true" />;
  }
  if (type.includes("compliance")) return <Shield size={16} aria-hidden="true" />;
  if (type.includes("text") || type.includes("sms")) {
    return <MessageSquare size={16} aria-hidden="true" />;
  }
  return <Sparkles size={16} aria-hidden="true" />;
}

type ApprovalTaskCardProps = {
  task: FollowUpTaskRow;
  onResolved: () => void;
};

function ApprovalTaskCard({ task, onResolved }: ApprovalTaskCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState(task.description || "");

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      if (editing && editNotes.trim() !== (task.description || "")) {
        const patch = await authFetch(`/api/Assistants/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution_notes: editNotes.trim() }),
        });
        if (!patch.ok) throw new Error("Could not save edits before approval.");
      }
      const response = await authFetch(`/api/Assistants/tasks/${task.id}/approve`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Approval failed.");
      emitProductEventOnce({
        event: "first_next_action_approved",
        agentId: task.agentId || task.agent_id || undefined,
        metadata: { task_id: task.id, task_type: task.task_type || task.taskType || "unknown" },
      });
      onResolved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError(null);
    try {
      const response = await authFetch(`/api/Assistants/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "cancelled",
          resolution_notes: "Rejected from Approval Inbox",
        }),
      });
      if (!response.ok) throw new Error("Could not reject this action.");
      onResolved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reject failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {actionIcon(task)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold capitalize text-foreground">{taskType(task)}</h3>
            {task.priority ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {task.priority}
              </span>
            ) : null}
            {task.agent?.name ? (
              <span className="text-xs text-muted-foreground">{task.agent.name}</span>
            ) : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {evidenceSnippet(task)}
          </p>
          {editing ? (
            <textarea
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              rows={3}
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
              placeholder="Edit proposed action notes before approval"
            />
          ) : null}
          {error ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle size={12} aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <ShadButton type="button" size="sm" disabled={busy} onClick={() => void approve()}>
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Approve
            </ShadButton>
            <ShadButton
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Cancel edit" : "Edit"}
            </ShadButton>
            <ShadButton
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void reject()}
            >
              <X className="size-3.5" />
              Reject
            </ShadButton>
          </div>
        </div>
      </div>
    </article>
  );
}

type ApprovalInboxProps = {
  embedded?: boolean;
};

export default function ApprovalInbox({ embedded = false }: ApprovalInboxProps) {
  const [bucket, setBucket] = useState<ApprovalBucket>("pending");
  const [triage, setTriage] = useState<TriageBucket | null>(null);
  const [tasks, setTasks] = useState<FollowUpTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [triageRes, tasksRes] = await Promise.all([
        authFetch("/api/triage"),
        authFetch("/api/Assistants/tasks?status=pending"),
      ]);
      const triageBody = triageRes.ok ? await triageRes.json() : null;
      const tasksBody = tasksRes.ok ? await tasksRes.json() : { tasks: [] };
      setTriage(triageBody);
      setTasks(Array.isArray(tasksBody?.tasks) ? tasksBody.tasks : []);
    } catch {
      setError("Could not load approval inbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bucketItems = useMemo(() => {
    if (!triage) return [];
    switch (bucket) {
      case "pending":
        return triage.pending_tasks?.length ? triage.pending_tasks : tasks;
      case "compliance":
        return triage.compliance || [];
      case "hot_leads":
        return (triage.hot_leads || []).map((lead) => ({
          id: String(lead.id),
          description: typeof lead.summary === "string" ? lead.summary : "Hot lead follow-up",
          task_type: "hot_lead_review",
          payload: lead,
        })) as FollowUpTaskRow[];
      case "escalations":
        return (triage.escalations || []).map((row) => ({
          id: String(row.id),
          description: typeof row.summary === "string" ? row.summary : "Escalated call",
          task_type: "escalation_review",
          payload: row,
        })) as FollowUpTaskRow[];
      case "knowledge_gaps":
        return (triage.knowledge_gaps || []).map((gap) => ({
          id: String(gap.id),
          description: typeof gap.lesson === "string" ? gap.lesson : "Knowledge gap",
          task_type: "knowledge_gap",
          payload: gap,
        })) as FollowUpTaskRow[];
      default:
        return [];
    }
  }, [bucket, tasks, triage]);

  const actionableTasks = bucketItems.filter(
    (item) => item.task_type !== "hot_lead_review" && item.task_type !== "escalation_review",
  );

  return (
    <div className={embedded ? "flex min-h-0 flex-1 flex-col gap-4" : "grid gap-4"}>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(BUCKET_LABELS) as ApprovalBucket[]).map((key) => {
          const count =
            key === "pending"
              ? (triage?.counts?.pending_tasks ?? tasks.length)
              : (triage?.counts?.[key] ?? triage?.[key]?.length ?? 0);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setBucket(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                bucket === key
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/25"
              }`}
            >
              {BUCKET_LABELS[key]}
              {typeof count === "number" ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading approvals…
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : bucket === "pending" || bucket === "compliance" ? (
        actionableTasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No pending actions. Completed calls with proposed follow-ups will appear here.
          </p>
        ) : (
          <div className="grid gap-3">
            {actionableTasks.map((task) => (
              <ApprovalTaskCard key={task.id} task={task} onResolved={() => void load()} />
            ))}
          </div>
        )
      ) : bucketItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing in this bucket right now.
        </p>
      ) : (
        <div className="grid gap-3">
          {bucketItems.map((item) => (
            <article key={item.id} className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold capitalize">{taskType(item)}</p>
              <p className="mt-2 text-sm text-muted-foreground">{evidenceSnippet(item)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
