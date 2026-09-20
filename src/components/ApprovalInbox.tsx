import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  Loader2,
  Mail,
  MessageSquare,
  Shield,
  Sparkles,
  UserRoundCheck,
  X,
} from "lucide-react";

import { authFetch } from "../lib/api";
import {
  parseApprovalTasks,
  parseTriageBucket,
  type FollowUpTaskRow,
  type TriageBucket,
} from "../lib/approval-inbox-response";
import { emitProductEventOnce } from "../lib/product-event-client";
import { formatPhone } from "../lib/safe-number";
import { EmptyState } from "./ui/EmptyState";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { WorkspaceTabStrip } from "./layout/WorkspaceTabStrip";
import { StatusNotice } from "./molecules";

type ApprovalBucket = "pending" | "compliance" | "hot_leads" | "escalations" | "knowledge_gaps";

const BUCKET_LABELS: Record<ApprovalBucket, string> = {
  pending: "Pending Actions",
  compliance: "Compliance",
  hot_leads: "Hot Leads",
  escalations: "Escalations",
  knowledge_gaps: "Knowledge Gaps",
};

// Short labels stay the same word as the full label, just clipped to the head
// noun (Hot leads → Hot, Knowledge gaps → Gaps). Avoid re-labelling to a
// narrower synonym ("Compliance" → "Consent") or a non-word ("Pending" →
// "Pend"): mobile and desktop must read as the same tab.
const BUCKET_SHORT_LABELS: Record<ApprovalBucket, string> = {
  pending: "Pending",
  compliance: "Compliance",
  hot_leads: "Hot",
  escalations: "Esc.",
  knowledge_gaps: "Gaps",
};

function rawTaskType(task: FollowUpTaskRow): string {
  return task.task_type || task.taskType || "action";
}

function taskType(task: FollowUpTaskRow): string {
  return rawTaskType(task).replace(/_/g, " ");
}

const TASK_TYPE_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  crm: "CRM",
  human_handoff: "Human Handoff",
  send_email: "Send Email",
  send_text_message: "Send Text Message",
  schedule_calendar: "Schedule Calendar",
  update_crm_lead: "Update CRM Lead",
  internal_task: "Internal Task",
  compliance_review: "Compliance Review",
  hot_lead_review: "Hot Lead Review",
  escalation_review: "Escalation Review",
  knowledge_gap: "Knowledge Gap",
  messenger_inbound: "Messenger Inbound",
  review_escalation: "Review Escalation",
  callback: "Callback",
  follow_up: "Follow-Up",
  ticket: "Ticket",
  customer_profile_captured: "Customer Profile Captured",
  human_escalation: "Human Escalation",
  post_call_note: "Post-Call Note",
};

function taskTypeLabel(task: FollowUpTaskRow): string {
  const key = rawTaskType(task).trim().toLowerCase();
  if (Object.hasOwn(TASK_TYPE_LABELS, key)) return TASK_TYPE_LABELS[key];
  return (
    key
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((word) =>
        ["sms", "crm", "api"].includes(word)
          ? word.toUpperCase()
          : word.charAt(0).toUpperCase() + word.slice(1),
      )
      .join(" ") || "Action"
  );
}

function isHumanHandoff(task: FollowUpTaskRow): boolean {
  return rawTaskType(task) === "human_handoff";
}

function evidenceSnippet(task: FollowUpTaskRow, omitEditableFields = false): string {
  const payload = (task.payload || task.customer_info || task.customerInfo || {}) as Record<
    string,
    unknown
  >;
  const parts: string[] = [];
  if (typeof payload.body === "string") parts.push(payload.body);
  if (typeof payload.summary === "string") parts.push(payload.summary);
  if (typeof payload.reasoning === "string") parts.push(payload.reasoning);
  if (task.description) parts.push(task.description);
  const editableBody = typeof payload.body === "string" ? payload.body : payload.description;
  const editableParts = omitEditableFields
    ? new Set(
        [editableBody, task.description]
          .filter((part): part is string => typeof part === "string")
          .map((part) => part.trim()),
      )
    : null;
  const uniqueParts = [
    ...new Set(
      parts.map((part) => part.trim()).filter((part) => part && !editableParts?.has(part)),
    ),
  ];
  if (typeof payload.to === "string") {
    const recipient = `To: ${payload.to}`;
    if (!uniqueParts.includes(recipient)) uniqueParts.unshift(recipient);
  }
  return (
    uniqueParts.join("\n\n").slice(0, 600) ||
    (omitEditableFields ? "" : "No evidence snippet attached.")
  );
}

