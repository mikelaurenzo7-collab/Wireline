import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Mail, Monitor, PhoneCall } from "lucide-react";

import { useComputerWorkspace, type ComputerTask } from "../../contexts/ComputerWorkspaceContext";
import { usePresenceSignals } from "../../hooks/usePresenceSignals";
import type { LiveSignalPresence } from "../LiveFloorPresence";
import { authFetch } from "../../lib/api";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";

/**
 * Live — what this Bot is doing right now, and what it just did.
 *
 * Every row comes from a surface the product already keeps truthful:
 *  - Live calls: `wireline_signal_presence`, written by the voice paths when
 *    a call starts and settled when it ends, delivered by usePresenceSignals
 *    (SSE snapshot + polling fallback on /api/Assistants/presence).
 *  - Computer work: the shared ComputerWorkspaceContext task list — real
 *    per-Bot task rows with a timestamped step log, polled by that context.
 *  - Approvals, finished calls, and email threads: the existing per-Bot
 *    endpoints, polled below on a calm cadence and filtered to this Bot.
 *
 * Nothing here is simulated. Two honest limits, by design: presence rows are
 * written only by the voice paths, so there is no "writing an email right
 * now" state to show — email appears as thread activity instead. And live
 * call transcripts stay in the voice session's memory until the call ends,
 * so this panel never invents a mid-call transcript.
 */

type PresenceSignal = LiveSignalPresence & { startedAt?: string | null };

type FollowUpTaskRow = {
  id: string;
  agentId?: string | null;
  description?: string | null;
  status?: string | null;
  createdAt?: string | null;
};

type CallRow = {
  id: string | number;
  customer_number?: string | null;
  intent_label?: string | null;
  outcome_tag?: string | null;
  summary?: string | null;
  created_at?: string | null;
};

type EmailThreadRow = {
  id: string;
  subject?: string | null;
  customerEmail?: string | null;
  lastMessageAt?: string | null;
  snapshotActivity?: string | null;
  createdAt?: string | null;
};

type FeedKind = "call" | "computer" | "email" | "approval";

type FeedEntry = {
  id: string;
  at: number;
  kind: FeedKind;
  title: string;
  detail?: string;
};

const FEED_LIMIT = 12;
const SOURCE_POLL_MS = 20_000;

