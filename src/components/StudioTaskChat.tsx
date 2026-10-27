import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Square,
} from "lucide-react";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import TaskResultText from "./computer/TaskResultText";
import LinkifiedText from "./ui/LinkifiedText";
import { useComputerWorkspace, ACTIVE_COMPUTER_TASKS } from "../contexts/ComputerWorkspaceContext";
import { useStudioSessionState } from "../contexts/StudioSessionContext";
import { useAgents } from "../contexts/AgentsContext";

export default function StudioTaskChat({
  agentId,
  agentName,
  onShowBrowser,
}: {
  agentId: string;
  agentName: string;
  onShowBrowser: () => void;
}) {
  const model = useComputerWorkspace();
  const { drafts } = useStudioSessionState();
  const { agents } = useAgents();
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
      textarea.style.minHeight = "4.75rem";
      textarea.style.height = "0px";
      textarea.style.height = `${draft ? Math.min(Math.max(textarea.scrollHeight, 76), 240) : 76}px`;
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
    <section className="wl-studio-task-chat" aria-label={`${agentName} work conversation`}>
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
          {selected ? (
            <>
              <article
                className="wl-studio-message is-owner ml-auto max-w-[84%]"
                aria-label="Your task"
              >
                <div className="wl-studio-message__body">
                  <LinkifiedText>
                    {selected.preparingBrowser ? "Open a browser." : selected.goal}
                  </LinkifiedText>
                </div>
              </article>
              <article
                className="wl-studio-message is-bot"
                aria-label={`${agentName} task activity`}
              >
                {selected.events.some(
                  (event) => event.kind === "action" || event.kind === "note",
                ) ? (
                  <details className="wl-work-steps">
                    <summary>
                      {selected.actionCount} browser{" "}
                      {selected.actionCount === 1 ? "action" : "actions"}
                      {ACTIVE_COMPUTER_TASKS.includes(selected.status) ? " · In progress" : ""}
                    </summary>
                    <ol>
                      {selected.events
                        .filter((event) => event.kind === "action" || event.kind === "note")
                        .map((event, index) => (
                          <li key={`${event.at}-${index}`}>
                            <LinkifiedText>{event.text}</LinkifiedText>
                          </li>
                        ))}
                    </ol>
                  </details>
                ) : null}
                {selected.events
                  .filter((event) => event.kind === "reply")
                  .map((event, index) => (
                    <p key={`${event.at}-${index}`} className="wl-work-owner-reply">
                      <span>Your reply</span> {event.text}
                    </p>
                  ))}
                {selected.status === "running" ? (
                  <p className="wl-work-current-step" role="status">
                    <Loader2
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    <span>
                      {selected.stopping
                        ? "Stopping after the current step…"
                        : selected.ownerControl
                          ? "You control the browser."
                          : [...selected.events]
                              .reverse()
                              .find((event) => event.kind === "action" || event.kind === "note")
                              ?.text || "Opening the browser…"}
                    </span>
                  </p>
                ) : null}
                {selected.status === "needs_input" ? (
                  <div className="wl-work-question">
                    <TaskResultText>
                      {selected.preparingBrowser
                        ? "Browse first. Then give your Bot a task from this page."
                        : selected.question || "Your Bot needs you to continue."}
                    </TaskResultText>
                    <Button type="button" size="sm" variant="secondary" onClick={onShowBrowser}>
                      <Globe aria-hidden="true" />
                      {selected.ownerControl ? "Open browser" : "Use browser controls"}
                    </Button>
                    {!selected.ownerControl ? (
                      <p>
                        Reply below. Use browser control for passwords, codes, or private details.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {selected.summary ? (
                  <>
                    <div className="wl-work-result-heading flex-wrap">
                      {selected.status === "completed" ? (
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                      ) : null}
                      <span>
                        {selected.status === "completed"
                          ? "Completed"
                          : selected.status === "blocked"
                            ? "Needs your help"
                            : "Task outcome"}
                      </span>
                      {selected.finishedAt ? (
                        <time
                          dateTime={selected.finishedAt}
                          className="text-xs font-normal text-muted-foreground"
                        >
                          {new Date(selected.finishedAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      ) : null}
                    </div>
                    <TaskResultText>{selected.summary}</TaskResultText>
                  </>
                ) : !ACTIVE_COMPUTER_TASKS.includes(selected.status) ? (
                  <p className="text-muted-foreground">
                    {selected.status === "stopped"
                      ? "Stopped before the task finished."
                      : "This task ended before it finished. You can try a new task."}
                  </p>
                ) : null}
                {selected.sources.length ? (
                  <ul className="wl-work-sources" aria-label="Task sources">
                    {selected.sources
                      .filter((source) => {
                        try {
                          const url = new URL(source);
                          return (
                            ["https:", "http:"].includes(url.protocol) &&
                            !url.username &&
                            !url.password
                          );
                        } catch {
                          return false;
                        }
                      })
                      .map((source) => (
                        <li key={source}>
                          <a href={source} target="_blank" rel="noopener noreferrer nofollow">
                            <Globe aria-hidden="true" />
                            <span>
                              {(() => {
                                try {
                                  return new URL(source).hostname;
                                } catch {
                                  return source;
                                }
                              })()}
                            </span>
                            <ExternalLink aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </article>
            </>
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
