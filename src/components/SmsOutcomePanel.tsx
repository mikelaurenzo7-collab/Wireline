import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Loader2, Route, UserRoundCheck } from "lucide-react";

import { authFetch } from "../lib/api";
import type { ConversationOutcomeStatus } from "../lib/conversation-outcome";
import { smsOutcomeOperations } from "../lib/conversation-outcome-operations";
import { CONVERSATION_OUTCOME_META as OUTCOME_META } from "../lib/conversation-outcome-display";
import { Badge, Button } from "./atoms";
import { ConversationActivity, StatusNotice } from "./molecules";

type OutcomeResponse = {
  thread?: { status?: string };
  handoff?: { id: string; status: string } | null;
  error?: string;
};

function normalizeStatus(value: unknown): ConversationOutcomeStatus {
  return value === "waiting" || value === "escalated" || value === "booked" || value === "resolved"
    ? value
    : "open";
}

export default function SmsOutcomePanel({
  threadId,
  initialStatus,
  onStatusChange,
}: {
  threadId: string;
  initialStatus: string;
  onStatusChange?: (status: ConversationOutcomeStatus) => void;
}) {
  const [status, setStatus] = useState<ConversationOutcomeStatus>(() =>
    normalizeStatus(initialStatus),
  );
  const [routingConflict, setRoutingConflict] = useState(initialStatus === "routing_conflict");
  const [handoff, setHandoff] = useState<{ id: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingOutcomes, setPendingOutcomes] = useState(smsOutcomeOperations.getPending);
  const busy = pendingOutcomes.get(threadId) ?? null;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const threadIdRef = useRef<string | null>(threadId);
  const detailAbortRef = useRef<AbortController | null>(null);
  const loadedThreadRef = useRef<string | null>(null);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useLayoutEffect(() => {
    threadIdRef.current = threadId;
    detailAbortRef.current?.abort();
    return () => {
      threadIdRef.current = null;
      detailAbortRef.current?.abort();
    };
  }, [threadId]);

  useLayoutEffect(() => {
    setPendingOutcomes(smsOutcomeOperations.getPending());
    return smsOutcomeOperations.subscribe((event) => {
      setPendingOutcomes(smsOutcomeOperations.getPending());
      if (event.threadId !== threadIdRef.current) return;
      if (event.kind === "failed") {
        setError(event.message);
        return;
      }
      if (event.kind !== "saved") return;
      // A read already in flight cannot undo the confirmed write. Keep its
      // result visible even if a later refresh fails.
      detailAbortRef.current?.abort();
      const updatedStatus = normalizeStatus(event.result.thread.status);
      setStatus(updatedStatus);
      setRoutingConflict(false);
      setHandoff(event.result.handoff);
      setLoading(false);
      setError(null);
      onStatusChangeRef.current?.(updatedStatus);
      setNotice(
        event.result.handoff
          ? "A human follow-up is now in Approvals."
          : `Conversation marked ${OUTCOME_META[updatedStatus].label.toLowerCase()}.`,
      );
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const newThread = loadedThreadRef.current !== threadId;
    loadedThreadRef.current = threadId;
    setStatus(normalizeStatus(initialStatus));
    setRoutingConflict(initialStatus === "routing_conflict");
    setHandoff((current) => (newThread || initialStatus !== "escalated" ? null : current));
    setLoading(true);
    setError(null);
    setNotice(null);

    authFetch(`/api/sms/threads/${threadId}/outcome`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as OutcomeResponse | null;
        if (!response.ok) throw new Error(body?.error || "Could not load conversation outcome.");
        return body;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        if (body?.thread?.status === "routing_conflict") {
          setRoutingConflict(true);
          setHandoff(body?.handoff || null);
          return;
        }
        setRoutingConflict(false);
        const nextStatus = normalizeStatus(body?.thread?.status);
        setStatus(nextStatus);
        setHandoff(body?.handoff || null);
        onStatusChangeRef.current?.(nextStatus);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Could not load conversation outcome.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [initialStatus, threadId]);

  async function setOutcome(nextStatus: ConversationOutcomeStatus, createHandoff = false) {
    if (loading || routingConflict || smsOutcomeOperations.getPending().has(threadId)) return;
    setError(null);
    setNotice(null);
    try {
      await smsOutcomeOperations.save(threadId, nextStatus, createHandoff);
    } catch {
      // The subscriber shows the error only if this conversation is still open.
    }
  }

  if (loading) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-secondary/35 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Loading outcome
      </div>
    );
  }

  if (routingConflict) {
    return (
      <section
        className="mb-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3"
        aria-label="SMS outcome"
      >
        <div className="flex items-center gap-2">
          <Route className="size-3.5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-[.08em] text-amber-800 dark:text-amber-200">
            Sending line needs review
          </span>
        </div>
        <StatusNotice tone="warning" className="mt-3">
          Outcome controls are paused until this conversation is bound to one verified Twilio
          number. BotBound will not guess which business line owns it.
        </StatusNotice>
      </section>
    );
  }

  return (
    <section
      className="mb-3 rounded-lg border border-border bg-secondary/35 p-3"
      aria-label="SMS outcome"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Route className="size-3.5 text-primary" aria-hidden="true" />
        <span className="mr-auto text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
          Outcome
        </span>
        <Badge variant={OUTCOME_META[status].variant}>{OUTCOME_META[status].label}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() => void setOutcome("waiting")}
        >
          {busy === "waiting" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Clock3 className="size-3.5" />
          )}
          Waiting
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() => void setOutcome("booked")}
        >
          {busy === "booked" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          Booked
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() => void setOutcome("escalated", true)}
        >
          {busy === "handoff" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <UserRoundCheck className="size-3.5" />
          )}
          Handoff
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy !== null}
          onClick={() => void setOutcome("resolved")}
        >
          {busy === "resolved" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          Resolve
        </Button>
        {status !== "open" ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-1"
            disabled={busy !== null}
            onClick={() => void setOutcome("open")}
          >
            Reopen
          </Button>
        ) : null}
      </div>

      {handoff ? (
        <ConversationActivity
          className="mt-3"
          state="active"
          title="Human Follow-Up Is Active"
          detail="This conversation remains owned in Approvals until completed or dismissed."
        />
      ) : null}
      {notice ? <p className="mt-2 text-xs text-muted-foreground">{notice}</p> : null}
      {error ? (
        <StatusNotice tone="destructive" className="mt-3">
          {error}
        </StatusNotice>
      ) : null}
    </section>
  );
}
