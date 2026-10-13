import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Shield,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

import { Link } from "react-router";

import { useToast } from "../contexts/ToastContext";
import { authFetch } from "../lib/api";
import {
  parseApprovalTasks,
  parseTriageBucket,
  type FollowUpTaskRow,
  type TriageBucket,
} from "../lib/approval-inbox-response";
import { emitProductEventOnce } from "../lib/product-event-client";
import { formatPhone } from "../lib/safe-number";
import { isManualOperatorTask } from "../lib/operator-work-status";
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
  escalations: "Escalated",
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

/** Say what actually happened, so an approved card never just vanishes. */
function approvalResultMessage(
  task: FollowUpTaskRow,
  recipient: string,
  manualTask: boolean,
): string {
  if (manualTask) return "Marked complete.";
  const type = rawTaskType(task).toLowerCase();
  if (type.includes("email")) return recipient ? `Email sent to ${recipient}.` : "Email sent.";
  if (type.includes("text") || type.includes("sms"))
    return recipient ? `Text sent to ${formatPhone(recipient)}.` : "Text sent.";
  if (type.includes("crm")) return "CRM note logged.";
  if (type.includes("calendar") || type.includes("book") || type.includes("meeting"))
    return "Booking confirmed.";
  return "Approved and done.";
}

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

function evidenceSnippet(
  task: FollowUpTaskRow,
  omitEditableFields = false,
  omitRecipient = false,
): string {
  const payload = (task.payload || task.customer_info || task.customerInfo || {}) as Record<
    string,
    unknown
  >;
  const parts: string[] = [];
  if (typeof payload.body === "string") parts.push(payload.body);
  if (typeof payload.description === "string") parts.push(payload.description);
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
  if (!omitRecipient && typeof payload.to === "string") {
    const recipient = `To: ${payload.to}`;
    if (!uniqueParts.includes(recipient)) uniqueParts.unshift(recipient);
  }
  return uniqueParts.join("\n\n");
}

const KNOWLEDGE_GAP_PREFIX = "[KNOWLEDGE GAP]";

