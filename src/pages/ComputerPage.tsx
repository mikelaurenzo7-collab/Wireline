import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  Hand,
  History,
  MousePointer2,
  Loader2,
  Maximize2,
  Minimize2,
  MonitorSmartphone,
  PanelRightOpen,
  Plus,
  RotateCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";

import { authFetch, readApiJson } from "../lib/api";
import { cn } from "../lib/utils";
import { useAgents } from "../contexts/AgentsContext";
import { useStudioSessionState } from "../contexts/StudioSessionContext";
import type { ComputerComposerDraft } from "../lib/studio-session-state";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { Badge, Button, Input, NativeSelect, Skeleton, Textarea } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import LinkifiedText from "../components/ui/LinkifiedText";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import WorkspaceShell from "../components/WorkspaceShell";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceSectionNav from "../components/layout/WorkspaceSectionNav";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/shadcn/Sheet";
import BrowserSessionTools, {
  saveBrowserFile,
  type OwnerBrowserInput,
} from "../components/computer/BrowserSessionTools";
import useActiveBrowserTab from "../components/computer/useActiveBrowserTab";
import TaskResultText from "../components/computer/TaskResultText";
import {
  ACTIVE_COMPUTER_TASKS as ACTIVE,
  useComputerWorkspace,
  type ComputerTask,
  type ComputerTaskEvent as TaskEvent,
  type ComputerTaskStatus as TaskStatus,
  type ComputerStatus,
} from "../contexts/ComputerWorkspaceContext";
import { readComputerTaskReceipt } from "../lib/computer-task-receipt";
import { shortComputerTaskLabel } from "../lib/computer-task-display";

const EVENT_KIND_LABEL: Record<TaskEvent["kind"], string> = {
  action: "Step",
  note: "Note",
  question: "Needs you",
  reply: "Your reply",
  result: "Result",
  error: "Could not finish",
};

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

