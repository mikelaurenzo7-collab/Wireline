import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  Hand,
  MousePointer2,
  Loader2,
  Maximize2,
  Minimize2,
  MonitorSmartphone,
  PanelRightOpen,
  RotateCw,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/shadcn/Sheet";

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
  frameCapturedAt?: string | null;
  frameUrl?: string | null;
  agentPointer?: { x: number; y: number; at: string } | null;
  currentUrl: string | null;
  ownerControl: boolean;
  ownerTabs?: Array<{ id: string; label: string; active: boolean }>;
  preparingBrowser?: boolean;
  stopping: boolean;
};

type OwnerBrowserInput =
  | { kind: "click"; x: number; y: number }
  | { kind: "drag"; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | { kind: "navigate"; url: string }
  | { kind: "history"; action: "back" | "forward" | "reload" }
  | { kind: "switch_tab"; tabId: string }
  | { kind: "type"; text: string }
  | { kind: "key"; key: string };

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

const OWNER_KEY_CONTROLS = [
  { key: "Tab", label: "Tab" },
  { key: "Shift+Tab", label: "Shift + Tab" },
  { key: "Enter", label: "Enter" },
  { key: "Space", label: "Space" },
  { key: "Backspace", label: "Backspace" },
  { key: "Delete", label: "Delete" },
  { key: "Escape", label: "Esc" },
  { key: "ArrowUp", label: "Up" },
  { key: "ArrowDown", label: "Down" },
  { key: "ArrowLeft", label: "Left" },
  { key: "ArrowRight", label: "Right" },
  { key: "Home", label: "Home" },
  { key: "End", label: "End" },
  { key: "PageUp", label: "Page Up" },
  { key: "PageDown", label: "Page Down" },
] as const;

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString();
}