function textField(record: Record<string, unknown> | null | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/** The customer's number, so the owner can call back from the card. */
function taskPhone(task: FollowUpTaskRow): string {
  return (
    textField(task.customer_info || task.customerInfo, "phone") ||
    textField(task.payload, "customer_number") ||
    textField(task.payload, "phone")
  );
}

/** Where the work came from, so the owner can read it before acting. */
function taskSource(task: FollowUpTaskRow): { to: string; label: string } | null {
  const type = task.source_type || task.sourceType;
  const id = task.source_id || task.sourceId;
  if (type === "email_thread" && id) {
    return { to: `/inbox?tab=email&thread=${encodeURIComponent(id)}`, label: "Open Conversation" };
  }
  if (type === "sms_thread" && id) {
    return { to: `/inbox?tab=sms&thread=${encodeURIComponent(id)}`, label: "Open Conversation" };
  }
  if (type === "phone_call") return { to: "/phone?tab=logs", label: "Open Calls" };
  return null;
}

function TaskContactLinks({
  phone,
  source,
}: {
  phone: string;
  source: { to: string; label: string } | null;
}) {
  if (!phone && !source) return null;
  const linkClass =
    "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted wl-focus-ring-halo";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {phone ? (
        <a href={`tel:${phone}`} className={linkClass}>
          <Phone className="size-3.5" aria-hidden="true" />
          Call Back <span className="text-muted-foreground">{formatPhone(phone)}</span>
        </a>
      ) : null}
      {source ? (
        <Link to={source.to} className={linkClass}>
          {source.label}
        </Link>
      ) : null}
    </div>
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
    <div className="flex items-start gap-3 rounded-xl border border-border px-5 py-6">
      <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
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
  // Keep successful local edits visible after blocked approval, until a fresh
  // server snapshot arrives. A refetched task must replace the local snapshot.
  const [savedEdit, setSavedEdit] = useState<{
    source: FollowUpTaskRow;
    value: FollowUpTaskRow;
  } | null>(null);
  const savedTask = savedEdit?.source === task ? savedEdit.value : task;
  const manualHandoff = isHumanHandoff(task);
  const manualTask = manualHandoff || isManualOperatorTask(rawTaskType(task));
  const { success: toastSuccess } = useToast();
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
  const savedPayload = editablePayloadFields(savedTask);
  const subject = typeof savedPayload.subject === "string" ? savedPayload.subject.trim() : "";
  const recipient = typeof savedPayload.to === "string" ? savedPayload.to.trim() : "";
  const hasSubject = rawTaskType(task).includes("email") || "subject" in savedPayload;
  const evidence = evidenceSnippet(savedTask, editing && !manualTask, true);

  function toggleEditing() {
    setEditSubject(subject);
    setEditBody(
      typeof savedPayload.body === "string"
        ? savedPayload.body
        : typeof savedPayload.description === "string"
          ? savedPayload.description
          : "",
    );
    setEditNotes(savedTask.description || "");
    setEditing((value) => !value);
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      if (!manualTask && editing) {
        const type = rawTaskType(task);
        if ((type === "send_email" || type === "send_text_message") && !editBody.trim()) {
          throw new Error("Add a message before approving.");
        }
        if (type === "send_email" && !editSubject.trim()) {
          throw new Error("Add a subject before approving.");
        }
        const basePayload = editablePayloadFields(savedTask);
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
        const nextDescription = editNotes.trim();
        const patch = await authFetch(`/api/Assistants/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: nextDescription,
            payload: nextPayload,
          }),
        });
        if (!patch.ok) {
          const failure = await patch.json().catch(() => ({}));
          throw new Error(failure?.error || "Could not save edits before approval.");
        }
        setSavedEdit({
          source: task,
          value: { ...savedTask, description: nextDescription, payload: nextPayload },
        });
      }
      const response = await authFetch(`/api/Assistants/tasks/${task.id}/approve`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          body?.error || (manualTask ? "Could not complete this task." : "Approval failed."),
        );
      }
      if (!manualTask) {
        emitProductEventOnce({
          event: "first_next_action_approved",
          agentId: task.agentId || task.agent_id || undefined,
          metadata: { task_id: task.id, task_type: task.task_type || task.taskType || "unknown" },
        });
      }
      toastSuccess(approvalResultMessage(savedTask, recipient, manualTask));
      onResolved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : manualTask
            ? "Could not complete this task."
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
        const failure = await response.json().catch(() => ({}));
        throw new Error(
          failure?.error ||
            (manualHandoff ? "Could not dismiss this handoff." : "Could not reject this action."),
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
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-muted-foreground">{actionIcon(task)}</span>
          <h3 className="wl-preserve-case break-words text-sm font-semibold text-foreground">
            {subject && !editing ? subject : taskTypeLabel(task)}
          </h3>
          {task.priority ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {task.priority}
            </span>
          ) : null}
          {task.status && task.status !== "pending" ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {task.status.replace(/_/g, " ")}
            </span>
          ) : null}
          {task.agent?.name ? (
            <span className="text-xs text-muted-foreground">{task.agent.name}</span>
          ) : null}
        </div>
        {recipient ? (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {subject && !editing ? `${taskTypeLabel(task)} · ` : ""}To: {recipient}
          </p>
        ) : null}
        {evidence ? (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
            {evidence}
          </p>
        ) : null}
        <TaskContactLinks phone={taskPhone(task)} source={taskSource(task)} />
        {!manualTask && editing ? (
          <div className="mt-3 grid gap-3">
            {hasSubject ? (
              <label className="wl-preserve-case grid gap-1.5 text-sm font-medium text-muted-foreground">
                Subject
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  value={editSubject}
                  disabled={busy}
                  onChange={(event) => {
                    setEditSubject(event.target.value);
                    setError(null);
                  }}
                  placeholder="Subject"
                />
              </label>
            ) : null}
            <label className="wl-preserve-case grid gap-1.5 text-sm font-medium text-muted-foreground">
              Message
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                rows={3}
                value={editBody}
                disabled={busy}
                onChange={(event) => {
                  setEditBody(event.target.value);
                  setError(null);
                }}
                placeholder="Write a message…"
              />
            </label>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer py-1 text-xs font-medium">Internal Notes</summary>
              <label className="wl-preserve-case mt-2 grid gap-1.5 text-sm font-medium text-muted-foreground">
                <span className="sr-only">Internal Notes</span>
                <textarea
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  rows={2}
                  value={editNotes}
                  disabled={busy}
                  onChange={(event) => setEditNotes(event.target.value)}
                  placeholder="Add context…"
                />
              </label>
            </details>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 shrink-0" size={12} aria-hidden="true" />
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
            {manualTask ? "Mark complete" : "Approve"}
          </ShadButton>
          {!manualTask ? (
            <ShadButton
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={toggleEditing}
            >
              {editing ? "Cancel" : "Edit"}
            </ShadButton>
          ) : null}
          <ShadButton
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void reject()}
          >
            {manualHandoff ? "Dismiss" : "Reject"}
          </ShadButton>
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
  const [tasksLoaded, setTasksLoaded] = useState(false);
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
      setTriageUnavailable(!triageReady);
      setTasksUnavailable(!tasksReady);
      if (!triageReady && !tasksReady) {
        setError("Could not load approval inbox.");
        return;
      }
      // A background refresh must not unmount another card's unsaved draft,
      // including when only one queue can be refreshed.
      if (validTriage) setTriage(validTriage);
      if (validTasks) {
        setTasks(validTasks);
        setTasksLoaded(true);
      }
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
  const bucketUnavailable =
    bucket === "pending" || bucket === "compliance" ? tasksUnavailable : triageUnavailable;
  const bucketLoaded =
    bucket === "pending" || bucket === "compliance" ? tasksLoaded : triage !== null;

  function resolveTask(id: string) {
    // The mutation has already succeeded. Remove only that item immediately,
    // so a failed refresh cannot offer the same action again.
    setTasks((current) => current.filter((task) => task.id !== id));
    void load();
  }

  const approvalTabs = (Object.keys(BUCKET_LABELS) as ApprovalBucket[]).map((key) => {
    // A failed load must not dress the tabs in confident "(0)" counts beside
    // an error banner — a zero is a claim about the data, not a placeholder.
    const sourceUnavailable =
      key === "pending" || key === "compliance" ? tasksUnavailable : triageUnavailable;
    if (error || loading || sourceUnavailable) {
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

      {!error && !loading && (triageUnavailable || tasksUnavailable) ? (
        <StatusNotice
          tone="warning"
          title={tasksUnavailable ? "Actions Unavailable" : "Triage Unavailable"}
          action={
            <ShadButton type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Retry
            </ShadButton>
          }
        >
          {bucketLoaded
            ? "Last loaded items remain available. Try again to refresh the queues."
            : "Other queues are still available."}
        </StatusNotice>
      ) : null}

      {error && !loading ? (
        <StatusNotice
          tone="destructive"
          title="Approvals Unavailable"
          action={
            <ShadButton type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Try Again
            </ShadButton>
          }
        >
          {bucketLoaded
            ? "Could not refresh approvals. Last loaded items are shown."
            : "Nothing was changed. Try again to load approvals."}
        </StatusNotice>
      ) : null}

      {loading && !bucketLoaded ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading approvals…
        </div>
      ) : !bucketLoaded && (error || bucketUnavailable) ? null : bucket === "pending" ||
        bucket === "compliance" ? (
        actionableTasks.length === 0 ? (
          !loading && !error && !bucketUnavailable ? (
            <ApprovalEmptyCard
              title={bucket === "compliance" ? "Compliance Queue Clear" : "Approval Queue Clear"}
              description={
                bucket === "compliance"
                  ? "Reviews that need you will appear here."
                  : "Nothing needs your approval."
              }
            />
          ) : null
        ) : (
          <div className="grid gap-3">
            {actionableTasks.slice(0, visibleCount).map((task) => (
              <ApprovalTaskCard key={task.id} task={task} onResolved={() => resolveTask(task.id)} />
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
                Show More ({actionableTasks.length - visibleCount} remaining)
              </ShadButton>
            ) : null}
          </div>
        )
      ) : bucketItems.length === 0 ? (
        !loading && !error && !bucketUnavailable ? (
          <ApprovalEmptyCard
            title={`${BUCKET_LABELS[bucket]} Clear`}
            description="Nothing needs your attention."
          />
        ) : null
      ) : (
        <div className="grid gap-3">
          {bucketItems.slice(0, visibleCount).map((item) => {
            const gap = item.task_type === "knowledge_gap";
            const agentId = textField(item.payload, "agent_id");
            const question = (item.description || "").replace(KNOWLEDGE_GAP_PREFIX, "").trim();
            return (
              <article key={item.id} className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold">{taskTypeLabel(item)}</h3>
                {gap ? (
                  <>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Your Bot could not answer: {question}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        to={
                          agentId ? `/knowledge?agent=${encodeURIComponent(agentId)}` : "/knowledge"
                        }
                        className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted wl-focus-ring-halo"
                      >
                        Add to Knowledge
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-muted-foreground">{evidenceSnippet(item)}</p>
                    <TaskContactLinks
                      phone={taskPhone(item)}
                      source={{ to: "/phone?tab=logs", label: "Open Calls" }}
                    />
                  </>
                )}
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
              Show More ({bucketItems.length - visibleCount} remaining)
            </ShadButton>
          ) : null}
        </div>
      )}
    </div>
  );
}