const EXAMPLES = [
  {
    label: "Find a service",
    goal: "Find three plumbers near Austin with Saturday hours and list their phone numbers.",
  },
  {
    label: "Check our listing",
    goal: "Check our Google Business page and tell me if our hours match our website.",
  },
  {
    label: "Plan a day out",
    goal: "Find three free things to do in Chicago this Saturday and list opening hours and links.",
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
        websites, and finish follow up.
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
  ownerError,
  controls = null,
}: {
  task: ComputerTask;
  ownerControl?: boolean;
  onOwnerInput?: (input: OwnerBrowserInput) => void;
  ownerUrl?: string;
  onOwnerUrlChange?: (url: string) => void;
  ownerBusy?: boolean;
  ownerError?: string | null;
  /** Pause, takeover, and stop stay on the viewport. Activity stays outside it. */
  controls?: ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const browserTabsRef = useActiveBrowserTab(
    task.ownerTabs?.find((tab) => tab.active)?.id,
    task.ownerTabs?.map((tab) => `${tab.id}:${tab.label}`).join("|"),
  );
  const screenRef = useRef<HTMLElement | null>(null);
  const active = ACTIVE.includes(task.status) || task.liveView;
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
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const lastUrl = task.currentUrl || [...task.events].reverse().find((event) => event.url)?.url;
  const latestEvent = [...task.events]
    .reverse()
    .find((event) => event.kind === "action" || event.kind === "note" || event.kind === "error");
  const screenCurrent = !task.frameUrl || !lastUrl || task.frameUrl === lastUrl;
  const newTab = ownerControl && !/^https?:\/\//i.test(task.currentUrl || "");

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
      {ownerControl && task.ownerTabs?.length ? (
        <div
          ref={browserTabsRef}
          className="wl-computer-screen__tabs"
          role="group"
          aria-label="Browser tabs"
        >
          {task.ownerTabs.map((tab) => (
            <div
              key={tab.id}
              className={cn("wl-browser-tab", tab.active && "is-active")}
              data-browser-tab-active={tab.active ? "true" : undefined}
            >
              <button
                type="button"
                aria-current={tab.active ? "page" : undefined}
                disabled={ownerBusy || tab.active}
                onClick={() => onOwnerInput?.({ kind: "switch_tab", tabId: tab.id })}
                title={tab.label}
              >
                <Globe aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
              {task.browserCapabilities?.tabs ? (
                <button
                  type="button"
                  className="wl-browser-tab__close"
                  aria-label={`Close ${tab.label} tab`}
                  title={
                    (task.ownerTabs?.length ?? 0) <= 1
                      ? "Keep at least one browser tab open"
                      : "Close tab"
                  }
                  disabled={ownerBusy || (task.ownerTabs?.length ?? 0) <= 1}
                  onClick={() => onOwnerInput?.({ kind: "close_tab", tabId: tab.id })}
                >
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
          {task.browserCapabilities?.tabs ? (
            <button
              className="wl-browser-tab__new"
              type="button"
              aria-label="New browser tab"
              title="New tab"
              disabled={ownerBusy || task.ownerTabs.length >= task.browserCapabilities.maxTabs}
              onClick={() => onOwnerInput?.({ kind: "new_tab" })}
            >
              <Plus aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="wl-computer-screen__bar">
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
        {active ? (
          <>
            <button
              type="button"
              className="wl-computer-screen__zoom wl-browser-icon-button wl-browser-screenshot"
              aria-label="Download browser screenshot"
              title="Download screenshot"
              disabled={!src || !screenCurrent}
              onClick={() => {
                if (src && screenCurrent) saveBrowserFile(src, `botbound-screen-${Date.now()}.jpg`);
              }}
            >
              <Camera className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="wl-computer-screen__zoom wl-browser-icon-button"
              aria-label="Open browser tools"
              title="History, downloads and session tools"
              onClick={async () => {
                if (document.fullscreenElement)
                  await document.exitFullscreen().catch(() => undefined);
                setToolsOpen(true);
              }}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            </button>
          </>
        ) : null}
        {ownerControl && zoomed ? (
          <span className="wl-computer-screen__pan-hint">Alt+wheel or touch drag pans</span>
        ) : null}
        {active && src && screenCurrent ? (
          <button
            type="button"
            className="wl-computer-screen__zoom wl-browser-zoom-toggle"
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
            aria-label={expanded ? "Exit browser fullscreen" : "Enter browser fullscreen"}
            title={expanded ? "Exit browser fullscreen" : "Enter browser fullscreen"}
            onClick={async (event) => {
              const surface =
                event.currentTarget.closest(".wl-computer-detail") ?? screenRef.current;
              setFullscreenError(null);
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else if (surface instanceof HTMLElement && surface.requestFullscreen)
                  await surface.requestFullscreen();
                else throw new Error("Fullscreen unavailable");
              } catch {
                setFullscreenError(
                  "Fullscreen is unavailable here. You can keep using the browser in this view.",
                );
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
      {fullscreenError ? (
        <p className="wl-computer-screen__notice" role="status">
          {fullscreenError}
        </p>
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
                {task.actionCount} {task.actionCount === 1 ? "action" : "actions"}
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
        {newTab && !(src && screenCurrent) ? (
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
      {controls ? <div className="wl-computer-screen__controls">{controls}</div> : null}
      <BrowserSessionTools
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        taskId={task.id}
        ownerControl={ownerControl}
        ownerBusy={ownerBusy}
        ownerError={ownerError}
        capabilities={task.browserCapabilities}
        history={task.ownerHistory}
        downloads={task.ownerDownloads}
        savedLogins={task.ownerSavedLogins}
        downloadNotice={task.ownerDownloadNotice}
        currentUrl={task.currentUrl}
        screenshotUrl={src && screenCurrent ? src : null}
        zoomed={zoomed}
        onToggleZoom={() => {
          setZoomed((current) => !current);
          setToolsOpen(false);
        }}
        onOwnerInput={onOwnerInput}
      />
    </figure>
  );
}

function ActivityCard({ event, index }: { event: TaskEvent; index: number }) {
  return (
    <li key={`${event.at}-${index}`} className="wl-computer-action" data-kind={event.kind}>
      <time dateTime={event.at}>{clockTime(event.at)}</time>
      <div className="wl-computer-action__body">
        <span className="wl-computer-action__kind">{EVENT_KIND_LABEL[event.kind]}</span>
        <span>
          {event.text}
          {event.url ? <em> · {hostOf(event.url)}</em> : null}
        </span>
      </div>
    </li>
  );
}

function EndedBrowserFrame({
  onOpen,
  disabled,
  opening,
}: {
  onOpen?: () => void;
  disabled: boolean;
  opening: boolean;
}) {
  return (
    <figure className="wl-computer-screen is-ended" aria-label="Ended browser">
      <div className="wl-computer-screen__bar">
        <Globe className="size-4" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Browser</span>
      </div>
      <div className="wl-computer-screen__viewport">
        <div className="wl-computer-screen__empty">
          <MonitorSmartphone className="size-5" aria-hidden="true" />
          <strong>Browser session ended</strong>
          <span>Screen cleared.</span>
          {onOpen ? (
            <Button
              type="button"
              size="sm"
              onClick={onOpen}
              disabled={disabled}
              aria-busy={opening}
            >
              {opening ? "Opening…" : "Open browser"}
            </Button>
          ) : null}
        </div>
      </div>
    </figure>
  );
}

function TaskDetail({
  task,
  onChanged,
  onStartAnother,
  onOpenTasks,
  onOpenBrowser,
  openingBrowser = false,
  canOpenBrowser = false,
  openBrowserError,
  botName,
  compact = false,
  chatControls = false,
  refreshRequired = false,
  onUnconfirmed,
}: {
  task: ComputerTask;
  onChanged: (task: ComputerTask) => void;
  onStartAnother?: () => void;
  onOpenTasks?: () => void;
  onOpenBrowser?: () => void;
  openingBrowser?: boolean;
  canOpenBrowser?: boolean;
  openBrowserError?: string | null;
  botName?: string;
  compact?: boolean;
  chatControls?: boolean;
  refreshRequired?: boolean;
  onUnconfirmed?: () => void;
}) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"stop" | "reply" | "take" | "input" | "return" | null>(null);
  // An error belongs to the state it happened in; once the task moves on it is stale.
  const [failure, setFailure] = useState<{ message: string; status: TaskStatus } | null>(null);
  const [ownerText, setOwnerText] = useState("");
  const [showOwnerText, setShowOwnerText] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const detailRef = useRef<HTMLElement | null>(null);
  const activityButtonRef = useRef<HTMLButtonElement | null>(null);
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
  useEffect(() => {
    if (!task.ownerControl || !active) {
      setOwnerText("");
      setShowOwnerText(false);
      ownerUrlEditedRef.current = false;
      setOwnerUrl(/^https?:\/\//i.test(task.currentUrl || "") ? task.currentUrl! : "");
    }
  }, [task.id, task.ownerControl, task.currentUrl, active]);
  const viewportOwnsControls = active && !task.ownerControl;
  const browserStillOpen = !active && task.liveView;
  const events = useMemo(() => [...task.events].reverse(), [task.events]);

  useEffect(() => {
    // The live screen and its exit button disappear when the task ends.
    // A pending fullscreen request may resolve after the terminal update.
    const exitEndedTask = () => {
      if (!active && document.fullscreenElement === detailRef.current) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
    exitEndedTask();
    document.addEventListener("fullscreenchange", exitEndedTask);
    return () => document.removeEventListener("fullscreenchange", exitEndedTask);
  }, [active]);

  const openActivity = async () => {
    // The activity sheet uses a document portal, outside the fullscreen surface.
    if (document.fullscreenElement === detailRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        setFailure({
          message: "Exit the expanded browser to view task activity.",
          status: task.status,
        });
        return;
      }
    }
    setActivityOpen(true);
  };

  const act = async (kind: "stop" | "reply") => {
    if (refreshRequired) return;
    setBusy(kind);
    setFailure(null);
    let rejected = false;
    try {
      const response = await authFetch(`/api/computer/tasks/${task.id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "reply" ? { message: reply } : {}),
      });
      const result = await readApiJson<{ task: ComputerTask }>(response);
      if (!result.ok) {
        rejected = result.status >= 400 && result.status < 500;
        throw new Error(result.error);
      }
      const next = readComputerTaskReceipt(result.data?.task, {
        taskId: task.id,
        agentId: task.agentId,
      });
      if (!next)
        throw new Error("The task action could not be confirmed. Refresh work before retrying.");
      onChanged(next);
      if (kind === "reply") setReply("");
    } catch (reason) {
      if (!rejected) onUnconfirmed?.();
      setFailure({
        message: reason instanceof Error ? reason.message : "That did not go through. Try again.",
        status: task.status,
      });
    } finally {
      setBusy((current) => (current === kind ? null : current));
    }
  };

  const ownerAction = async (kind: "take" | "input" | "return", input?: OwnerBrowserInput) => {
    if (ownerActionInFlight.current || refreshRequired) return;
    ownerActionInFlight.current = true;
    // Do not retain owner-entered credentials in React state through a slow
    // request, error, or a later return to this task.
    if ((kind === "input" && input?.kind === "type") || kind === "return" || kind === "take") {
      setOwnerText("");
      setShowOwnerText(false);
    }
    setBusy(kind);
    setFailure(null);
    let rejected = false;
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
      if (!result.ok) {
        rejected =
          result.status >= 400 && result.status < 500 && result.code !== "COMPUTER_INPUT_FAILED";
        if (result.code === "COMPUTER_INPUT_FAILED")
          throw new Error(
            "The browser action may have happened. Refresh work and inspect the page before repeating it.",
          );
        throw new Error(result.error);
      }
      const next = readComputerTaskReceipt(result.data?.task, {
        taskId: task.id,
        agentId: task.agentId,
      });
      if (!next)
        throw new Error("The browser action could not be confirmed. Refresh work before retrying.");
      if (
        kind === "take" ||
        (kind === "input" &&
          (input?.kind === "navigate" ||
            input?.kind === "history" ||
            input?.kind === "switch_tab" ||
            input?.kind === "new_tab" ||
            input?.kind === "close_tab"))
      ) {
        ownerUrlEditedRef.current = false;
      }
      if (
        kind === "input" &&
        (input?.kind === "navigate" ||
          input?.kind === "history" ||
          input?.kind === "switch_tab" ||
          input?.kind === "new_tab" ||
          input?.kind === "close_tab" ||
          next.currentUrl !== task.currentUrl) &&
        !ownerUrlEditedRef.current
      ) {
        const currentUrl = next.currentUrl || "";
        setOwnerUrl(/^https?:\/\//i.test(currentUrl) ? currentUrl : "");
      }
      onChanged(next);
    } catch (reason) {
      if (!rejected) onUnconfirmed?.();
      setFailure({
        message: reason instanceof Error ? reason.message : "That did not go through. Try again.",
        status: task.status,
      });
    } finally {
      ownerActionInFlight.current = false;
      setBusy((current) => (current === kind ? null : current));
    }
  };

  const finishedResult =
    !active && task.summary && (!chatControls || compact) ? (
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
          <p className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">
            <LinkifiedText>{task.summary}</LinkifiedText>
          </p>
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
    ) : null;

  const checkpoint =
    task.status === "needs_input" && task.question && !task.stopping && !task.preparingBrowser ? (
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
            {compact
              ? "Complete the browser step, then return control to your Bot."
              : "You’re in control of the browser. Sign in or complete the step, then return control to your Bot."}
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => void ownerAction("take")}
                disabled={!task.liveView || busy !== null || refreshRequired}
                aria-busy={busy === "take"}
              >
                <MousePointer2 aria-hidden="true" />
                {busy === "take" ? "Connecting…" : "Take control"}
              </Button>
              {!compact ? (
                <span className="self-center text-xs text-muted-foreground">
                  Sign in, handle a checkpoint, then hand the browser back.
                </span>
              ) : null}
            </div>
            {!chatControls ? (
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
                  disabled={!reply.trim() || busy !== null || refreshRequired}
                  aria-busy={busy === "reply"}
                >
                  <Send aria-hidden="true" />
                  Reply
                </Button>
              </form>
            ) : null}
            {!chatControls ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Replies go to your Bot. Use Take control for passwords, codes, or private details.
              </p>
            ) : null}
          </>
        )}
      </div>
    ) : null;

  return (
    <section
      ref={detailRef}
      className={cn("wl-computer-detail", compact && "is-compact")}
      aria-labelledby="computer-task-title"
    >
      <header className="wl-computer-detail__header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant}>
              {active ? <span className="wl-computer-pulse" aria-hidden="true" /> : null}
              {compact && task.preparingBrowser && task.ownerControl ? "Ready" : status.label}
            </Badge>
            <span
              className="text-xs text-muted-foreground"
              title={compact ? `Started ${timeAgo(task.startedAt)}` : undefined}
            >
              {!compact ? `Started ${timeAgo(task.startedAt)} · ` : null}
              {task.actionCount} {task.actionCount === 1 ? "action" : "actions"}
            </span>
            {botName && !compact ? (
              <span className="text-xs text-muted-foreground">{botName}</span>
            ) : null}
          </div>
          {compact ? (
            <>
              <p id="computer-task-title" className="sr-only">
                {task.goal}
              </p>
              <p
                className="wl-computer-detail__label"
                title={task.preparingBrowser ? undefined : task.goal}
              >
                {task.preparingBrowser ? "Browser" : shortComputerTaskLabel(task.goal)}
              </p>
            </>
          ) : (active || !task.summary) && (task.preparingBrowser || task.goal.length <= 160) ? (
            <p id="computer-task-title" className="wl-computer-detail__goal">
              {task.preparingBrowser ? "Your browser is ready" : task.goal}
            </p>
          ) : (
            <details className="group mt-1">
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground wl-focus-ring-halo">
                Task brief
                <ChevronDown
                  className="size-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p id="computer-task-title" className="wl-computer-detail__goal pb-2">
                {task.goal}
              </p>
            </details>
          )}
        </div>
        <div className="wl-computer-detail__actions">
          {onOpenTasks ? (
            <>
              {!active && onStartAnother && !compact ? (
                <Button type="button" variant="outline" size="sm" onClick={onStartAnother}>
                  {chatControls ? "Open browser" : "New task"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={compact ? "size-11 shrink-0 p-0" : undefined}
                onClick={onOpenTasks}
                aria-label="Tasks"
                title="Recent tasks"
              >
                <History aria-hidden="true" />
                <span className={compact ? "sr-only" : undefined}>Tasks</span>
              </Button>
            </>
          ) : null}
          <Button
            ref={activityButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            className={compact ? "size-11 shrink-0 p-0" : "shrink-0 whitespace-nowrap"}
            onClick={() => void openActivity()}
            aria-label="Open task activity"
            title="Task activity"
          >
            <PanelRightOpen aria-hidden="true" />
            <span className={compact ? "sr-only" : undefined}>Activity</span>
          </Button>
        </div>
      </header>

      {task.controlRequested && !task.stopping ? (
        <p className="text-sm text-muted-foreground" role="status">
          Your Bot is finishing its current step, then the browser is yours.
        </p>
      ) : null}

      {!compact ? checkpoint : null}

      {error ? (
        <StatusNotice tone="destructive" title="Something Went Wrong">
          {error}
        </StatusNotice>
      ) : null}
      {openBrowserError ? (
        <StatusNotice tone="destructive" title="The browser did not open">
          {openBrowserError}
        </StatusNotice>
      ) : null}

      {task.ownerControl ? (
        <div className="wl-computer-takeover">
          <div
            className="wl-computer-owner-actions"
            role="group"
            aria-label="Browser control handoff"
          >
            <span>
              {task.preparingBrowser && chatControls && !compact
                ? "Give your Bot its task in Work chat."
                : "You’re in control"}
            </span>
            {!(task.preparingBrowser && chatControls) ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void ownerAction("return")}
                disabled={
                  busy !== null ||
                  refreshRequired ||
                  (task.preparingBrowser && handoffGoal.trim().length < 4)
                }
                aria-busy={busy === "return"}
              >
                {busy === "return"
                  ? "Handing browser to Bot…"
                  : task.preparingBrowser
                    ? "Give task to Bot"
                    : "Return control to Bot"}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void act("stop")}
              aria-busy={busy === "stop" || task.stopping}
              disabled={busy === "stop" || task.stopping || refreshRequired}
            >
              {task.stopping ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Square aria-hidden="true" />
              )}
              {task.stopping ? "Stopping…" : "Stop"}
            </Button>
          </div>
          <LiveScreen
            task={task}
            ownerControl
            onOwnerInput={(input) => void ownerAction("input", input)}
            ownerUrl={ownerUrl}
            onOwnerUrlChange={(url) => {
              ownerUrlEditedRef.current = true;
              setOwnerUrl(url);
            }}
            ownerBusy={busy !== null || refreshRequired}
            ownerError={error}
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
                disabled={busy !== null || refreshRequired}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={showOwnerText ? "Hide entered text" : "Show entered text"}
                aria-pressed={showOwnerText}
                disabled={refreshRequired}
                onClick={() => setShowOwnerText((current) => !current)}
              >
                {showOwnerText ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
              <Button
                type="submit"
                disabled={!ownerText || busy !== null || refreshRequired}
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
                    aria-disabled={busy !== null || refreshRequired}
                    onClick={() => void ownerAction("input", { kind: "key", key })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </details>
            {task.preparingBrowser && !chatControls ? (
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
            <details className="wl-computer-control__privacy">
              <summary>Privacy and browser input</summary>
              <p>
                Your clicks and text go to the hosted browser and open site. When you return
                control, form fields and entered text are masked in the screen your Bot sees.
              </p>
            </details>
          </div>
        </div>
      ) : active || browserStillOpen ? (
        <LiveScreen
          task={task}
          controls={
            viewportOwnsControls ? (
              <>
                {task.status === "running" && !task.stopping ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => void ownerAction("take")}
                    disabled={
                      !task.liveView || busy !== null || task.controlRequested || refreshRequired
                    }
                    aria-busy={busy === "take" || task.controlRequested}
                  >
                    {busy === "take" || task.controlRequested ? (
                      <Loader2
                        className="animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <MousePointer2 aria-hidden="true" />
                    )}
                    {busy === "take" || task.controlRequested ? "Pausing…" : "Take control"}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void act("stop")}
                  aria-busy={busy === "stop" || task.stopping}
                  disabled={busy === "stop" || task.stopping || refreshRequired}
                >
                  {task.stopping ? (
                    <Loader2
                      className="animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <Square aria-hidden="true" />
                  )}
                  {task.stopping ? "Stopping…" : "Stop"}
                </Button>
              </>
            ) : null
          }
        />
      ) : compact ? (
        <EndedBrowserFrame
          onOpen={onOpenBrowser}
          disabled={!canOpenBrowser || openingBrowser}
          opening={openingBrowser}
        />
      ) : !task.summary || chatControls ? (
        <p className="wl-computer-screen-cleared">
          <MonitorSmartphone className="size-4 shrink-0" aria-hidden="true" />
          The browser screen was cleared after this task ended.
        </p>
      ) : null}

      {compact ? checkpoint : null}

      {!active &&
      (task.status === "failed" || task.status === "blocked" || task.status === "interrupted") ? (
        <div className="wl-computer-recovery" role="status">
          <p>
            {task.errorCode === "COMPUTER_BROWSER_EXPIRED"
              ? "The browser session ended. Start a new task to continue."
              : "This task stopped before it finished."}
          </p>
          <div className="flex flex-wrap gap-2">
            {onStartAnother ? (
              <Button type="button" size="sm" variant="outline" onClick={onStartAnother}>
                New task
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {compact ? (
        <details className="wl-computer-completed-details">
          <summary>
            Task details
            <ChevronDown className="size-4" aria-hidden="true" />
          </summary>
          <p className="wl-computer-detail__goal">{task.goal}</p>
          {finishedResult}
        </details>
      ) : (
        finishedResult
      )}

      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent
          side="right"
          className="wl-computer-activity-panel"
          onCloseAutoFocus={(event) => {
            const trigger = activityButtonRef.current;
            if (!trigger?.isConnected) return;
            event.preventDefault();
            trigger.focus({ preventScroll: true });
          }}
        >
          <SheetHeader>
            <SheetTitle>Task Activity</SheetTitle>
          </SheetHeader>
          <div className="wl-computer-activity">
            {events.length ? (
              <>
                {events.some((event) => event.kind !== "note") ? (
                  <ol>
                    {events
                      .filter((event) => event.kind !== "note")
                      .map((event, index) => (
                        <ActivityCard key={`${event.at}-${index}`} event={event} index={index} />
                      ))}
                  </ol>
                ) : null}
                {events.some((event) => event.kind === "note") ? (
                  <details
                    className="wl-computer-plan"
                    open={!events.some((event) => event.kind !== "note")}
                  >
                    <summary>
                      Notes
                      <span>{events.filter((event) => event.kind === "note").length}</span>
                    </summary>
                    <ol>
                      {events
                        .filter((event) => event.kind === "note")
                        .map((event, index) => (
                          <ActivityCard key={`${event.at}-${index}`} event={event} index={index} />
                        ))}
                    </ol>
                  </details>
                ) : null}
              </>
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

type ComputerWorkbenchProps = {
  /** Pins the composer to one Bot, as the Workspace panel does for its active Bot. */
  agentId?: string;
  /** "panel" renders beside the Workspace conversation without page chrome. */
  layout?: "page" | "panel";
  /** Work chat owns the task composer, replies and completion proof beside this browser. */
  chatControls?: boolean;
};

const EMPTY_COMPUTER_DRAFT: ComputerComposerDraft = {
  goal: "",
  startUrl: "",
  showComposer: false,
};

/**
 * The Bot's computer: start a task or open a browser, watch it live, take
 * control, answer its questions, and review history. One component serves the
 * full Computer page and the Workspace side panel so both behave identically.
 */
export function ComputerWorkbench({
  agentId: pinnedAgentId,
  layout = "page",
  chatControls = false,
}: ComputerWorkbenchProps) {
  const { agents, loading: agentsLoading, degraded, refresh } = useAgents();
  const { computerDrafts } = useStudioSessionState();
  const [searchParams, setSearchParams] = useSearchParams();
  const pinned = pinnedAgentId !== undefined;
  const hasScopedAgent = pinned || searchParams.has("agent");
  const requestedAgentId = (pinned ? pinnedAgentId : searchParams.get("agent"))?.trim() || "";
  const [agentId, setAgentId] = useState<string>(requestedAgentId);
  const composerAgentId = hasScopedAgent ? requestedAgentId : agentId;
  // The authenticated session outlives panel tabs, responsive layouts and routes.
  // Read by Bot on every render so a different Bot or account never inherits input.
  const { goal, startUrl, showComposer } =
    computerDrafts.get(composerAgentId) ?? EMPTY_COMPUTER_DRAFT;
  const [, refreshDraft] = useState(0);
  const updateComposerDraft = useCallback(
    (
      update:
        | Partial<ComputerComposerDraft>
        | ((current: ComputerComposerDraft) => Partial<ComputerComposerDraft>),
    ) => {
      if (!composerAgentId) return;
      const current = computerDrafts.get(composerAgentId) ?? EMPTY_COMPUTER_DRAFT;
      computerDrafts.set(composerAgentId, {
        ...current,
        ...(typeof update === "function" ? update(current) : update),
      });
      refreshDraft((revision) => revision + 1);
    },
    [computerDrafts, composerAgentId],
  );
  const setShowComposer = useCallback(
    (value: boolean | ((current: boolean) => boolean)) =>
      updateComposerDraft((current) => ({
        showComposer: typeof value === "function" ? value(current.showComposer) : value,
      })),
    [updateComposerDraft],
  );
  const {
    status,
    statusFailed,
    tasks,
    listFailed,
    setListFailed,
    setSelectedId,
    selected: accountSelected,
    activeTask,
    anyActive,
    announcement,
    loadStatus,
    loadTasks,
    applyTask,
    startTask,
    refreshRequired,
    refreshWork,
    markUnconfirmed,
  } = useComputerWorkspace();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPreviewId, setHistoryPreviewId] = useState<string | null>(null);
  const [startingMode, setStartingMode] = useState<"browser" | "task" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasScopedAgent) return;
    if (!agents.length) return;
    setAgentId((current) => {
      if (current && agents.some((agent) => agent.id === current)) return current;
      return agents[0].id;
    });
  }, [agents, hasScopedAgent]);

  // An explicit Bot link is authoritative. Never fall back to another Bot if
  // the linked one is gone, or keep an earlier Bot when the URL changes.
  const composerBot = degraded ? undefined : agents.find((agent) => agent.id === composerAgentId);
  const scopedAgentUnavailable =
    hasScopedAgent && !agentsLoading && !degraded && agents.length > 0 && !composerBot;
  // A shared model remembers account-wide history. An explicitly scoped Bot
  // may show its own history or the account's one live browser, never another
  // Bot's historical task beneath this Bot's conversation and composer.
  const visibleTasks = hasScopedAgent
    ? tasks?.filter(
        (task) => task.agentId === composerAgentId || (composerBot && task.id === activeTask?.id),
      )
    : tasks;
  const selectedHistory = hasScopedAgent
    ? (visibleTasks?.find((task) => task.id === accountSelected?.id) ??
      visibleTasks?.find((task) => task.agentId === composerAgentId) ??
      visibleTasks?.find((task) => task.id === activeTask?.id) ??
      null)
    : accountSelected;
  // The right panel is the account's live browser. Reviewing an older result
  // must not swap out that canvas or retarget its owner/Stop controls.
  const selected =
    layout === "panel" && activeTask && (!hasScopedAgent || composerBot)
      ? (visibleTasks?.find((task) => task.id === activeTask.id) ?? selectedHistory)
      : selectedHistory;
  const historyPreview =
    historyOpen && historyPreviewId
      ? visibleTasks?.find((task) => task.id === historyPreviewId && !ACTIVE.includes(task.status))
      : null;
  const foreignActive =
    selected && selected.id === activeTask?.id && selected.agentId !== composerAgentId;
  const foreignActiveBotName = foreignActive
    ? agents.find((agent) => agent.id === selected.agentId)?.name || "Another Bot"
    : null;
  const start = async (prepareBrowser = false) => {
    if (!composerBot) return;
    setStartingMode(prepareBrowser ? "browser" : "task");
    setError(null);
    try {
      await startTask(
        prepareBrowser
          ? {
              agentId: composerBot.id,
              prepareBrowser: true,
              startUrl: startUrl.trim() || undefined,
            }
          : { agentId: composerBot.id, goal, startUrl: startUrl.trim() || undefined },
      );
      if (!prepareBrowser) {
        // A late start confirmation must not erase a newer draft.
        updateComposerDraft((current) => ({
          goal: current.goal === goal ? "" : current.goal,
          startUrl: current.startUrl === startUrl ? "" : current.startUrl,
        }));
      }
      setShowComposer(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The task could not start.");
    } finally {
      setStartingMode(null);
    }
  };

  const canStart = Boolean(
    status?.available &&
    !statusFailed &&
    !refreshRequired &&
    composerBot &&
    tasks !== null &&
    goal.trim().length >= 4 &&
    !anyActive,
  );
  const canOpenBrowser = Boolean(
    status?.available &&
    !statusFailed &&
    !refreshRequired &&
    composerBot &&
    tasks !== null &&
    !anyActive &&
    !startingMode,
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
      onStartAnother={() => setShowComposer(true)}
      onOpenTasks={layout === "panel" ? () => setHistoryOpen(true) : undefined}
      onOpenBrowser={() => void start(true)}
      canOpenBrowser={canOpenBrowser}
      openingBrowser={startingMode === "browser"}
      openBrowserError={error}
      botName={selectedBot?.name}
      compact={layout === "panel"}
      chatControls={chatControls}
      refreshRequired={refreshRequired}
      onUnconfirmed={markUnconfirmed}
    />
  ) : null;

  const actions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!anyActive && selected ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowComposer((current) => !current)}
        >
          {showComposer ? "Back to task" : chatControls ? "Open browser" : "New task"}
        </Button>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
        <History aria-hidden="true" />
        Tasks
      </Button>
    </div>
  );

  const workbench = (
    <>
      {refreshRequired && !chatControls ? (
        <StatusNotice
          tone="warning"
          title="Confirm the last action"
          action={
            <Button type="button" size="sm" variant="secondary" onClick={() => void refreshWork()}>
              Refresh work
            </Button>
          }
        >
          The server outcome is uncertain. Refresh before starting or repeating work.
        </StatusNotice>
      ) : null}
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
          {activeTask && selected?.id !== activeTask.id && (!hasScopedAgent || composerBot) ? (
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
                {hasScopedAgent && activeTask.agentId !== composerAgentId
                  ? `View ${agents.find((agent) => agent.id === activeTask.agentId)?.name || "another Bot"}'s active task`
                  : activeTask.status === "needs_input"
                    ? "Respond to active task"
                    : "View active task"}
              </Button>
            </div>
          ) : null}
          {hasScopedAgent && foreignActive && foreignActiveBotName ? (
            <StatusNotice
              tone="info"
              title={`${foreignActiveBotName}'s active browser`}
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link
                    to={`${layout === "panel" ? "/studio" : "/computer"}?agent=${encodeURIComponent(selected.agentId)}${layout === "panel" ? "&panel=computer" : ""}`}
                  >
                    Switch to {foreignActiveBotName}
                  </Link>
                </Button>
              }
            >
              This task belongs to {foreignActiveBotName}. One browser task runs at a time.
            </StatusNotice>
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
              {/* In the Workspace panel the Bot is the one being set up beside it. */}
              {agents.length > 1 && !pinned ? (
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
                    onChange={(event) => updateComposerDraft({ startUrl: event.target.value })}
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
                  <strong>A fresh browser</strong>
                  <span>Open a site, or give your Bot a task.</span>
                </div>
              </div>
              {!chatControls ? (
                <div className="wl-computer-field">
                  <label htmlFor="computer-goal">What should your Bot do?</label>
                  <Textarea
                    id="computer-goal"
                    value={goal}
                    onChange={(event) => updateComposerDraft({ goal: event.target.value })}
                    placeholder="Research, compare, or complete a job on the web…"
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
                          onClick={() => updateComposerDraft({ goal: example.goal })}
                        >
                          {example.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              {tasks === null && listFailed ? (
                <StatusNotice
                  tone="warning"
                  title="Tasks Could Not Load"
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label="Retry tasks"
                      onClick={() => {
                        setListFailed(false);
                        void loadTasks();
                      }}
                    >
                      Retry
                    </Button>
                  }
                >
                  Retry to check whether a task is already running.
                </StatusNotice>
              ) : null}
              {!chatControls ? (
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
              ) : null}
              {error ? (
                <StatusNotice tone="destructive" title="The Task Did Not Start">
                  {error}
                </StatusNotice>
              ) : null}
            </form>
          ) : null}
        </div>

        <Sheet
          open={historyOpen}
          onOpenChange={(open) => {
            setHistoryOpen(open);
            if (!open) setHistoryPreviewId(null);
          }}
        >
          <SheetContent side="right" className="wl-computer-history-panel">
            <SheetHeader>
              <SheetTitle>Recent Tasks</SheetTitle>
            </SheetHeader>
            {historyPreview ? (
              <article className="wl-computer-history-preview" aria-label={historyPreview.goal}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setHistoryPreviewId(null)}
                >
                  <ArrowLeft aria-hidden="true" />
                  All tasks
                </Button>
                <h3>{shortComputerTaskLabel(historyPreview.goal)}</h3>
                <Badge variant={STATUS_COPY[historyPreview.status].variant}>
                  {STATUS_COPY[historyPreview.status].label}
                </Badge>
                <details className="wl-computer-completed-details">
                  <summary>
                    Task details
                    <ChevronDown aria-hidden="true" />
                  </summary>
                  <p className="wl-computer-detail__goal">{historyPreview.goal}</p>
                  {historyPreview.summary ? (
                    <TaskResultText>{historyPreview.summary}</TaskResultText>
                  ) : (
                    <p>No final report was produced.</p>
                  )}
                  {historyPreview.sources.length ? (
                    <ul className="wl-computer-sources" aria-label="Sources">
                      {historyPreview.sources.map((source) => (
                        <li key={source}>
                          <a href={source} target="_blank" rel="noopener noreferrer nofollow">
                            {hostOf(source)}
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </details>
                <p className="text-xs text-muted-foreground">Read-only task history.</p>
              </article>
            ) : null}
            <aside className="wl-computer-history" aria-label="Recent tasks">
              {historyPreview ? null : (
                <>
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
                  ) : visibleTasks?.length ? (
                    <ul>
                      {visibleTasks.map((task) => {
                        const copy = STATUS_COPY[task.status];
                        return (
                          <li key={task.id}>
                            <button
                              type="button"
                              aria-label={task.goal}
                              aria-current={task.id === selected?.id ? "true" : undefined}
                              onClick={() => {
                                if (layout === "panel" && activeTask) {
                                  if (task.id === activeTask.id) {
                                    setHistoryPreviewId(null);
                                    setHistoryOpen(false);
                                  } else setHistoryPreviewId(task.id);
                                  return;
                                }
                                setSelectedId(task.id);
                                setShowComposer(false);
                                setHistoryOpen(false);
                              }}
                            >
                              <span className="wl-computer-history__goal">
                                {shortComputerTaskLabel(task.goal)}
                              </span>
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
                </>
              )}
            </aside>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );

  if (layout === "panel") {
    // At a glance from beside the conversation: is the computer free, busy, or waiting on me?
    const panelState = !status
      ? null
      : !status.available
        ? { label: "Unavailable", variant: "default" as const }
        : activeTask
          ? STATUS_COPY[activeTask.status]
          : { label: "Ready", variant: "success" as const };
    return (
      <div className="wl-computer-panel">
        {!selected || (!anyActive && showComposer) ? (
          <div className="wl-computer-panel__toolbar">
            <span aria-live="polite">
              {panelState ? <Badge variant={panelState.variant}>{panelState.label}</Badge> : null}
            </span>
            {actions}
          </div>
        ) : null}
        {workbench}
      </div>
    );
  }

  return (
    <>
      <WorkspacePageIntro title="Computer" titleHidden action={actions} />
      {workbench}
    </>
  );
}

/** The width where Set Up shows its panel beside the conversation. */
const SIDE_BY_SIDE_QUERY = "(min-width: 1180px)";

export default function ComputerPage() {
  const sideBySide = useMediaQuery(SIDE_BY_SIDE_QUERY);
  const [searchParams] = useSearchParams();
  // Wide screens open the browser beside Work chat. Smaller screens also keep
  // this standalone destination for existing direct links and task history.
  if (sideBySide) {
    const next = new URLSearchParams({ panel: "computer" });
    const agent = searchParams.get("agent")?.trim();
    if (agent) next.set("agent", agent);
    return <Navigate to={`/studio?${next.toString()}`} replace />;
  }
  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard" className="max-w-[1400px]">
        <WorkspaceSectionNav />
        <ComputerWorkbench />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