function frameAge(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "New tab";
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

function LiveScreen({
  task,
  ownerControl = false,
  onOwnerInput,
  ownerUrl,
  onOwnerUrlChange,
  ownerBusy = false,
}: {
  task: ComputerTask;
  ownerControl?: boolean;
  onOwnerInput?: (input: OwnerBrowserInput) => void;
  ownerUrl?: string;
  onOwnerUrlChange?: (url: string) => void;
  ownerBusy?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const screenRef = useRef<HTMLElement | null>(null);
  const active = ACTIVE.includes(task.status);
  const latest = useRef<string | null>(null);
  const misses = useRef(0);
  const pointerStart = useRef<{ id: number; x: number; y: number; pointerType: string } | null>(
    null,
  );

  useEffect(() => {
    if (!active) {
      // The screen is cleared once a task ends, here as on the server.
      if (latest.current) URL.revokeObjectURL(latest.current);
      latest.current = null;
      setSrc(null);
      return;
    }
    const controller = new AbortController();
    let timer: number | undefined;
    const load = async () => {
      if (document.hidden) {
        timer = window.setTimeout(load, 1500);
        return;
      }
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
          misses.current = 0;
        } else {
          misses.current += 1;
          if (misses.current >= 2) {
            if (latest.current) URL.revokeObjectURL(latest.current);
            latest.current = null;
            setSrc(null);
          }
        }
      } catch {
        misses.current += 1;
        if (misses.current >= 2) {
          if (latest.current) URL.revokeObjectURL(latest.current);
          latest.current = null;
          setSrc(null);
        }
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

  useEffect(() => {
    const update = () =>
      setExpanded(Boolean(document.fullscreenElement?.contains(screenRef.current)));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const lastUrl = task.currentUrl || [...task.events].reverse().find((event) => event.url)?.url;
  const latestEvent = [...task.events]
    .reverse()
    .find((event) => event.kind === "action" || event.kind === "note" || event.kind === "error");
  const screenCurrent = !task.frameUrl || !lastUrl || task.frameUrl === lastUrl;
  const newTab =
    ownerControl && task.preparingBrowser && !/^https?:\/\//i.test(task.currentUrl || "");

  const screenPoint = (
    event: ReactPointerEvent<HTMLDivElement> | ReactWheelEvent<HTMLDivElement>,
    clamp = false,
  ) => {
    const image = event.currentTarget.querySelector("img");
    if (!image) return null;
    const bounds = image.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
    return {
      x: Math.max(0, Math.min(1280, x * 1280)),
      y: Math.max(0, Math.min(800, y * 800)),
    };
  };

  return (
    <figure ref={screenRef} className="wl-computer-screen">
      <div className="wl-computer-screen__bar">
        <span className="wl-computer-screen__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {ownerControl ? (
          <>
            <div
              className="wl-computer-screen__navigation"
              role="group"
              aria-label="Browser navigation"
            >
              {(["back", "forward", "reload"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  aria-label={
                    action === "back" ? "Back" : action === "forward" ? "Forward" : "Reload"
                  }
                  title={action === "back" ? "Back" : action === "forward" ? "Forward" : "Reload"}
                  disabled={ownerBusy}
                  onClick={() => onOwnerInput?.({ kind: "history", action })}
                >
                  {action === "back" ? (
                    <ArrowLeft />
                  ) : action === "forward" ? (
                    <ArrowRight />
                  ) : (
                    <RotateCw />
                  )}
                </button>
              ))}
            </div>
            <form
              className="wl-computer-screen__address-form"
              aria-label="Go to a website"
              onSubmit={(event) => {
                event.preventDefault();
                if (ownerUrl?.trim() && !ownerBusy)
                  onOwnerInput?.({ kind: "navigate", url: ownerUrl });
              }}
            >
              <Globe className="size-3.5" aria-hidden="true" />
              <input
                id="computer-owner-url"
                aria-label="Web address"
                type="text"
                inputMode="url"
                value={ownerUrl ?? ""}
                onChange={(event) => onOwnerUrlChange?.(event.target.value)}
                placeholder="Enter a web address"
                autoComplete="url"
                maxLength={2048}
                disabled={ownerBusy}
              />
              <button
                type="submit"
                disabled={!ownerUrl?.trim() || ownerBusy}
                aria-label="Go to website"
              >
                Go
              </button>
            </form>
          </>
        ) : (
          <span className="wl-computer-screen__address">
            <Globe className="size-3.5" />
            {lastUrl ? hostOf(lastUrl) : "Cloud computer"}
          </span>
        )}
        {active ? <span className="wl-computer-screen__live">Latest screen</span> : null}
        {ownerControl && zoomed ? (
          <span className="wl-computer-screen__pan-hint">Alt+wheel or touch drag pans</span>
        ) : null}
        {active && src && screenCurrent ? (
          <button
            type="button"
            className="wl-computer-screen__zoom"
            aria-label={zoomed ? "Fit browser screen" : "View browser at actual size"}
            aria-pressed={zoomed}
            title={
              ownerControl && zoomed
                ? "Alt + wheel or touch drag pans this view; wheel scrolls the website"
                : undefined
            }
            onClick={() => setZoomed((current) => !current)}
          >
            {zoomed ? "Fit" : "Zoom"}
          </button>
        ) : null}
        {active ? (
          <button
            type="button"
            className="wl-computer-screen__zoom"
            aria-label={expanded ? "Exit expanded browser" : "Expand browser"}
            title={expanded ? "Exit expanded browser" : "Expand browser"}
            onClick={(event) => {
              if (document.fullscreenElement) {
                void document.exitFullscreen();
                return;
              }
              const surface =
                event.currentTarget.closest(".wl-computer-takeover") ?? screenRef.current;
              if (surface instanceof HTMLElement && surface.requestFullscreen) {
                void surface.requestFullscreen().catch(() => undefined);
              }
            }}
          >
            {expanded ? (
              <Minimize2 className="size-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-3.5" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      {ownerControl && task.ownerTabs && task.ownerTabs.length > 1 ? (
        <div className="wl-computer-screen__tabs" role="group" aria-label="Browser tabs">
          {task.ownerTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-current={tab.active ? "page" : undefined}
              disabled={ownerBusy || tab.active}
              onClick={() => onOwnerInput?.({ kind: "switch_tab", tabId: tab.id })}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      {active ? (
        <div className="wl-computer-screen__progress">
          {ownerControl ? (
            <>
              <MousePointer2 className="size-3.5" aria-hidden="true" />
              {ownerBusy ? "Applying your action…" : "You control the browser"}
            </>
          ) : (
            <>
              <Loader2
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span>
                {task.status === "needs_input"
                  ? "Waiting for you"
                  : latestEvent?.text || "Bot is opening the browser"}
              </span>
              <span className="wl-computer-screen__steps">
                {task.actionCount} actions
                {task.frameCapturedAt ? ` · screen ${frameAge(task.frameCapturedAt)}` : ""}
              </span>
            </>
          )}
        </div>
      ) : null}
      <div
        className={cn(
          "wl-computer-screen__viewport",
          ownerControl && src && screenCurrent && "is-owner-controlled",
          ownerBusy && "is-applying",
          zoomed && src && screenCurrent && "is-zoomed",
        )}
        role={ownerControl && src && screenCurrent ? "group" : undefined}
        aria-label={
          ownerControl && src && screenCurrent
            ? zoomed
              ? "Live browser at actual size. Tap or click to interact. Touch drag or Alt plus wheel pans this view."
              : "Live browser. Click or drag on the screen to interact."
            : undefined
        }
        onPointerDown={(event) => {
          if (!ownerControl || ownerBusy || event.button !== 0) return;
          if (!(event.target as HTMLElement).closest(".wl-computer-screen__canvas")) return;
          const point = screenPoint(event);
          if (!point) return;
          pointerStart.current = { id: event.pointerId, pointerType: event.pointerType, ...point };
          if (!(zoomed && event.pointerType === "touch")) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerEnter={(event) => {
          if (ownerControl && !ownerBusy && event.pointerType !== "touch") {
            setCursor(
              (event.target as HTMLElement).closest(".wl-computer-screen__canvas")
                ? screenPoint(event)
                : null,
            );
          }
        }}
        onPointerMove={(event) => {
          if (ownerControl && !ownerBusy && event.pointerType !== "touch") {
            const captured = pointerStart.current?.id === event.pointerId;
            const overCanvas = Boolean(
              (event.target as HTMLElement).closest(".wl-computer-screen__canvas"),
            );
            setCursor(captured || overCanvas ? screenPoint(event) : null);
          }
        }}
        onPointerLeave={() => setCursor(null)}
        onPointerUp={(event) => {
          const start = pointerStart.current;
          if (!ownerControl || ownerBusy || !start || start.id !== event.pointerId) return;
          pointerStart.current = null;
          const point = screenPoint(event, true);
          if (!point) return;
          const moved = Math.hypot(point.x - start.x, point.y - start.y) > 5;
          if (zoomed && start.pointerType === "touch" && moved) return;
          if (moved && start.pointerType === "touch") {
            onOwnerInput?.({
              kind: "scroll",
              x: start.x,
              y: start.y,
              deltaX: Math.max(-1_200, Math.min(1_200, start.x - point.x)),
              deltaY: Math.max(-1_200, Math.min(1_200, start.y - point.y)),
            });
          } else {
            onOwnerInput?.(
              moved
                ? { kind: "drag", from: { x: start.x, y: start.y }, to: point }
                : { kind: "click", ...point },
            );
          }
        }}
        onPointerCancel={() => {
          pointerStart.current = null;
        }}
        onWheel={(event) => {
          if (!ownerControl || ownerBusy) return;
          if (zoomed && event.altKey) {
            event.preventDefault();
            event.currentTarget.scrollBy({
              left: event.shiftKey ? event.deltaY : event.deltaX,
              top: event.shiftKey ? 0 : event.deltaY,
            });
            setCursor(screenPoint(event));
            return;
          }
          const point = screenPoint(event);
          if (!point) return;
          event.preventDefault();
          onOwnerInput?.({
            kind: "scroll",
            ...point,
            deltaX: Math.max(-1_200, Math.min(1_200, event.deltaX)),
            deltaY: Math.max(-1_200, Math.min(1_200, event.deltaY)),
          });
        }}
      >
        {active && src && screenCurrent ? (
          <div className="wl-computer-screen__canvas">
            <img
              src={src}
              alt={
                ownerControl
                  ? "Browser screen. Click or drag to interact with the page."
                  : "What your Bot's cloud computer shows right now"
              }
              draggable={false}
              onError={() => setSrc(null)}
            />
            {ownerControl && cursor ? (
              <MousePointer2
                className="wl-computer-screen__cursor"
                style={{ left: `${(cursor.x / 1280) * 100}%`, top: `${(cursor.y / 800) * 100}%` }}
                aria-hidden="true"
              />
            ) : null}
            {!ownerControl && task.status === "running" && task.agentPointer ? (
              <MousePointer2
                className="wl-computer-screen__cursor is-agent"
                style={{
                  left: `${(task.agentPointer.x / 1280) * 100}%`,
                  top: `${(task.agentPointer.y / 800) * 100}%`,
                }}
                aria-label="Bot pointer"
              />
            ) : null}
          </div>
        ) : (
          <div className="wl-computer-screen__empty">
            {active ? (
              <>
                <Loader2
                  className="size-5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span>
                  {!screenCurrent
                    ? "Refreshing the browser screen…"
                    : task.liveView
                      ? "The screen is temporarily unavailable. Retrying…"
                      : "Starting a secure browser…"}
                </span>
              </>
            ) : (
              <>
                <MonitorSmartphone className="size-5" aria-hidden="true" />
                <span>The screen is cleared after a task ends.</span>
              </>
            )}
          </div>
        )}
        {newTab ? (
          <div className="wl-computer-new-tab">
            <Globe className="size-7" aria-hidden="true" />
            <strong>Your browser is ready</strong>
            <span>Enter a web address above, then browse or give your Bot a task.</span>
          </div>
        ) : null}
        {ownerBusy ? (
          <div className="wl-computer-screen__applying" aria-hidden="true">
            Applying…
          </div>
        ) : null}
      </div>
    </figure>
  );
}

function TaskDetail({
  task,
  onChanged,
  botName,
}: {
  task: ComputerTask;
  onChanged: (task: ComputerTask) => void;
  botName?: string;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"stop" | "reply" | "take" | "input" | "return" | null>(null);
  // An error belongs to the state it happened in; once the task moves on it is stale.
  const [failure, setFailure] = useState<{ message: string; status: TaskStatus } | null>(null);
  const [ownerText, setOwnerText] = useState("");
  const [showOwnerText, setShowOwnerText] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [ownerUrl, setOwnerUrl] = useState(
    /^https?:\/\//i.test(task.currentUrl || "") ? task.currentUrl! : task.startUrl || "",
  );
  // A changed address is a draft until a navigation or history action succeeds.
  // Focus alone must not freeze redirects after the owner presses Enter.
  const ownerUrlEditedRef = useRef(false);
  const [handoffGoal, setHandoffGoal] = useState("");
  // A click can navigate, and a site can redirect after the click response.
  // Follow the active browser URL unless an unsent address draft exists.
  useEffect(() => {
    if (task.ownerControl && !ownerUrlEditedRef.current) {
      setOwnerUrl(/^https?:\/\//i.test(task.currentUrl || "") ? task.currentUrl! : "");
    }
  }, [task.currentUrl, task.ownerControl]);
  const ownerActionInFlight = useRef(false);
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
      setBusy((current) => (current === kind ? null : current));
    }
  };

  const ownerAction = async (kind: "take" | "input" | "return", input?: OwnerBrowserInput) => {
    if (ownerActionInFlight.current) return;
    ownerActionInFlight.current = true;
    // Do not retain owner-entered credentials in React state through a slow
    // request, error, or a later return to this task.
    if ((kind === "input" && input?.kind === "type") || kind === "return" || kind === "take") {
      setOwnerText("");
      setShowOwnerText(false);
    }
    setBusy(kind);
    setFailure(null);
    try {
      const path =
        kind === "take" ? "control" : kind === "return" ? "control/return" : "control/input";
      const response = await authFetch(`/api/computer/tasks/${task.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          kind === "input"
            ? JSON.stringify(input)
            : kind === "return" && task.preparingBrowser
              ? JSON.stringify({ goal: handoffGoal })
              : "{}",
      });
      const result = await readApiJson<{ task: ComputerTask }>(response);
      if (!result.ok) throw new Error(result.error);
      if (
        kind === "take" ||
        (kind === "input" &&
          (input?.kind === "navigate" || input?.kind === "history" || input?.kind === "switch_tab"))
      ) {
        ownerUrlEditedRef.current = false;
      }
      if (
        kind === "input" &&
        (input?.kind === "navigate" ||
          input?.kind === "history" ||
          input?.kind === "switch_tab" ||
          result.data.task.currentUrl !== task.currentUrl) &&
        !ownerUrlEditedRef.current
      ) {
        const currentUrl = result.data.task.currentUrl || "";
        setOwnerUrl(/^https?:\/\//i.test(currentUrl) ? currentUrl : "");
      }
      onChanged(result.data.task);
    } catch (reason) {
      setFailure({
        message: reason instanceof Error ? reason.message : "That did not go through. Try again.",
        status: task.status,
      });
    } finally {
      ownerActionInFlight.current = false;
      setBusy((current) => (current === kind ? null : current));
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
            {botName ? <span className="text-xs text-muted-foreground">{botName}</span> : null}
          </div>
          {/* The goal is the owner's own sentence: body type, not a display title. */}
          <p id="computer-task-title" className="wl-computer-detail__goal">
            {task.preparingBrowser ? "Your browser is ready" : task.goal}
          </p>
        </div>
        <div className="wl-computer-detail__actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setActivityOpen(true)}
            aria-label="Open task activity"
          >
            <PanelRightOpen aria-hidden="true" />
            Activity
          </Button>
          {active ? (
            // Stop lands at the Bot's next checkpoint, which can follow a long
            // thinking step: say so instead of looking like nothing happened.
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => void act("stop")}
              aria-busy={busy === "stop" || task.stopping}
              disabled={busy === "stop" || task.stopping}
            >
              {task.stopping ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Square aria-hidden="true" />
              )}
              {task.stopping ? "Stopping…" : "Stop"}
            </Button>
          ) : null}
        </div>
      </header>

      {task.status === "needs_input" &&
      task.question &&
      !task.stopping &&
      !task.preparingBrowser ? (
        <div className="wl-computer-question">
          <div className="flex items-start gap-2">
            <Hand
              className="mt-0.5 size-4 shrink-0 text-[var(--wireline-color-status-warning)]"
              aria-hidden="true"
            />
            <p className="font-medium">{task.question}</p>
          </div>
          {task.ownerControl ? (
            <p className="mt-3 text-sm font-medium" role="status">
              {task.preparingBrowser
                ? "You’re in control. Browse first, then give your Bot a task using this browser."
                : "You’re in control of the browser. Sign in or complete the step, then return control to your Bot."}
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => void ownerAction("take")}
                  disabled={!task.liveView || busy !== null}
                  aria-busy={busy === "take"}
                >
                  <MousePointer2 aria-hidden="true" />
                  {busy === "take" ? "Connecting…" : "Take control"}
                </Button>
                <span className="self-center text-xs text-muted-foreground">
                  Sign in, handle a checkpoint, then hand the browser back.
                </span>
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
                Replies go to your Bot. Use Take control for passwords, codes, or private details.
              </p>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <StatusNotice tone="destructive" title="Something Went Wrong">
          {error}
        </StatusNotice>
      ) : null}

      {task.ownerControl ? (
        <div className="wl-computer-takeover">
          <LiveScreen
            task={task}
            ownerControl
            onOwnerInput={(input) => void ownerAction("input", input)}
            ownerUrl={ownerUrl}
            onOwnerUrlChange={(url) => {
              ownerUrlEditedRef.current = true;
              setOwnerUrl(url);
            }}
            ownerBusy={busy !== null}
          />
          <div className="wl-computer-control" aria-label="Browser controls">
            <form
              className="wl-computer-control__form"
              aria-label="Type into the browser"
              onSubmit={(event) => {
                event.preventDefault();
                if (ownerText && busy === null) {
                  void ownerAction("input", { kind: "type", text: ownerText });
                }
              }}
            >
              <label htmlFor="computer-owner-input">Type into selected field</label>
              <Input
                id="computer-owner-input"
                type={showOwnerText ? "text" : "password"}
                value={ownerText}
                onChange={(event) => setOwnerText(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={1000}
                disabled={busy !== null}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={showOwnerText ? "Hide entered text" : "Show entered text"}
                aria-pressed={showOwnerText}
                onClick={() => setShowOwnerText((current) => !current)}
              >
                {showOwnerText ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
              <Button
                type="submit"
                disabled={!ownerText || busy !== null}
                aria-busy={busy === "input"}
              >
                <Send aria-hidden="true" />
                Send to page
              </Button>
            </form>
            <details className="wl-computer-control__more">
              <summary>Keyboard controls</summary>
              <p className="mt-2 text-xs">
                Move site focus with Tab or Shift + Tab, then activate with Enter or Space.
              </p>
              <div
                className="wl-computer-control__keys"
                role="group"
                aria-label="Browser navigation keys"
              >
                {OWNER_KEY_CONTROLS.map(({ key, label }) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    // Keep the focused key in the tab order while its remote
                    // action runs, so Enter can repeat it when the response lands.
                    aria-disabled={busy !== null}
                    onClick={() => void ownerAction("input", { kind: "key", key })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </details>
            {task.preparingBrowser ? (
              <div className="wl-computer-control__form">
                <label htmlFor="computer-handoff-goal">What should your Bot do from here?</label>
                <Textarea
                  id="computer-handoff-goal"
                  value={handoffGoal}
                  onChange={(event) => setHandoffGoal(event.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </div>
            ) : null}
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => void ownerAction("return")}
              disabled={busy !== null || (task.preparingBrowser && handoffGoal.trim().length < 4)}
              aria-busy={busy === "return"}
            >
              {busy === "return"
                ? "Handing browser to Bot…"
                : task.preparingBrowser
                  ? "Give task to Bot"
                  : "Return control to Bot"}
            </Button>
            <details className="wl-computer-control__privacy">
              <summary>Privacy and browser input</summary>
              <p>
                Your clicks and text go to the hosted browser and open site. When you return
                control, form fields and entered text are masked in the screen sent to OpenAI.
              </p>
            </details>
          </div>
        </div>
      ) : active ? (
        <LiveScreen task={task} />
      ) : (
        <p className="wl-computer-screen-cleared">
          <MonitorSmartphone className="size-4 shrink-0" aria-hidden="true" />
          The browser screen was cleared after this task ended.
        </p>
      )}

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

      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent side="right" className="wl-computer-activity-panel">
          <SheetHeader>
            <SheetTitle>Task activity</SheetTitle>
          </SheetHeader>
          <div className="wl-computer-activity">
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
              <p className="text-sm text-muted-foreground">
                Your Bot's steps appear here as it works.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}

export default function ComputerPage() {
  const { agents, loading: agentsLoading, degraded, refresh } = useAgents();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasScopedAgent = searchParams.has("agent");
  const requestedAgentId = searchParams.get("agent")?.trim() || "";
  const [agentId, setAgentId] = useState<string>(requestedAgentId);
  const [status, setStatus] = useState<ComputerStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [tasks, setTasks] = useState<ComputerTask[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [startingMode, setStartingMode] = useState<"browser" | "task" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const tasksRef = useRef<ComputerTask[] | null>(null);
  const listEpochRef = useRef(0);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (hasScopedAgent) return;
    if (!agents.length) return;
    setAgentId((current) => {
      if (current && agents.some((agent) => agent.id === current)) return current;
      return agents[0].id;
    });
  }, [agents, hasScopedAgent]);

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
      silent = false,
    }: { signal?: AbortSignal; focusActive?: boolean; silent?: boolean } = {}) => {
      const epoch = listEpochRef.current;
      try {
        const response = await authFetch("/api/computer/tasks", { signal });
        const result = await readApiJson<{ tasks?: unknown }>(response);
        if (signal?.aborted || epoch !== listEpochRef.current) return;
        if (!result.ok || !Array.isArray(result.data?.tasks)) {
          if (!silent || tasksRef.current === null) setListFailed(true);
          return;
        }
        const next = result.data.tasks as ComputerTask[];
        const activeTask = next.find((task) => ACTIVE.includes(task.status));
        setListFailed(false);
        setTasks(next);
        setSelectedId((current) =>
          (focusActive || activeTask?.status === "needs_input") && activeTask
            ? activeTask.id
            : current && next.some((task) => task.id === current)
              ? current
              : (next[0]?.id ?? null),
        );
      } catch {
        if (!signal?.aborted && (!silent || tasksRef.current === null)) setListFailed(true);
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
      const previous = tasksRef.current?.find((task) => task.id === next.id);
      const message = announcementFor(previous, next);
      if (message) setAnnouncement(message);
      if (previous?.status !== next.status && next.status === "needs_input") {
        setSelectedId(next.id);
        setShowComposer(false);
      }
    } else if (next.status === "running") {
      // A new owner handoff supersedes an earlier completion or checkpoint.
      setAnnouncement("");
    }
    setTasks((current) =>
      current ? current.map((task) => (task.id === next.id ? next : task)) : current,
    );
  }, []);

  const selected = tasks?.find((task) => task.id === selectedId) ?? null;
  // An explicit Bot link is authoritative. Never fall back to another Bot if
  // the linked one is gone, or keep an earlier Bot when the URL changes.
  const composerAgentId = hasScopedAgent ? requestedAgentId : agentId;
  const composerBot = degraded ? undefined : agents.find((agent) => agent.id === composerAgentId);
  const scopedAgentUnavailable =
    hasScopedAgent && !agentsLoading && !degraded && agents.length > 0 && !composerBot;
  // A new task cannot start while one is active, so the active task is always
  // the newest. Poll it whichever task the owner is reading, so a question or a
  // finish is never missed. Keyed on the id, not the object, so each poll result
  // does not tear the loop down; the next poll waits for the previous one.
  const activeTask = tasks?.find((task) => ACTIVE.includes(task.status)) ?? null;
  const activeId = activeTask?.id ?? null;
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let inFlight = false;
    const poll = async () => {
      if (document.hidden) {
        timer = window.setTimeout(poll, 2000);
        return;
      }
      inFlight = true;
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
      } finally {
        inFlight = false;
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 2000);
    };
    const refreshOnReturn = () => {
      if (document.hidden || inFlight) return;
      if (timer) window.clearTimeout(timer);
      timer = undefined;
      void poll();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);
    timer = window.setTimeout(poll, 2000);
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
    };
  }, [activeId, applyTask, loadTasks]);

  // A task can start in another tab or device while this page is idle. Refresh
  // only while visible, and on return, without replacing the owner's draft or
  // the result they chose to read.
  const hasLoadedTasks = tasks !== null;
  useEffect(() => {
    if (activeId || !hasLoadedTasks) return;
    const controller = new AbortController();
    let inFlight = false;
    const refreshVisible = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        await loadTasks({ signal: controller.signal, silent: true });
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => void refreshVisible(), 8000);
    const onReturn = () => void refreshVisible();
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [activeId, hasLoadedTasks, loadTasks]);

  const anyActive = activeId !== null;

  const start = async (prepareBrowser = false) => {
    if (!composerBot) return;
    setStartingMode(prepareBrowser ? "browser" : "task");
    setError(null);
    setAnnouncement("");
    try {
      const response = await authFetch("/api/computer/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          prepareBrowser
            ? {
                agentId: composerBot.id,
                prepareBrowser: true,
                startUrl: startUrl.trim() || undefined,
              }
            : { agentId: composerBot.id, goal, startUrl: startUrl.trim() || undefined },
        ),
      });
      const result = await readApiJson<{ task: ComputerTask }>(response);
      if (!result.ok) {
        // Started from another tab or device: bring that task into view.
        if (result.code === "COMPUTER_BUSY") {
          setShowComposer(false);
          // An older idle list read must not overwrite this fresh busy result.
          listEpochRef.current += 1;
          void loadTasks({ focusActive: true });
        }
        throw new Error(result.error);
      }
      if (!prepareBrowser) {
        setGoal("");
        setStartUrl("");
      }
      listEpochRef.current += 1;
      setTasks((current) => [result.data.task, ...(current ?? [])]);
      setSelectedId(result.data.task.id);
      setShowComposer(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The task could not start.");
    } finally {
      setStartingMode(null);
    }
  };

  const canStart = Boolean(
    status?.available && composerBot && tasks !== null && goal.trim().length >= 4 && !anyActive,
  );
  const canOpenBrowser = Boolean(
    status?.available && composerBot && tasks !== null && !anyActive && !startingMode,
  );
  const botName = (id: string) =>
    agents.length > 1 ? agents.find((agent) => agent.id === id)?.name : undefined;
  // Show a selected result first. The new-task form opens when requested, so
  // returning to Computer does not bury the answer under a full form.
  // Keyed per task: its screen, reply draft, and errors never carry over.
  const selectedBot = selected ? agents.find((agent) => agent.id === selected.agentId) : undefined;
  const taskDetail = selected ? (
    <TaskDetail
      key={selected.id}
      task={selected}
      onChanged={(next) => applyTask(next, false)}
      botName={selectedBot?.name}
    />
  ) : null;

  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard" className="max-w-[1400px]">
        <WorkspacePageIntro
          title="Computer"
          action={
            <div className="flex items-center justify-end gap-2">
              {!anyActive && selected ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowComposer((current) => !current)}
                >
                  {showComposer ? "Back to task" : "New task"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setHistoryOpen(true)}
              >
                <PanelRightOpen aria-hidden="true" />
                History
              </Button>
            </div>
          }
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
        {scopedAgentUnavailable ? (
          <StatusNotice
            tone="warning"
            title="Bot Unavailable"
            action={
              <Button asChild size="sm" variant="secondary">
                <Link to="/computer">Choose Bot</Link>
              </Button>
            }
          >
            The Bot in this link is no longer available. Choose a Bot to use its computer.
          </StatusNotice>
        ) : null}

        <div className={cn("wl-computer-layout", anyActive && "is-active")}>
          <div className="wl-computer-main">
            {activeTask && selected?.id !== activeTask.id ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant={activeTask.status === "needs_input" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedId(activeTask.id);
                    setShowComposer(false);
                  }}
                >
                  {activeTask.status === "needs_input"
                    ? "Respond to active task"
                    : "View active task"}
                </Button>
              </div>
            ) : null}
            {anyActive ? taskDetail : null}
            {!anyActive && selected && !showComposer ? taskDetail : null}
            {!anyActive && (!selected || showComposer) && !scopedAgentUnavailable ? (
              <form
                className="wl-computer-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canStart) void start(false);
                }}
              >
                {agents.length > 1 ? (
                  <div className="wl-computer-field">
                    <label htmlFor="computer-agent">Bot</label>
                    <NativeSelect
                      id="computer-agent"
                      value={composerAgentId}
                      onChange={(event) => {
                        const nextAgentId = event.target.value;
                        if (hasScopedAgent) {
                          setSearchParams(
                            (current) => {
                              const next = new URLSearchParams(current);
                              next.set("agent", nextAgentId);
                              return next;
                            },
                            { replace: true },
                          );
                        } else {
                          setAgentId(nextAgentId);
                        }
                      }}
                    >
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}
                <div className="wl-computer-launch-browser" aria-label="New browser">
                  <div className="wl-computer-launch-browser__bar">
                    <span className="wl-computer-screen__dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <Globe className="size-4 shrink-0" aria-hidden="true" />
                    <label className="sr-only" htmlFor="computer-start-url">
                      Web address
                    </label>
                    <Input
                      id="computer-start-url"
                      value={startUrl}
                      onChange={(event) => setStartUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (canOpenBrowser) void start(true);
                        }
                      }}
                      placeholder="Enter a web address"
                      inputMode="url"
                      autoComplete="off"
                      maxLength={2048}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void start(true)}
                      disabled={!canOpenBrowser}
                      aria-busy={startingMode === "browser"}
                    >
                      {startingMode === "browser" ? "Opening…" : "Open browser"}
                    </Button>
                  </div>
                  <div className="wl-computer-launch-browser__canvas">
                    <Globe className="size-8" aria-hidden="true" />
                    <span>New tab</span>
                  </div>
                </div>
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
                <div className="wl-computer-composer__footer">
                  <p>
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    Take control for passwords, payments, and submissions.
                  </p>
                  <Button
                    type="submit"
                    disabled={!canStart || startingMode !== null}
                    aria-busy={startingMode === "task"}
                  >
                    {startingMode === "task" ? "Starting task…" : "Start Task"}
                  </Button>
                </div>
                {error ? (
                  <StatusNotice tone="destructive" title="The Task Did Not Start">
                    {error}
                  </StatusNotice>
                ) : null}
              </form>
            ) : null}
          </div>

          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetContent side="right" className="wl-computer-history-panel">
              <SheetHeader>
                <SheetTitle>Recent tasks</SheetTitle>
              </SheetHeader>
              <aside className="wl-computer-history" aria-label="Recent tasks">
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
                            onClick={() => {
                              setSelectedId(task.id);
                              setShowComposer(false);
                              setHistoryOpen(false);
                            }}
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
            </SheetContent>
          </Sheet>
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