function actionIcon(task: FollowUpTaskRow) {
  const type = taskType(task).toLowerCase();
  if (isHumanHandoff(task)) return <UserRoundCheck size={16} aria-hidden="true" />;
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

function ApprovalEmptyCard({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      framed
      density="compact"
      titleTone="ui"
      withHalo={false}
      className="mx-auto w-full max-w-4xl"
      icon={<Check className="size-5" aria-hidden="true" />}
      title={title}
      description={description}
      actions={[{ label: "Open Studio", to: "/studio", primary: true }]}
    />
  );
}

type ApprovalTaskCardProps = {
  task: FollowUpTaskRow;
  onResolved: () => void;
};

function editablePayloadFields(task: FollowUpTaskRow): Record<string, unknown> {
  const payload = (task.payload || task.customer_info || task.customerInfo || {}) as Record<
    string,
    unknown
  >;
  return { ...payload };
}

function ApprovalTaskCard({ task, onResolved }: ApprovalTaskCardProps) {
  const manualHandoff = isHumanHandoff(task);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState(task.description || "");
  const [editBody, setEditBody] = useState(() => {
    const payload = editablePayloadFields(task);
    return typeof payload.body === "string"
      ? payload.body
      : typeof payload.description === "string"
        ? payload.description
        : "";
  });
  const [editSubject, setEditSubject] = useState(() => {
    const payload = editablePayloadFields(task);
    return typeof payload.subject === "string" ? payload.subject : "";
  });
  const evidence = evidenceSnippet(task, editing && !manualHandoff);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      if (!manualHandoff && editing) {
        const basePayload = editablePayloadFields(task);
        const nextPayload: Record<string, unknown> = { ...basePayload };
        if (editSubject.trim()) nextPayload.subject = editSubject.trim();
        if (editBody.trim()) {
          if (
            "body" in basePayload ||
            taskType(task).includes("email") ||
            taskType(task).includes("text")
          ) {
            nextPayload.body = editBody.trim();
          } else if ("description" in basePayload) {
            nextPayload.description = editBody.trim();
          } else {
            nextPayload.body = editBody.trim();
          }
        }
        const patch = await authFetch(`/api/Assistants/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: editNotes.trim() || task.description,
            payload: nextPayload,
          }),
        });
        if (!patch.ok) throw new Error("Could not save edits before approval.");
      }
      const response = await authFetch(`/api/Assistants/tasks/${task.id}/approve`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          body?.error || (manualHandoff ? "Could not complete this handoff." : "Approval failed."),
        );
      }
      if (!manualHandoff) {
        emitProductEventOnce({
          event: "first_next_action_approved",
          agentId: task.agentId || task.agent_id || undefined,
          metadata: { task_id: task.id, task_type: task.task_type || task.taskType || "unknown" },
        });
      }
      onResolved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : manualHandoff
            ? "Could not complete this handoff."
            : "Approval failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError(null);
    try {
      const response = manualHandoff
        ? await authFetch(`/api/Assistants/tasks/${task.id}/dismiss-handoff`, { method: "POST" })
        : await authFetch(`/api/Assistants/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "cancelled",
              resolution_notes: "Rejected from Approval Inbox",
            }),
          });
      if (!response.ok) {
        throw new Error(
          manualHandoff ? "Could not dismiss this handoff." : "Could not reject this action.",
        );
      }
      onResolved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : manualHandoff
            ? "Could not dismiss this handoff."
            : "Reject failed.",
      );
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
            <h3 className="text-sm font-semibold text-foreground">{taskTypeLabel(task)}</h3>
            {task.priority ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {task.priority}
              </span>
            ) : null}
            {task.status ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {task.status.replace(/_/g, " ")}
              </span>
            ) : null}
            {task.agent?.name ? (
              <span className="text-xs text-muted-foreground">{task.agent.name}</span>
            ) : null}
          </div>
          {evidence ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {evidence}
            </p>
          ) : null}
          {!manualHandoff && editing ? (
            <div className="mt-3 grid gap-3">
              <label className="wl-preserve-case grid gap-1.5 text-sm font-medium text-muted-foreground">
                Subject
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  value={editSubject}
                  onChange={(event) => setEditSubject(event.target.value)}
                  placeholder="Email or CRM subject"
                />
              </label>
              <label className="wl-preserve-case grid gap-1.5 text-sm font-medium text-muted-foreground">
                Message
                <textarea
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  rows={3}
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                  placeholder="Message that will execute on approval"
                />
              </label>
              <label className="wl-preserve-case grid gap-1.5 text-sm font-medium text-muted-foreground">
                Internal Notes
                <textarea
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  rows={2}
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  placeholder="Context for this approval card"
                />
              </label>
            </div>
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
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : manualHandoff ? (
                <UserRoundCheck className="size-3.5" aria-hidden="true" />
              ) : (
                <Check className="size-3.5" aria-hidden="true" />
              )}
              {manualHandoff ? "Complete" : "Approve"}
            </ShadButton>
            {!manualHandoff ? (
              <ShadButton
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? "Cancel Edit" : "Edit"}
              </ShadButton>
            ) : null}
            <ShadButton
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void reject()}
            >
              <X className="size-3.5" aria-hidden="true" />
              {manualHandoff ? "Dismiss" : "Reject"}
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

