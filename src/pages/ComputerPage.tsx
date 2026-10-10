import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Globe,
  Hand,
  Loader2,
  MonitorSmartphone,
  Send,
  ShieldCheck,
  Square,
} from "lucide-react";

import { authFetch, readApiJson } from "../lib/api";
import { cn } from "../lib/utils";
import { useAgents } from "../contexts/AgentsContext";
import { Badge, Button, Input, NativeSelect, Skeleton, Textarea } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import WorkspaceShell from "../components/WorkspaceShell";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";

type TaskStatus =
  "running" | "needs_input" | "completed" | "blocked" | "failed" | "stopped" | "interrupted";

type TaskEvent = {
  at: string;
  kind: "action" | "note" | "question" | "reply" | "result" | "error";
  text: string;
  url?: string;
  ok?: boolean;
};

type ComputerTask = {
  id: string;
  agentId: string;
  goal: string;
  startUrl: string | null;
  status: TaskStatus;
  summary: string | null;
  question: string | null;
  sources: string[];
  events: TaskEvent[];
  errorCode: string | null;
  turnCount: number;
  actionCount: number;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  liveView: boolean;
  stopping: boolean;
};

type ComputerStatus = {
  available: boolean;
  reason:
    | "ready"
    | "model_unconfigured"
    | "browser_unconfigured"
    | "storage_unavailable"
    | "plan_required";
  limits: { maxMinutes: number; maxSteps: number };
};

const STATUS_REASONS: ReadonlySet<string> = new Set([
  "ready",
  "model_unconfigured",
  "browser_unconfigured",
  "storage_unavailable",
  "plan_required",
]);

/** A status the page can render, or null so a malformed answer offers Retry instead of crashing. */
function readComputerStatus(value: unknown): ComputerStatus | null {
  if (!value || typeof value !== "object") return null;
  const status = value as Partial<ComputerStatus>;
  const limits = status.limits;
  if (
    typeof status.available !== "boolean" ||
    typeof status.reason !== "string" ||
    !STATUS_REASONS.has(status.reason) ||
    !limits ||
    typeof limits.maxMinutes !== "number" ||
    typeof limits.maxSteps !== "number"
  ) {
    return null;
  }
  return {
    available: status.available,
    reason: status.reason,
    limits: { maxMinutes: limits.maxMinutes, maxSteps: limits.maxSteps },
  };
}

const ACTIVE: TaskStatus[] = ["running", "needs_input"];

const STATUS_COPY: Record<
  TaskStatus,
  { label: string; variant: "info" | "warning" | "success" | "destructive" | "default" }
> = {
  running: { label: "Working", variant: "info" },
  needs_input: { label: "Needs You", variant: "warning" },
  completed: { label: "Done", variant: "success" },
  blocked: { label: "Needs You to Finish", variant: "warning" },
  failed: { label: "Could Not Finish", variant: "destructive" },
  stopped: { label: "Stopped", variant: "default" },
  interrupted: { label: "Interrupted", variant: "default" },
};

// Read aloud when polling sees the task change, so a screen-reader owner hears
// the question or the outcome without watching the badge.
const ANNOUNCEMENTS: Partial<Record<TaskStatus, string>> = {
  completed: "Your Bot finished the task.",
  blocked: "Your Bot needs you to finish this task.",
  failed: "Your Bot could not finish the task.",
  stopped: "The task stopped.",
  interrupted: "The task was interrupted.",
};

function announcementFor(previous: ComputerTask | undefined, next: ComputerTask): string | null {
  if (!previous || previous.status === next.status) return null;
  if (next.status === "needs_input") {
    return next.question ? `Your Bot needs you: ${next.question}` : "Your Bot needs you.";
  }
  return ANNOUNCEMENTS[next.status] ?? null;
}

