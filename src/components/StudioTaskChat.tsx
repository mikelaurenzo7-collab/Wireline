import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowDown, ArrowUp, Globe, Loader2, Square } from "lucide-react";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import StudioTaskMessages from "./StudioTaskMessages";
import { useComputerWorkspace } from "../contexts/ComputerWorkspaceContext";
import { useStudioSessionState } from "../contexts/StudioSessionContext";
import { useAgents } from "../contexts/AgentsContext";

export default function StudioTaskChat({
  agentId,
  agentName,
  onShowBrowser,
  composerOnly = false,
}: {
  composerOnly?: boolean;
  agentId: string;
  agentName: string;
  onShowBrowser: () => void;
}) {
  const model = useComputerWorkspace();
  const { drafts } = useStudioSessionState();
  const { agents } = useAgents();
  const markKey = agents.find((agent) => agent.id === agentId)?.mark_key;
  const [, updateDraft] = useState(0);
  const [pending, setPending] = useState<"send" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const conversationScope = useRef("");
  const [showLatest, setShowLatest] = useState(false);
  const active = model.activeTask;
  const ownActive = active?.agentId === agentId ? active : null;
  const selected =
    ownActive ??
    (model.selected?.agentId === agentId
      ? model.selected
      : (model.tasks?.find((task) => task.agentId === agentId) ?? null));
  const awaitingReply = ownActive?.status === "needs_input" && !ownActive.ownerControl;
  const handoff = Boolean(ownActive?.ownerControl && ownActive.preparingBrowser);
  const draftKey = `${agentId}:${awaitingReply ? "work-reply" : "work"}`;
  const stored = drafts.get(draftKey);
  const draft = stored && (!awaitingReply || stored.command === ownActive?.id) ? stored.text : "";
  const setDraft = (text: string) => {
    drafts.set(draftKey, {
      text,
      command: awaitingReply ? (ownActive?.id ?? null) : null,
      commandNonce: null,
    });
    updateDraft((revision) => revision + 1);
  };
  const canSend = Boolean(
    model.status?.available &&
    model.tasks !== null &&
    !model.listFailed &&
    !model.statusFailed &&
    !model.refreshRequired &&
    !model.starting &&
    !pending &&
    !ownActive?.stopping &&
    draft.trim().length >= (awaitingReply ? 1 : 4) &&
    (!active || awaitingReply || handoff),
  );
  useEffect(() => {
    const textarea = input.current;
    if (!textarea) return;
    const resize = () => {
      textarea.style.minHeight = "3.25rem";
      textarea.style.height = "0px";
      textarea.style.height = `${draft ? Math.min(Math.max(textarea.scrollHeight, 52), 160) : 52}px`;
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    let width = textarea.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = textarea.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      resize();
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [draft, draftKey]);
  useLayoutEffect(() => {
    const node = transcript.current;
    const scope = `${agentId}:${selected?.id || "new"}`;
    const changedTask = scope !== conversationScope.current;
    conversationScope.current = scope;
    if (node && (changedTask || followLatest.current)) {
      node.scrollTop = node.scrollHeight;
      followLatest.current = true;
      setShowLatest(false);
    } else if (node) {
      setShowLatest(node.scrollHeight - node.scrollTop - node.clientHeight > 160);
    }
  }, [agentId, selected?.id, selected?.updatedAt]);
  const send = async () => {
    if (!canSend || pendingRef.current) return;
    pendingRef.current = true;
    setPending("send");
    setError(null);
    followLatest.current = true;
    const submitted = draft.trim();
    const submittedKey = draftKey;
    try {
      if (awaitingReply && ownActive) await model.taskAction(ownActive.id, "reply", submitted);
      else if (handoff && ownActive) await model.handoffTask(ownActive.id, submitted);
      else await model.startTask({ agentId, goal: submitted });
      if (drafts.get(submittedKey)?.text.trim() === submitted) drafts.delete(submittedKey);
      updateDraft((revision) => revision + 1);
      onShowBrowser();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your task did not start. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(null);
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
      setError(reason instanceof Error ? reason.message : "Stop did not go through. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  };
  const activeElsewhere = active && active.agentId !== agentId;
  const activeBotName = activeElsewhere
    ? agents.find((agent) => agent.id === active.agentId)?.name || "Another Bot"
    : null;

  return (
    <section
      className={`wl-studio-task-chat${composerOnly ? " is-composer-only" : ""}`}
      aria-label={`${agentName} work conversation`}
    >
      <div
        ref={transcript}
        className="wl-studio-task-chat__log"
        role="log"
        aria-label="Work conversation"
        aria-live="polite"
        aria-relevant="additions text"
        tabIndex={0}
        onScroll={(event) => {
          const node = event.currentTarget;
          followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 160;
          setShowLatest(!followLatest.current);
        }}
      >
        <div className="wl-studio-task-chat__measure">
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
          {model.statusFailed || model.listFailed ? (
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
          {model.status && !model.status.available ? (
            <StatusNotice
              tone="info"
              title={
                model.status.reason === "plan_required"
                  ? "Choose a plan to start work"
                  : "Computer work is unavailable"
              }
              action={
                model.status.reason === "plan_required" ? (
                  <Button asChild size="sm">
                    <Link to="/settings/billing">See plans</Link>
                  </Button>
                ) : undefined
              }
            >
              Your draft stays here.
            </StatusNotice>
          ) : null}
          {activeElsewhere ? (
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
          {composerOnly ? null : selected ? (
            <StudioTaskMessages
              selected={selected}
              agentId={agentId}
              agentName={agentName}
              markKey={markKey}
              onShowBrowser={onShowBrowser}
            />
          ) : !model.tasks ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading your work…
            </p>
          ) : (
            <div className="wl-studio-chat__welcome">
              <Globe className="size-6" aria-hidden="true" />
              <h2>What can {agentName} do for you?</h2>
              <p>Give your Bot a web task. Watch it work beside you.</p>
            </div>
          )}
        </div>
      </div>
      <div className="wl-studio-task-chat__composer">
        <div className="wl-studio-task-chat__measure">
          {showLatest ? (
            <div className="mb-2 flex justify-center">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  followLatest.current = true;
                  if (transcript.current)
                    transcript.current.scrollTop = transcript.current.scrollHeight;
                  setShowLatest(false);
                }}
              >
                <ArrowDown aria-hidden="true" />
                Jump to latest
              </Button>
            </div>
          ) : null}
          {error ? (
            <StatusNotice tone="destructive" title="Task action did not complete">
              {error}
            </StatusNotice>
          ) : null}
          {ownActive?.ownerControl && !handoff ? (
            <p className="wl-work-composer-hint">
              Finish your browser step, then return control to your Bot.
            </p>
          ) : null}
          <form
            className="wl-composer-dock wl-studio-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor={`work-task-${agentId}`}>
              {awaitingReply ? `Reply to ${agentName}` : `Task for ${agentName}`}
            </label>
            <textarea
              ref={input}
              id={`work-task-${agentId}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={1}
              maxLength={awaitingReply ? 1000 : 2000}
              placeholder={
                awaitingReply
                  ? "Reply to your Bot…"
                  : handoff
                    ? "What should your Bot do from here?"
                    : "Your Task…"
              }
              className="wl-composer-dock__input"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  (window.matchMedia("(pointer: fine)").matches || event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="wl-composer-dock__toolbar">
              {ownActive ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void stop()}
                  disabled={pending !== null || ownActive.stopping}
                  aria-busy={ownActive.stopping}
                >
                  <Square aria-hidden="true" />
                  {ownActive.stopping ? "Stopping…" : "Stop"}
                </Button>
              ) : null}
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="wl-work-send ml-auto size-11 rounded-full p-0"
                disabled={!canSend}
                aria-label={
                  handoff ? "Give task to Bot" : awaitingReply ? "Reply to Bot" : "Start work"
                }
                title={handoff ? "Give task to Bot" : awaitingReply ? "Reply to Bot" : "Start work"}
                aria-busy={pending === "send" || model.starting}
              >
                {pending === "send" || model.starting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