/** Items rendered per bucket before a "Show more" control reveals the rest. */
const APPROVAL_PAGE_SIZE = 20;

export default function ApprovalInbox({ embedded = false }: ApprovalInboxProps) {
  const [bucket, setBucket] = useState<ApprovalBucket>("pending");
  const [triage, setTriage] = useState<TriageBucket | null>(null);
  const [tasks, setTasks] = useState<FollowUpTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triageUnavailable, setTriageUnavailable] = useState(false);
  const [tasksUnavailable, setTasksUnavailable] = useState(false);
  const [visibleCount, setVisibleCount] = useState(APPROVAL_PAGE_SIZE);
  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    setError(null);
    setTriageUnavailable(false);
    setTasksUnavailable(false);
    try {
      const [triageRes, tasksRes] = await Promise.all([
        authFetch("/api/triage", { signal: controller.signal }).catch(() => null),
        authFetch("/api/Assistants/tasks?status=active", { signal: controller.signal }).catch(
          () => null,
        ),
      ]);
      const [triageBody, tasksBody] = await Promise.all([
        triageRes?.ok ? triageRes.json().catch(() => null) : null,
        tasksRes?.ok ? tasksRes.json().catch(() => null) : null,
      ]);
      if (controller.signal.aborted) return;
      const validTriage = triageRes?.ok ? parseTriageBucket(triageBody) : null;
      const validTasks = tasksRes?.ok ? parseApprovalTasks(tasksBody) : null;
      const triageReady = validTriage !== null;
      const tasksReady = validTasks !== null;
      if (!triageReady && !tasksReady) {
        setError("Could not load approval inbox.");
        setTriage(null);
        setTasks([]);
        return;
      }
      setTriageUnavailable(!triageReady);
      setTasksUnavailable(!tasksReady);
      setTriage(validTriage);
      setTasks(validTasks || []);
    } catch {
      if (controller.signal.aborted) return;
      setError("Could not load approval inbox.");
    } finally {
      if (loadAbortRef.current === controller && !controller.signal.aborted) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [load]);

  // Reset pagination whenever the active bucket changes so switching tabs
  // never leaves a stale "Show more" cursor from a different, longer list.
  useEffect(() => {
    setVisibleCount(APPROVAL_PAGE_SIZE);
  }, [bucket]);

  const pendingTasks = useMemo(
    () => tasks.filter((task) => rawTaskType(task) !== "compliance_review"),
    [tasks],
  );
  const complianceTasks = useMemo(
    () => tasks.filter((task) => rawTaskType(task) === "compliance_review"),
    [tasks],
  );

  const bucketItems = useMemo(() => {
    switch (bucket) {
      case "pending":
        return pendingTasks;
      case "compliance":
        return complianceTasks;
      case "hot_leads":
        return (triage?.hot_leads || []).map((lead) => ({
          id: String(lead.id),
          description: typeof lead.summary === "string" ? lead.summary : "Hot lead follow-up",
          task_type: "hot_lead_review",
          payload: lead,
        })) as FollowUpTaskRow[];
      case "escalations":
        return (triage?.escalations || []).map((row) => ({
          id: String(row.id),
          description: typeof row.summary === "string" ? row.summary : "Escalated call",
          task_type: "escalation_review",
          payload: row,
        })) as FollowUpTaskRow[];
      case "knowledge_gaps":
        return (triage?.knowledge_gaps || []).map((gap) => ({
          id: String(gap.id),
          description: typeof gap.lesson === "string" ? gap.lesson : "Knowledge gap",
          task_type: "knowledge_gap",
          payload: gap,
        })) as FollowUpTaskRow[];
      default:
        return [];
    }
  }, [bucket, complianceTasks, pendingTasks, triage]);

  const actionableTasks = bucketItems.filter(
    (item) => item.task_type !== "hot_lead_review" && item.task_type !== "escalation_review",
  );

  const approvalTabs = (Object.keys(BUCKET_LABELS) as ApprovalBucket[]).map((key) => {
    // A failed load must not dress the tabs in confident "(0)" counts beside
    // an error banner — a zero is a claim about the data, not a placeholder.
    if (error || loading) {
      return { id: key, label: BUCKET_LABELS[key], shortLabel: BUCKET_SHORT_LABELS[key] };
    }
    const count =
      key === "pending"
        ? pendingTasks.length
        : key === "compliance"
          ? complianceTasks.length
          : (triage?.counts?.[key] ?? triage?.[key]?.length ?? 0);
    return {
      id: key,
      label: `${BUCKET_LABELS[key]} (${count})`,
      shortLabel: `${BUCKET_SHORT_LABELS[key]} (${count})`,
    };
  });

  return (
    <div className={embedded ? "flex min-h-0 flex-1 flex-col gap-4" : "grid gap-4"}>
      <WorkspaceTabStrip
        tabs={approvalTabs}
        activeId={bucket}
        onSelect={(id) => setBucket(id as ApprovalBucket)}
        ariaLabel="Approval buckets"
        density="compact"
        align="start"
        className="mb-0 border-b-0 pb-0"
      />

      {!error && (triageUnavailable || tasksUnavailable) ? (
        <StatusNotice tone="warning" title="Approval Data Partial">
          {triageUnavailable && tasksUnavailable
            ? "Triage and active operator work are temporarily unavailable."
            : triageUnavailable
              ? "Triage queues are temporarily unavailable. Active operator work is still current."
              : "Active operator work is temporarily unavailable. Triage queues are still current."}
        </StatusNotice>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading approvals…
        </div>
      ) : error ? (
        <StatusNotice
          tone="destructive"
          title="Approvals Unavailable"
          action={
            <ShadButton type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Try again
            </ShadButton>
          }
        >
          Nothing was changed. Try again to load approvals.
        </StatusNotice>
      ) : (bucket === "pending" || bucket === "compliance") && tasksUnavailable ? (
        <StatusNotice
          tone="destructive"
          title="Active Operator Work Unavailable"
          action={
            <ShadButton type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Try again
            </ShadButton>
          }
        >
          Could not load active operator work.
        </StatusNotice>
      ) : bucket !== "pending" && bucket !== "compliance" && triageUnavailable ? (
        <StatusNotice
          tone="destructive"
          title="Triage Queues Unavailable"
          action={
            <ShadButton type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Try again
            </ShadButton>
          }
        >
          Could not load this triage queue.
        </StatusNotice>
      ) : bucket === "pending" || bucket === "compliance" ? (
        actionableTasks.length === 0 ? (
          <ApprovalEmptyCard
            title={bucket === "compliance" ? "Compliance Queue Clear" : "Approval Queue Clear"}
            description={
              bucket === "compliance"
                ? "Compliance-sensitive follow-ups will appear here before anything executes."
                : "Follow-ups and human handoffs that need you will appear here with their evidence."
            }
          />
        ) : (
          <div className="grid gap-3">
            {actionableTasks.slice(0, visibleCount).map((task) => (
              <ApprovalTaskCard key={task.id} task={task} onResolved={() => void load()} />
            ))}
            {actionableTasks.length > visibleCount ? (
              <ShadButton
                type="button"
                variant="outline"
                size="sm"
                className="mx-auto"
                onClick={() =>
                  setVisibleCount((count) =>
                    Math.min(count + APPROVAL_PAGE_SIZE, actionableTasks.length),
                  )
                }
              >
                Show more ({actionableTasks.length - visibleCount} remaining)
              </ShadButton>
            ) : null}
          </div>
        )
      ) : bucketItems.length === 0 ? (
        <ApprovalEmptyCard
          title={`${BUCKET_SHORT_LABELS[bucket]} Clear`}
          description="Evidence-backed items will appear here automatically."
        />
      ) : (
        <div className="grid gap-3">
          {bucketItems.slice(0, visibleCount).map((item) => {
            const caller =
              typeof item.payload?.customer_number === "string"
                ? formatPhone(item.payload.customer_number)
                : "";
            return (
              <article key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold">{taskTypeLabel(item)}</h3>
                  {caller ? <p className="text-xs text-muted-foreground">{caller}</p> : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{evidenceSnippet(item)}</p>
              </article>
            );
          })}
          {bucketItems.length > visibleCount ? (
            <ShadButton
              type="button"
              variant="outline"
              size="sm"
              className="mx-auto"
              onClick={() =>
                setVisibleCount((count) => Math.min(count + APPROVAL_PAGE_SIZE, bucketItems.length))
              }
            >
              Show more ({bucketItems.length - visibleCount} remaining)
            </ShadButton>
          ) : null}
        </div>
      )}
    </div>
  );
}