function ts(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function preview(text: string | null | undefined, max = 100): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function elapsedLabel(startedAt: string | null | undefined, now: number): string | null {
  const start = ts(startedAt);
  if (!start) return null;
  const minutes = Math.floor(Math.max(0, now - start) / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function isActiveSignal(signal: PresenceSignal): boolean {
  const status = (signal.status || "").toLowerCase();
  return Boolean(status) && !["ended", "completed"].includes(status);
}

function computerEventTitle(kind: ComputerTask["events"][number]["kind"]): string {
  switch (kind) {
    case "action":
      return "Computer step";
    case "question":
      return "Asked you";
    case "reply":
      return "Your reply";
    case "result":
      return "Result";
    case "error":
      return "Hit a problem";
    default:
      return "Note";
  }
}

function approvalTitle(status: string | null | undefined): string {
  switch ((status || "").toLowerCase()) {
    case "pending":
    case "open":
      return "Approval waiting";
    case "in_progress":
      return "Task in progress";
    case "completed":
      return "Task completed";
    case "cancelled":
      return "Task cancelled";
    default:
      return "Task";
  }
}

function FeedIcon({ kind }: { kind: FeedKind }) {
  const Icon =
    kind === "call"
      ? PhoneCall
      : kind === "computer"
        ? Monitor
        : kind === "email"
          ? Mail
          : ClipboardCheck;
  return (
    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
  );
}

/** Approvals, finished calls, and email threads for one Bot, on a calm poll. */
function useBotRecentSources(agentId: string) {
  const [tasks, setTasks] = useState<FollowUpTaskRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [threads, setThreads] = useState<EmailThreadRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [taskResult, callResult, mailResult] = await Promise.allSettled([
        authFetch("/api/Assistants/tasks"),
        authFetch(`/api/agents/${encodeURIComponent(agentId)}/calls?limit=6`),
        authFetch(`/api/emails/threads?agent_id=${encodeURIComponent(agentId)}&limit=6`),
      ]);
      if (cancelled) return;

      if (taskResult.status === "fulfilled" && taskResult.value.ok) {
        const body = (await taskResult.value.json().catch(() => null)) as {
          tasks?: FollowUpTaskRow[];
        } | null;
        if (!cancelled && Array.isArray(body?.tasks)) {
          setTasks(body.tasks.filter((task) => task.agentId === agentId));
        }
      }
      if (callResult.status === "fulfilled" && callResult.value.ok) {
        const body = (await callResult.value.json().catch(() => null)) as {
          calls?: CallRow[];
        } | null;
        if (!cancelled && Array.isArray(body?.calls)) setCalls(body.calls);
      }
      if (mailResult.status === "fulfilled" && mailResult.value.ok) {
        const body = (await mailResult.value.json().catch(() => null)) as {
          threads?: EmailThreadRow[];
        } | null;
        if (!cancelled && Array.isArray(body?.threads)) setThreads(body.threads);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), SOURCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentId]);

  return { tasks, calls, threads };
}

export default function BotLivePanel({
  agentId,
  agentName,
  compact = false,
  className = "",
}: {
  agentId: string;
  agentName: string;
  compact?: boolean;
  className?: string;
}) {
  const signals = usePresenceSignals() as PresenceSignal[];
  const { tasks: computerTasks } = useComputerWorkspace();
  const { tasks, calls, threads } = useBotRecentSources(agentId);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const botSignals = useMemo(
    () => signals.filter((signal) => signal.agentId === agentId && isActiveSignal(signal)),
    [signals, agentId],
  );
  const liveCall = botSignals[0] ?? null;
  const settlingOnly =
    botSignals.length > 0 && botSignals.every((signal) => signal.status === "settling");

  const botComputerTasks = useMemo(
    () => (computerTasks ?? []).filter((task) => task.agentId === agentId),
    [computerTasks, agentId],
  );
  const activeComputerTask =
    botComputerTasks.find((task) => task.status === "running" || task.status === "needs_input") ??
    null;

  const waitingApprovals = useMemo(
    () => tasks.filter((task) => task.status === "pending" || task.status === "open"),
    [tasks],
  );

  const headline = settlingOnly
    ? "Wrapping up a call"
    : liveCall
      ? "On a call now"
      : activeComputerTask?.status === "needs_input"
        ? "Waiting for you"
        : activeComputerTask
          ? "On the computer"
          : "Idle";
  const busy = Boolean(liveCall || activeComputerTask);

  const feed = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [];

    for (const signal of botSignals) {
      const at = ts(signal.startedAt);
      if (at) {
        entries.push({
          id: `signal:${signal.id}`,
          at,
          kind: "call",
          title: "Call started",
          detail: signal.customerNumber || signal.label || undefined,
        });
      }
    }

    for (const call of calls) {
      const at = ts(call.created_at);
      if (!at) continue;
      entries.push({
        id: `call:${call.id}`,
        at,
        kind: "call",
        title: "Call ended",
        detail:
          preview(call.intent_label || call.outcome_tag || call.summary) ||
          call.customer_number ||
          undefined,
      });
    }

    for (const task of botComputerTasks.slice(0, 4)) {
      const started = ts(task.startedAt);
      if (started) {
        entries.push({
          id: `computer:${task.id}:start`,
          at: started,
          kind: "computer",
          title: "Computer task started",
          detail: preview(task.goal, 80) || undefined,
        });
      }
      for (const event of task.events.slice(-8)) {
        const at = ts(event.at);
        if (!at) continue;
        entries.push({
          id: `computer:${task.id}:${event.at}:${event.kind}`,
          at,
          kind: "computer",
          title: computerEventTitle(event.kind),
          detail: preview(event.text, 110) || undefined,
        });
      }
      const finished = ts(task.finishedAt);
      if (finished) {
        entries.push({
          id: `computer:${task.id}:done`,
          at: finished,
          kind: "computer",
          title: `Computer task ${task.status.replaceAll("_", " ")}`,
          detail: preview(task.summary, 110) || undefined,
        });
      }
    }

    for (const task of tasks) {
      const at = ts(task.createdAt);
      if (!at) continue;
      entries.push({
        id: `task:${task.id}`,
        at,
        kind: "approval",
        title: approvalTitle(task.status),
        detail: preview(task.description, 110) || undefined,
      });
    }

    for (const thread of threads) {
      const at = ts(thread.snapshotActivity || thread.lastMessageAt || thread.createdAt);
      if (!at) continue;
      entries.push({
        id: `mail:${thread.id}`,
        at,
        kind: "email",
        title: "Email activity",
        detail: preview(thread.subject, 80) || thread.customerEmail || undefined,
      });
    }

    return entries.sort((a, b) => b.at - a.at).slice(0, FEED_LIMIT);
  }, [botSignals, calls, botComputerTasks, tasks, threads]);

  const callElapsed = liveCall ? elapsedLabel(liveCall.startedAt, now) : null;
  const latestComputerStep = activeComputerTask
    ? [...activeComputerTask.events]
        .reverse()
        .find((event) => event.kind === "action" || event.kind === "note" || event.kind === "error")
    : undefined;

  return (
    <section className={className} aria-label={`Live activity for ${agentName || "this Bot"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={WL_APP_CLASSES.wiredEyebrow}>Live</p>
        <span
          className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground"
          role="status"
        >
          <span
            className={`size-2 rounded-full ${
              busy
                ? "animate-pulse bg-[var(--wireline-color-status-success)]"
                : "bg-muted-foreground/40"
            }`}
            aria-hidden="true"
          />
          {headline}
        </span>
      </div>

      {liveCall ? (
        <p className={`${compact ? "mt-2" : "mt-3"} text-sm leading-6 text-foreground`}>
          <span className="font-semibold">{liveCall.customerNumber || "Caller"}</span>
          {liveCall.label ? (
            <span className="text-muted-foreground"> · {liveCall.label}</span>
          ) : null}
          {callElapsed ? <span className="text-muted-foreground"> · {callElapsed}</span> : null}
        </p>
      ) : null}

      {activeComputerTask ? (
        <p className={`${compact ? "mt-2" : "mt-3"} text-sm leading-6 text-foreground`}>
          <span className="font-semibold">
            {activeComputerTask.status === "needs_input" ? "Needs your reply: " : "Working on: "}
          </span>
          {preview(
            activeComputerTask.status === "needs_input" && activeComputerTask.question
              ? activeComputerTask.question
              : activeComputerTask.goal,
            90,
          )}
          {latestComputerStep ? (
            <span className="block text-muted-foreground">
              {preview(latestComputerStep.text, 110)}
            </span>
          ) : null}
        </p>
      ) : null}

      {waitingApprovals.length ? (
        <p className={`${compact ? "mt-2" : "mt-3"} text-sm leading-6 text-foreground`}>
          <span className="font-semibold">
            {waitingApprovals.length} approval{waitingApprovals.length === 1 ? "" : "s"} waiting
          </span>
          <span className="text-muted-foreground"> for your review.</span>
        </p>
      ) : null}

      {feed.length ? (
        <ul className={`${compact ? "mt-3" : "mt-4"} grid gap-3 border-t border-border/70 pt-3`}>
          {feed.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <FeedIcon kind={entry.kind} />
              <div className="min-w-0">
                <p className="text-sm leading-5 text-foreground">
                  <span className="font-medium">{entry.title}</span>
                  <span className="text-muted-foreground"> · {relativeTime(entry.at, now)}</span>
                </p>
                {entry.detail ? (
                  <p className="truncate text-xs leading-5 text-muted-foreground">{entry.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : !busy ? (
        <p className={`${compact ? "mt-2" : "mt-3"} text-sm leading-6 text-muted-foreground`}>
          Nothing yet. Calls, computer steps, emails, and approvals will appear here as{" "}
          {agentName || "your Bot"} works.
        </p>
      ) : null}
    </section>
  );
}
