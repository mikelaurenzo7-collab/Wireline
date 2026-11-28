import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import { useComputerWorkspace } from "../contexts/ComputerWorkspaceContext";
import { useStudioSessionState } from "../contexts/StudioSessionContext";
import { useAgents } from "../contexts/AgentsContext";
import { readWorkHandoff } from "../lib/work-handoff";
import { setStudioBrowserTaskParams } from "../lib/studio-route-state";
import { choosePlanHref } from "../lib/signup-intent";
import { GO_LIVE_PLAN_COPY } from "../lib/wireline-onboarding-copy";

/** Task intent shares the conversation's input; execution stays in the task controller. */
export function useStudioTaskComposer({
  agentId,
  agentName,
  enabled,
  autoReply,
  requested,
  messageDraft,
  onRequest,
  onShowBrowser,
  onFocus,
}: {
  agentId: string;
  agentName: string;
  enabled: boolean;
  autoReply: boolean;
  requested: boolean;
  messageDraft: string;
  onRequest: () => void;
  onShowBrowser: () => void;
  onFocus: () => void;
}) {
  const model = useComputerWorkspace();
  const { drafts } = useStudioSessionState();
  const { agents } = useAgents();
  const location = useLocation();
  const navigate = useNavigate();
  const [, updateDraft] = useState(0);
  const [pending, setPending] = useState<"send" | "stop" | null>(null);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [handoffDraft, setHandoffDraft] = useState<string | null>(null);
  const consumedHandoff = useRef("");
  const offeredQuestion = useRef("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const active = model.activeTask;
  const ownActive = active?.agentId === agentId ? active : null;
  const awaitingReply = ownActive?.status === "needs_input" && !ownActive.ownerControl;
  const handoff = Boolean(ownActive?.ownerControl && ownActive.preparingBrowser);
  const draftKey = `${agentId}:${awaitingReply ? "work-reply" : "work"}`;
  const stored = drafts.get(draftKey);
  const draft = stored && (!awaitingReply || stored.command === ownActive?.id) ? stored.text : "";
  const setDraft = useCallback(
    (text: string) => {
      drafts.set(draftKey, {
        text,
        command: awaitingReply ? (ownActive?.id ?? null) : null,
        commandNonce: null,
      });
      updateDraft((revision) => revision + 1);
    },
    [drafts, draftKey, awaitingReply, ownActive?.id],
  );
  const selected =
    ownActive ??
    (model.selected?.agentId === agentId
      ? model.selected
      : (model.tasks?.find((task) => task.agentId === agentId) ?? null));
  const taskMode = enabled && requested;

  useEffect(() => {
    if (!enabled || !awaitingReply || !ownActive || ownActive.stopping || pendingRef.current)
      return;
    const question = `${ownActive.id}:${ownActive.question || ""}`;
    if (taskMode) {
      offeredQuestion.current = question;
      return;
    }
    if (!autoReply) return;
    if (offeredQuestion.current === question) return;
    // An incoming question must never replace an owner message already being written.
    if (messageDraft.trim()) return;
    offeredQuestion.current = question;
    onRequest();
  }, [enabled, autoReply, taskMode, awaitingReply, ownActive, messageDraft, onRequest]);

  useEffect(() => {
    const goal = readWorkHandoff(location.hash);
    const receipt = `${agentId}:${location.hash}`;
    if (!enabled || model.tasks === null || !goal || consumedHandoff.current === receipt) return;
    consumedHandoff.current = receipt;
    const adoptDraft = !draft.trim() && !active && !messageDraft.trim();
    if (adoptDraft) {
      setDraft(goal);
    } else setHandoffDraft(goal);
    const current = new URLSearchParams(location.search);
    const search = adoptDraft ? setStudioBrowserTaskParams(current) : current;
    navigate(
      { pathname: location.pathname, search: search.toString(), hash: "" },
      { replace: true },
    );
  }, [
    enabled,
    model.tasks,
    agentId,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    draft,
    active,
    messageDraft,
    setDraft,
  ]);

  const canSend = Boolean(
    taskMode &&
    model.status?.available &&
    model.tasks !== null &&
    !model.listFailed &&
    !model.statusFailed &&
    !model.refreshRequired &&
    !model.starting &&
    !pending &&
    !ownActive?.stopping &&
    draft.trim().length >= (awaitingReply ? 1 : 4) &&
    draft.length <= (awaitingReply ? 1000 : 2000) &&
    (!active || awaitingReply || handoff),
  );

  const send = async () => {
    if (!canSend || pendingRef.current) return false;
    pendingRef.current = true;
    setPending("send");
    setError(null);
    const submitted = draft.trim();
    const submittedKey = draftKey;
    try {
      if (awaitingReply && ownActive) await model.taskAction(ownActive.id, "reply", submitted);
      else if (handoff && ownActive) await model.handoffTask(ownActive.id, submitted);
      else await model.startTask({ agentId, goal: submitted });
      if (drafts.get(submittedKey)?.text.trim() === submitted) drafts.delete(submittedKey);
      if (mounted.current) {
        updateDraft((revision) => revision + 1);
      }
      return true;
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : "Your task did not start. Try again.");
      return false;
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(null);
    }
  };

  const stop = async () => {
    if (!ownActive || pendingRef.current || ownActive.stopping) return;
    pendingRef.current = true;
    setPending("stop");
    setError(null);
    try {
      await model.taskAction(ownActive.id, "stop");
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : "Stop did not go through. Try again.");
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(null);
    }
  };

  const activeElsewhere = active && active.agentId !== agentId;
  const activeBotName = activeElsewhere
    ? agents.find((agent) => agent.id === active.agentId)?.name || "Another Bot"
    : null;
  const notice = (
    <>
      {model.refreshRequired ? (
        <StatusNotice
          tone="warning"
          title="Confirm the last action"
          action={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void model.refreshWork()}
            >
              Refresh work
            </Button>
          }
        >
          Your draft stays here. Refresh before repeating an action.
        </StatusNotice>
      ) : null}
      {taskMode && (model.statusFailed || model.listFailed) ? (
        <StatusNotice
          tone="warning"
          title="Work could not load"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void model.loadStatus();
                void model.loadTasks();
              }}
            >
              Retry
            </Button>
          }
        >
          Check your connection before starting another task.
        </StatusNotice>
      ) : null}
      {taskMode && model.status && !model.status.available ? (
        <StatusNotice
          tone="info"
          title={
            model.status.reason === "plan_required"
              ? "Choose a plan to start work"
              : "Browser work is unavailable"
          }
          action={
            model.status.reason === "plan_required" ? (
              <Button asChild size="sm">
                <Link to={choosePlanHref()}>{GO_LIVE_PLAN_COPY.cta}</Link>
              </Button>
            ) : undefined
          }
        >
          Your draft stays here.
        </StatusNotice>
      ) : null}
      {taskMode && activeElsewhere ? (
        <StatusNotice
          tone="info"
          title={`${activeBotName} is working`}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                model.setSelectedId(active.id);
                onShowBrowser();
              }}
            >
              View active task
            </Button>
          }
        >
          One task runs at a time. Your draft stays with {agentName}.
        </StatusNotice>
      ) : null}
      {taskMode && ownActive ? (
        <p className="wl-work-composer-hint" role="status">
          {ownActive.stopping
            ? "Stopping after the current step…"
            : awaitingReply
              ? "Your reply continues this task."
              : handoff
                ? "Tell your Bot what to do in the browser you opened."
                : ownActive.ownerControl
                  ? "Finish your browser step, then return control to your Bot."
                  : "Your Bot is working. You can message it while the browser task continues."}
        </p>
      ) : null}
      {error ? (
        <StatusNotice tone="destructive" title="Task action did not complete">
          {error}
        </StatusNotice>
      ) : null}
      {handoffDraft ? (
        <StatusNotice tone="info" title="Task from a connected assistant">
          <p className="break-words">{handoffDraft}</p>
          <p>Review this task before starting work. Your current draft is kept.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={Boolean(active)}
              onClick={() => {
                setDraft(handoffDraft);
                setHandoffDraft(null);
                onRequest();
                onFocus();
              }}
            >
              Use task draft
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setHandoffDraft(null)}>
              Dismiss
            </Button>
          </div>
        </StatusNotice>
      ) : null}
    </>
  );

  return {
    taskMode,
    draft,
    setDraft,
    canSend,
    send,
    stop,
    pending,
    ownActive,
    notice,
    inputLabel: awaitingReply ? `Reply to ${agentName}` : `Task for ${agentName}`,
    sendLabel: handoff ? "Give task to Bot" : awaitingReply ? "Reply to Bot" : "Start work",
    placeholder: awaitingReply
      ? "Reply to your Bot…"
      : handoff
        ? "What should your Bot do from here?"
        : "Describe your task…",
    maxLength: awaitingReply ? 1000 : 2000,
    busy: Boolean(pending || model.starting),
    speechBusy: Boolean(pending || model.starting || (active && !awaitingReply && !handoff)),
    responseKey: selected
      ? `${selected.id}:${selected.status}:${selected.question || selected.summary || ""}`
      : "",
    response:
      selected?.status === "needs_input"
        ? selected.question || "Your Bot needs you in Studio."
        : selected?.summary || "",
  };
}