const EXAMPLES = [
  {
    label: "Find local businesses",
    goal: "Find three plumbers near Austin with Saturday hours and list their phone numbers.",
  },
  {
    label: "Check our listing",
    goal: "Check our Google Business page and tell me if our hours match our website.",
  },
  {
    label: "Summarize a policy",
    goal: "Look up the return policy on our supplier's website and summarize it.",
  },
];

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString();
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function UnavailableNotice({ status }: { status: ComputerStatus }) {
  if (status.reason === "plan_required") {
    return (
      <StatusNotice
        tone="info"
        title="Give Your Bot Its Own Computer"
        action={
          <Button asChild size="sm">
            <Link to="/settings/billing">See Plans</Link>
          </Button>
        }
      >
        An active paid plan includes a secure cloud computer your Bot uses to research, read
        websites, and finish follow-up.
      </StatusNotice>
    );
  }
  return (
    <StatusNotice tone="info" title="Your Bot's Computer Is Being Set Up">
      The cloud computer turns on as soon as BotBound finishes setting it up. Nothing you need to do
      here.
    </StatusNotice>
  );
}

function LiveScreen({ task }: { task: ComputerTask }) {
  const [src, setSrc] = useState<string | null>(null);
  const active = ACTIVE.includes(task.status);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    if (!active) {
      // The screen is cleared once a task ends, here as on the server.
      if (latest.current) URL.revokeObjectURL(latest.current);
      latest.current = null;
      return;
    }
    const controller = new AbortController();
    let timer: number | undefined;
    const load = async () => {
      try {
        const response = await authFetch(`/api/computer/tasks/${task.id}/frame`, {
          signal: controller.signal,
        });
        if (response.status === 200) {
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          if (latest.current) URL.revokeObjectURL(latest.current);
          latest.current = url;
          setSrc(url);
        }
      } catch {
        /* keep the previous frame */
      }
      if (!controller.signal.aborted) timer = window.setTimeout(load, 1500);
    };
    void load();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [task.id, active]);

  useEffect(
    () => () => {
      if (latest.current) URL.revokeObjectURL(latest.current);
    },
    [],
  );

  const lastUrl = [...task.events].reverse().find((event) => event.url)?.url;

  return (
    <figure className="wl-computer-screen">
      <div className="wl-computer-screen__bar" aria-hidden="true">
        <span className="wl-computer-screen__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="wl-computer-screen__address">
          <Globe className="size-3.5" />
          {lastUrl ? hostOf(lastUrl) : "Cloud computer"}
        </span>
        {active ? <span className="wl-computer-screen__live">Live</span> : null}
      </div>
      <div className="wl-computer-screen__viewport">
        {active && src ? (
          <img src={src} alt="What your Bot's cloud computer shows right now" />
        ) : (
          <div className="wl-computer-screen__empty">
            {active ? (
              <>
                <Loader2
                  className="size-5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span>Starting a secure browser…</span>
              </>
            ) : (
              <>
                <MonitorSmartphone className="size-5" aria-hidden="true" />
                <span>The screen is cleared after a task ends.</span>
              </>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

function TaskDetail({
  task,
  onChanged,
}: {
  task: ComputerTask;
  onChanged: (task: ComputerTask) => void;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"stop" | "reply" | null>(null);
  // An error belongs to the state it happened in; once the task moves on it is stale.
  const [failure, setFailure] = useState<{ message: string; status: TaskStatus } | null>(null);
  const error = failure?.status === task.status ? failure.message : null;
  const status = STATUS_COPY[task.status];
  const active = ACTIVE.includes(task.status);
  const events = useMemo(() => [...task.events].reverse(), [task.events]);

  const act = async (kind: "stop" | "reply") => {
    setBusy(kind);
    setFailure(null);
    try {
      const response = await authFetch(`/api/computer/tasks/${task.id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "reply" ? { message: reply } : {}),
      });
      const result = await readApiJson<{ task: ComputerTask }>(response);
      if (!result.ok) throw new Error(result.error);
      if (kind === "reply") setReply("");
      onChanged(result.data.task);
    } catch (reason) {
      setFailure({
        message: reason instanceof Error ? reason.message : "That did not go through. Try again.",
        status: task.status,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="wl-computer-detail" aria-labelledby="computer-task-title">
      <header className="wl-computer-detail__header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant}>
              {active ? <span className="wl-computer-pulse" aria-hidden="true" /> : null}
              {status.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Started {timeAgo(task.startedAt)} · {task.actionCount} actions
            </span>
          </div>
          {/* The goal is the owner's own sentence: body type, not a display title. */}
          <p id="computer-task-title" className="wl-computer-detail__goal">
            {task.goal}
          </p>
        </div>
        {active ? (
          // Stop lands at the Bot's next checkpoint, which can follow a long
          // thinking step: say so instead of looking like nothing happened.
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void act("stop")}
            aria-busy={busy === "stop" || task.stopping}
            disabled={busy !== null || task.stopping}
          >
            {task.stopping ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Square aria-hidden="true" />
            )}
            {task.stopping ? "Stopping…" : "Stop"}
          </Button>
        ) : null}
      </header>

      {task.status === "needs_input" && task.question && !task.stopping ? (
        <div className="wl-computer-question">
          <div className="flex items-start gap-2">
            <Hand
              className="mt-0.5 size-4 shrink-0 text-[var(--wireline-color-status-warning)]"
              aria-hidden="true"
            />
            <p className="font-medium">{task.question}</p>
          </div>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (reply.trim()) void act("reply");
            }}
          >
            <label htmlFor="computer-reply" className="sr-only">
              Reply to your Bot
            </label>
            <Input
              id="computer-reply"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Tell your Bot what to do next"
              maxLength={1000}
              autoComplete="off"
              className="min-w-0 flex-1"
            />
            <Button
              type="submit"
              disabled={!reply.trim() || busy !== null}
              aria-busy={busy === "reply"}
            >
              <Send aria-hidden="true" />
              Reply
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Never share passwords, codes, or card numbers here. Handle those steps yourself.
          </p>
        </div>
      ) : null}

      {error ? (
        <StatusNotice tone="destructive" title="Something Went Wrong">
          {error}
        </StatusNotice>
      ) : null}

      <LiveScreen task={task} />

      {!active && task.summary ? (
        <div
          className={cn(
            "wl-computer-result",
            task.status === "completed" ? "is-success" : task.status === "failed" ? "is-error" : "",
          )}
        >
          <div className="flex items-start gap-2">
            {task.status === "completed" ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-[var(--wireline-color-status-success)]"
                aria-hidden="true"
              />
            ) : (
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <p className="whitespace-pre-line">{task.summary}</p>
          </div>
          {task.sources.length ? (
            <ul className="wl-computer-sources" aria-label="Sources">
              {task.sources.map((source) => (
                <li key={source}>
                  <a href={source} target="_blank" rel="noopener noreferrer nofollow">
                    {hostOf(source)}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="wl-computer-activity">
        <h2 className="wl-overline">Activity</h2>
        {events.length ? (
          <ol>
            {events.map((event, index) => (
              <li key={`${event.at}-${index}`} data-kind={event.kind}>
                <time dateTime={event.at}>{clockTime(event.at)}</time>
                <span>
                  {event.text}
                  {event.url ? <em> · {hostOf(event.url)}</em> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Your Bot's steps appear here as it works.</p>
        )}
      </div>
    </section>
  );
}

export default function ComputerPage() {
  const { agents, loading: agentsLoading, degraded, refresh } = useAgents();
  const [agentId, setAgentId] = useState<string>("");
  const [status, setStatus] = useState<ComputerStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [tasks, setTasks] = useState<ComputerTask[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const tasksRef = useRef<ComputerTask[] | null>(null);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (!agentId && agents.length) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await authFetch("/api/computer/status", { signal });
      const result = await readApiJson<unknown>(response);
      if (signal?.aborted) return;
      const next = result.ok ? readComputerStatus(result.data) : null;
      setStatusFailed(!next);
      if (next) setStatus(next);
    } catch {
      if (!signal?.aborted) setStatusFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus]);

  // One list for the whole account: only one task runs at a time across every
  // Bot, so a running task or a question must show whichever Bot is selected.
  const loadTasks = useCallback(
    async ({
      signal,
      focusActive = false,
    }: { signal?: AbortSignal; focusActive?: boolean } = {}) => {
      try {
        const response = await authFetch("/api/computer/tasks", { signal });
        const result = await readApiJson<{ tasks?: unknown }>(response);
        if (signal?.aborted) return;
        if (!result.ok || !Array.isArray(result.data?.tasks)) {
          setListFailed(true);
          return;
        }
        const next = result.data.tasks as ComputerTask[];
        const activeTask = next.find((task) => ACTIVE.includes(task.status));
        setListFailed(false);
        setTasks(next);
        setSelectedId((current) =>
          focusActive && activeTask
            ? activeTask.id
            : current && next.some((task) => task.id === current)
              ? current
              : (next[0]?.id ?? null),
        );
      } catch {
        if (!signal?.aborted) setListFailed(true);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadTasks({ signal: controller.signal });
    return () => controller.abort();
  }, [loadTasks]);

  const applyTask = useCallback((next: ComputerTask, announce: boolean) => {
    if (announce) {
      const message = announcementFor(
        tasksRef.current?.find((task) => task.id === next.id),
        next,
      );
      if (message) setAnnouncement(message);
    }
    setTasks((current) =>
      current ? current.map((task) => (task.id === next.id ? next : task)) : current,
    );
  }, []);

  const selected = tasks?.find((task) => task.id === selectedId) ?? null;
  // A new task cannot start while one is active, so the active task is always
  // the newest. Poll it whichever task the owner is reading, so a question or a
  // finish is never missed. Keyed on the id, not the object, so each poll result
  // does not tear the loop down; the next poll waits for the previous one.
  const activeId = tasks?.find((task) => ACTIVE.includes(task.status))?.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await authFetch(`/api/computer/tasks/${activeId}`, {
          signal: controller.signal,
        });
        const result = await readApiJson<{ task: ComputerTask }>(response);
        if (controller.signal.aborted) return;
        if (result.ok) {
          applyTask(result.data.task, true);
        } else if (result.status === 404) {
          // Its Bot was deleted: the task went with it.
          void loadTasks();
          return;
        }
      } catch {
        /* a dropped poll is retried below */
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 2000);
    };
    timer = window.setTimeout(poll, 2000);
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [activeId, applyTask, loadTasks]);

  const anyActive = activeId !== null;

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const response = await authFetch("/api/computer/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, goal, startUrl: startUrl.trim() || undefined }),
      });
      const result = await readApiJson<{ task: ComputerTask }>(response);
      if (!result.ok) {
        // Started from another tab or device: bring that task into view.
        if (result.code === "COMPUTER_BUSY") void loadTasks({ focusActive: true });
        throw new Error(result.error);
      }
      setGoal("");
      setStartUrl("");
      setTasks((current) => [result.data.task, ...(current ?? [])]);
      setSelectedId(result.data.task.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The task could not start.");
    } finally {
      setStarting(false);
    }
  };

  const canStart = Boolean(
    status?.available && agentId && tasks !== null && goal.trim().length >= 4 && !anyActive,
  );
  const botName = (id: string) =>
    agents.length > 1 ? agents.find((agent) => agent.id === id)?.name : undefined;
  // The selected task leads and the composer follows it, like a conversation:
  // finishing a task never moves its result out from under the owner.
  // Keyed per task: its screen, reply draft, and errors never carry over.
  const taskDetail = selected ? (
    <TaskDetail key={selected.id} task={selected} onChanged={(next) => applyTask(next, false)} />
  ) : null;

  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard" className="max-w-[1240px]">
        <WorkspacePageIntro
          title="Computer"
          description="Give your Bot a task. It works in its own secure cloud browser and asks you before anything sensitive."
        />

        {status && !status.available ? <UnavailableNotice status={status} /> : null}
        {!status && statusFailed ? (
          <StatusNotice
            tone="warning"
            title="Your Bot's Computer Did Not Load"
            action={
              <Button size="sm" variant="outline" onClick={() => void loadStatus()}>
                Retry
              </Button>
            }
          >
            Check your connection, then try again.
          </StatusNotice>
        ) : null}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>

        {/* An unreachable roster is not an empty one: never invite a duplicate Bot. */}
        {degraded ? (
          <WorkspaceRecovery onRetry={refresh} />
        ) : !agentsLoading && !agents.length ? (
          <StatusNotice
            tone="info"
            title="Create a Bot First"
            action={
              <Button asChild size="sm">
                <Link to="/studio?create=1">Create a Bot</Link>
              </Button>
            }
          >
            Your Bot's computer belongs to a Bot. Build one, then give it work here.
          </StatusNotice>
        ) : null}

        <div className="wl-computer-layout">
          <div className="wl-computer-main">
            {taskDetail}
            <form
              className="wl-computer-composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (canStart) void start();
              }}
            >
              {agents.length > 1 ? (
                <div className="wl-computer-field">
                  <label htmlFor="computer-agent">Bot</label>
                  <NativeSelect
                    id="computer-agent"
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                  >
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
              <div className="wl-computer-field">
                <label htmlFor="computer-goal">What should your Bot do?</label>
                <Textarea
                  id="computer-goal"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder="Describe the job, like comparing supplier prices or checking a listing."
                  rows={3}
                  maxLength={2000}
                />
                {goal.trim() ? null : (
                  <div className="wl-computer-examples" role="group" aria-label="Example tasks">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example.label}
                        type="button"
                        title={example.goal}
                        onClick={() => setGoal(example.goal)}
                      >
                        {example.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="wl-computer-field">
                <label htmlFor="computer-start-url">
                  Start page <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="computer-start-url"
                  value={startUrl}
                  onChange={(event) => setStartUrl(event.target.value)}
                  placeholder="example.com"
                  inputMode="url"
                  autoComplete="off"
                />
              </div>
              <div className="wl-computer-composer__footer">
                <p>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Never types passwords or card details. Asks you before logins and payments, and
                  only submits forms you ask for. Up to {status?.limits.maxMinutes ?? 15} minutes
                  per task.
                </p>
                <Button type="submit" disabled={!canStart || starting} aria-busy={starting}>
                  {anyActive ? "Bot Is Working" : "Start Task"}
                </Button>
              </div>
              {error ? (
                <StatusNotice tone="destructive" title="The Task Did Not Start">
                  {error}
                </StatusNotice>
              ) : null}
            </form>

            {tasks && !tasks.length && status?.available ? (
              <div className="wl-computer-empty">
                <MonitorSmartphone className="size-6" aria-hidden="true" />
                <p className="font-medium">Your Bot's computer is ready.</p>
                <p className="text-sm text-muted-foreground">
                  Describe a task above. You'll see its screen and every step here.
                </p>
              </div>
            ) : null}
          </div>

          <aside className="wl-computer-history" aria-label="Recent tasks">
            <h2 className="wl-overline">Recent Tasks</h2>
            {tasks === null && listFailed ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Recent tasks did not load.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setListFailed(false);
                    void loadTasks();
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : tasks === null ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading tasks">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : tasks.length ? (
              <ul>
                {tasks.map((task) => {
                  const copy = STATUS_COPY[task.status];
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        aria-current={task.id === selectedId ? "true" : undefined}
                        onClick={() => setSelectedId(task.id)}
                      >
                        <span className="wl-computer-history__goal">{task.goal}</span>
                        <span className="wl-computer-history__meta">
                          <Badge variant={copy.variant}>{copy.label}</Badge>
                          <span>
                            {botName(task.agentId) ? `${botName(task.agentId)} · ` : null}
                            {timeAgo(task.startedAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
            )}
          </aside>
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
