import { ArrowLeft, Maximize2, Minimize2, Plus, Users, X } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import { Button, Skeleton } from "../components/atoms";
import { PanelSkeleton } from "../components/atoms/skeleton-presets";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusNotice } from "./molecules/StatusNotice";
import WorkspaceResizablePanel from "../components/layout/WorkspaceResizablePanel";
import { useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { useStudioSessionState } from "../contexts/StudioSessionContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { writeStudioLastAgentId } from "../lib/studio-agent-preference";
import {
  clearStudioInspectorSectionParams,
  readStudioInspectorSection,
  readStudioWorkroomMode,
  normalizeStudioRouteParams,
  setStudioInspectorSectionParams,
  setStudioWorkroomModeParams,
  setStudioBrowserTaskParams,
} from "../lib/studio-route-state";
import { customerAgentLanguage } from "../lib/product-copy";
import StudioAgentReviewPanel from "./StudioAgentReviewPanel";
import StudioAgentWorkspacePanel from "./StudioAgentWorkspacePanel";
import StudioBotDetailsPanel from "./studio/StudioBotDetailsPanel";
import StudioWorkroom, { type StudioWorkroomHandle } from "./StudioWorkroom";
import WorkspaceRecovery from "./WorkspaceRecovery";
import StudioTaskMessages from "./StudioTaskMessages";
import {
  ComputerWorkspaceProvider,
  useComputerWorkspace,
} from "../contexts/ComputerWorkspaceContext";

// The computer panel loads lazily; it is the workspace's only side panel.
const ComputerWorkbench = lazy(() =>
  import("../pages/ComputerPage").then((module) => ({ default: module.ComputerWorkbench })),
);

type InspectorSection = "details" | "setup" | "review";
type WorkroomMode = "configure" | "test";

const BOT_LANGUAGE = customerAgentLanguage();
// A wider computer workspace has its own size preference. Earlier saved widths
// belong to the narrower setup inspector and cannot fit a usable computer panel.
const STUDIO_INSPECTOR_STORAGE_KEY = "wireline:studio-panel:v3";
const SETUP_TABS: ReadonlyArray<{ id: InspectorSection; label: string }> = [
  { id: "details", label: "Details" },
  { id: "setup", label: "Set Up" },
  { id: "review", label: "Summary" },
];
// The panel can be dragged as wide as the conversation allows; Full width
// takes the rest. The conversation never narrows past a readable column.
const PANEL_DEFAULT_WIDTH = 480;
const PANEL_MIN_WIDTH = 384;
const PANEL_MAX_CAP = 1120;
const CONVERSATION_MIN_WIDTH = 420;

function readStoredPanelCollapsed(): boolean {
  try {
    const raw = window.localStorage.getItem(STUDIO_INSPECTOR_STORAGE_KEY);
    if (!raw) return true;
    return (JSON.parse(raw) as { collapsed?: unknown })?.collapsed === true;
  } catch {
    return true;
  }
}

function StudioLoadingState() {
  return (
    <main
      className="flex min-h-[55vh] flex-col bg-background px-4 py-8 sm:px-6"
      aria-busy="true"
      aria-label="Loading Workspace"
    >
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Skeleton shape="text" className="h-3 w-20" />
        <Skeleton shape="text" className="h-8 w-72 max-w-full" />
        <Skeleton
          shape="surface"
          className="h-[min(280px,45dvh)] w-full rounded-[var(--radius-xl)]"
        />
        <PanelSkeleton rows={2} className="pt-1" />
      </div>
    </main>
  );
}

function StudioEmptyState() {
  const [brief, setBrief] = useState("");

  function createHref() {
    const params = new URLSearchParams({ create: "1" });
    const trimmed = brief.trim();
    if (trimmed) params.set("brief", trimmed);
    return `/studio?${params.toString()}`;
  }

  return (
    <div
      data-studio-first-run
      className="flex h-full min-h-0 w-full flex-col overflow-y-auto px-4 pb-8 pt-8 sm:px-6 sm:pt-12 lg:pt-16"
    >
      <EmptyState
        title="Create Your Bot"
        headingAs="h2"
        className="wl-composer-dock mx-auto w-full max-w-3xl py-6"
      >
        <div className="mx-auto mt-2 w-full max-w-xl text-left">
          <label
            className="mb-2 block text-sm font-semibold text-foreground"
            htmlFor="studio-brief"
          >
            {BOT_LANGUAGE.setupPrompt}
          </label>
          <textarea
            id="studio-brief"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            className="min-h-[92px] w-full resize-none rounded-xl border border-border bg-card p-4 text-base leading-6 placeholder:text-[var(--wireline-color-text-tertiary)] focus-visible:border-[var(--wireline-color-focus-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)]/40 sm:resize-y md:text-[15px]"
            placeholder="Answer calls, qualify leads, book appointments…"
          />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link to={createHref()}>
                <Plus size={15} aria-hidden="true" />
                Create Bot
              </Link>
            </Button>
          </div>
        </div>
      </EmptyState>
    </div>
  );
}

export default function StudioWorkspaceV2() {
  return (
    <ComputerWorkspaceProvider>
      <StudioWorkspaceContent />
    </ComputerWorkspaceProvider>
  );
}

function StudioWorkspaceContent() {
  const computer = useComputerWorkspace();
  const { loading, degraded, refresh } = useAgents();
  const { user } = useAuth();
  const studioSession = useStudioSessionState();
  const {
    setupDrafts,
    drafts: workroomDrafts,
    conversations: workroomConversations,
  } = studioSession;
  const {
    requestedId,
    resolvedId: resolvedAgentId,
    agents,
    phoneLookupDegraded,
  } = useStudioActiveAgentId();
  const [params, setParams] = useSearchParams();
  const workroomRef = useRef<StudioWorkroomHandle>(null);
  const setupTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelExpandRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<{ view: "setup" | "computer"; id: string } | null>(null);
  const splitWorkspace = useMediaQuery("(min-width: 1180px)");
  // Explicit Computer links reopen the pane even after a saved collapse.
  const [panelCollapsed, setPanelCollapsedState] = useState(readStoredPanelCollapsed);
  // Full width hides the conversation (kept mounted) until the owner restores it.
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const workspaceObserverRef = useRef<ResizeObserver | null>(null);
  const requestedAgentId = requestedId?.trim() || "";
  // Explicit links never select another Bot while the requested one is unavailable.
  const activeAgentId = requestedAgentId || resolvedAgentId;
  const active = activeAgentId ? agents.find((agent) => agent.id === activeAgentId) : undefined;
  const requestedAgentUnavailable = Boolean(requestedAgentId && !active);

  const sectionParam = params.get("section");
  const panelParam = params.get("panel");
  const creatingRequested = params.get("create") === "1";
  const workroomParam = params.get("workroom");
  const commandParam = params.get("command");
  const commandNonceParam = params.get("commandNonce");
  const legacyMode = params.get("mode");
  const legacyView = params.get("view");
  const setupChat = params.get("chat") !== "computer";
  const routeState = {
    section: sectionParam,
    workroom: workroomParam,
    command: commandParam,
    commandNonce: commandNonceParam,
  };

  const inspectorSection = readStudioInspectorSection(sectionParam);
  const [workroomMode, setWorkroomModeState] = useState<WorkroomMode>(() =>
    readStudioWorkroomMode(routeState),
  );
  const [rehearsalFocusRequest, setRehearsalFocusRequest] = useState<{
    agentId: string;
    ownerId: string;
  } | null>(null);
  const inspectorOpen = ["details", "setup", "review"].includes(sectionParam || "");
  const computerFocused = params.get("focus") === "computer" && !inspectorOpen;
  const panelOpen =
    splitWorkspace &&
    !inspectorOpen &&
    (computerFocused ||
      (workroomMode !== "test" && (panelParam === "computer" || !panelCollapsed)));
  const mobileBrowserOpen = !splitWorkspace && panelParam === "computer" && !inspectorOpen;
  const panelFill = panelOpen && (panelExpanded || computerFocused);
  // Configure and Rehearse keep separate histories (session keys by mode).
  // The conversation owns its mode outright: the computer panel never forces
  // it, and rehearsal never shares the panel.
  const mainMode: WorkroomMode = workroomMode;
  const panelMaxSize =
    workspaceWidth > 0
      ? Math.min(PANEL_MAX_CAP, Math.max(PANEL_MIN_WIDTH, workspaceWidth - CONVERSATION_MIN_WIDTH))
      : PANEL_MAX_CAP;

  // A callback ref: the layout mounts only after the roster resolves.
  const measureWorkspace = useCallback((node: HTMLDivElement | null) => {
    workspaceObserverRef.current?.disconnect();
    workspaceObserverRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setWorkspaceWidth(Math.round(width));
    });
    observer.observe(node);
    workspaceObserverRef.current = observer;
  }, []);

  const setPanelCollapsed = useCallback((collapsed: boolean) => {
    setPanelCollapsedState(collapsed);
    try {
      const raw = window.localStorage.getItem(STUDIO_INSPECTOR_STORAGE_KEY);
      const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      window.localStorage.setItem(
        STUDIO_INSPECTOR_STORAGE_KEY,
        JSON.stringify({ ...stored, collapsed }),
      );
    } catch {
      // Storage may be unavailable in private browsing or hardened webviews.
    }
  }, []);

  useEffect(() => {
    if (!splitWorkspace || inspectorOpen || requestedAgentUnavailable) return;
    if (workroomMode === "test") setPanelCollapsed(true);
    else if (panelParam === "computer") setPanelCollapsed(false);
  }, [
    inspectorOpen,
    panelParam,
    requestedAgentUnavailable,
    setPanelCollapsed,
    splitWorkspace,
    workroomMode,
  ]);

  useEffect(() => {
    if (!splitWorkspace) setPanelExpanded(false);
  }, [splitWorkspace]);

  useEffect(() => {
    const target = returnFocus.current;
    if (!target) return;
    if (target.view === "setup" ? inspectorOpen : panelOpen || mobileBrowserOpen) return;
    document.getElementById(target.id)?.focus({ preventScroll: true });
    returnFocus.current = null;
  }, [inspectorOpen, mobileBrowserOpen, panelOpen]);

  useEffect(() => {
    setWorkroomModeState(
      readStudioWorkroomMode({
        section: sectionParam,
        workroom: workroomParam,
        command: commandParam,
        commandNonce: commandNonceParam,
      }),
    );
  }, [sectionParam, workroomParam, commandParam, commandNonceParam]);

  useEffect(() => {
    if (requestedAgentUnavailable) return;
    const needsNormalization =
      legacyMode === "workroom" ||
      legacyView === "workspace" ||
      sectionParam === "test" ||
      ((commandParam || commandNonceParam) && workroomParam !== "test");
    if (!needsNormalization) return;
    // The helper performs the legacy next.delete("mode") / next.delete("view") cleanup.
    setParams((current) => normalizeStudioRouteParams(current), { replace: true });
  }, [
    requestedAgentUnavailable,
    legacyMode,
    legacyView,
    sectionParam,
    workroomParam,
    commandParam,
    commandNonceParam,
    setParams,
  ]);

  useEffect(() => {
    // Creation owns the next destination. A roster refresh must not write the
    // old ?create=1 URL over its handoff to the new Bot's setup panel.
    if (
      creatingRequested ||
      requestedAgentId ||
      loading ||
      agents.length === 0 ||
      !resolvedAgentId ||
      resolvedAgentId === requestedId
    )
      return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("agent", resolvedAgentId);
        if (!requestedAgentId) {
          if (next.has("command") || next.has("commandNonce")) {
            next.set("workroom", "test");
          }
          next.delete("command");
          next.delete("commandNonce");
        }
        return next;
      },
      { replace: true },
    );
  }, [
    agents,
    creatingRequested,
    loading,
    requestedAgentId,
    requestedId,
    resolvedAgentId,
    setParams,
  ]);

  useEffect(() => {
    if (active?.id) writeStudioLastAgentId(active.id);
  }, [active?.id]);

  const openInspector = useCallback(
    (section: InspectorSection) => {
      setParams((current) => setStudioInspectorSectionParams(current, section), { replace: true });
    },
    [setParams],
  );

  const requestBrowserTask = useCallback(() => {
    setParams(
      (current) => {
        return setStudioBrowserTaskParams(current);
      },
      { replace: true },
    );
  }, [setParams]);

  const openComputerMode = useCallback(() => {
    if (splitWorkspace) setPanelCollapsed(false);
    requestBrowserTask();
  }, [requestBrowserTask, setPanelCollapsed, splitWorkspace]);

  const requestMessage = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("chat", "setup");
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  const closeComputer = useCallback(() => {
    returnFocus.current = { view: "computer", id: "studio-panel-toggle" };
    setPanelExpanded(false);
    if (splitWorkspace) setPanelCollapsed(true);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("focus");
        next.delete("panel");
        return next;
      },
      { replace: true },
    );
  }, [setPanelCollapsed, setParams, splitWorkspace]);

  const closeSetup = useCallback(() => {
    returnFocus.current = {
      view: "setup",
      id: sectionParam === "details" ? "studio-bot-details-toggle" : "studio-settings-toggle",
    };
    setParams(clearStudioInspectorSectionParams, { replace: true });
  }, [sectionParam, setParams]);

  const setWorkroomMode = useCallback(
    (mode: WorkroomMode) => {
      setWorkroomModeState(mode);
      setParams(
        (current) => {
          const next = clearStudioInspectorSectionParams(
            setStudioWorkroomModeParams(current, mode),
          );
          next.set("chat", "setup");
          next.delete("focus");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const startRehearsal = useCallback(() => {
    if (!active?.id || !user?.id) return;
    setRehearsalFocusRequest({ agentId: active.id, ownerId: user.id });
    // Rehearse in the conversation itself; on wide screens the panel closes
    // so rehearsal never sits beside the computer as a peer tab.
    setWorkroomMode("test");
    if (splitWorkspace) setPanelCollapsed(true);
  }, [active?.id, setPanelCollapsed, setWorkroomMode, splitWorkspace, user?.id]);

  const rehearsalVisible = workroomMode === "test";

  const showBrowser = useCallback(() => {
    if (splitWorkspace) setPanelCollapsed(false);
    setParams(
      (current) => {
        const next = clearStudioInspectorSectionParams(current);
        next.set("panel", "computer");
        next.delete("focus");
        return next;
      },
      { replace: true },
    );
  }, [setPanelCollapsed, setParams, splitWorkspace]);

  useEffect(() => {
    if (!rehearsalFocusRequest) return;
    if (
      rehearsalFocusRequest.agentId !== active?.id ||
      rehearsalFocusRequest.ownerId !== user?.id
    ) {
      setRehearsalFocusRequest(null);
      return;
    }
    if (loading || !rehearsalVisible || inspectorOpen) return;
    // Focusing is separate from starting: only the account holder's explicit
    // Start click may request a microphone or create a voice session.
    workroomRef.current?.focusVoiceRehearsal();
    setRehearsalFocusRequest(null);
  }, [
    active?.id,
    inspectorOpen,
    loading,
    panelOpen,
    rehearsalFocusRequest,
    rehearsalVisible,
    user?.id,
  ]);

  if (loading) return <StudioLoadingState />;
  if (requestedAgentUnavailable) {
    return (
      <div className="p-4 sm:p-6">
        <StatusNotice
          tone="warning"
          title={degraded ? "Bot Lookup Unavailable" : "Bot Unavailable"}
          action={
            <div className="flex flex-wrap gap-2">
              {degraded ? (
                <Button type="button" variant="secondary" size="sm" onClick={refresh}>
                  Retry
                </Button>
              ) : null}
              <Button asChild variant="secondary" size="sm">
                <Link to="/studio">Choose Bot</Link>
              </Button>
            </div>
          }
        >
          {degraded
            ? "We couldn't verify the Bot in this link. Retry or choose a Bot to continue."
            : "The Bot in this link is no longer available. Choose a Bot to continue."}
        </StatusNotice>
      </div>
    );
  }
  if (agents.length === 0 && degraded) return <WorkspaceRecovery onRetry={refresh} />;
  if (agents.length === 0) return <StudioEmptyState />;

  if (!active) {
    return (
      <EmptyState
        fill
        icon={Users}
        headingAs="h2"
        title="Choose a Bot"
        action={
          <Button asChild>
            <Link to="/studio?create=1">
              <Plus size={15} aria-hidden="true" />
              New Bot
            </Link>
          </Button>
        }
      />
    );
  }

  if (computerFocused && !splitWorkspace) {
    return <Navigate to={`/computer?agent=${encodeURIComponent(active.id)}`} replace />;
  }

  const setupPanel = (
    <StudioAgentWorkspacePanel
      key={active.id}
      agentId={active.id}
      agentName={active.name}
      onRehearseVoiceInChat={startRehearsal}
      drafts={setupDrafts}
      className="h-full border-t-0"
    />
  );

  const reviewPanel = (
    <StudioAgentReviewPanel
      key={active.id}
      agentId={active.id}
      agentName={active.name}
      agentRole={active.role}
      phoneNumber={active.phone_number}
      onEdit={() => openInspector("setup")}
      onRehearse={startRehearsal}
      focusEmail={params.get("detail") === "email"}
      className="h-full"
    />
  );

  const detailsPanel = (
    <StudioBotDetailsPanel
      key={active.id}
      agent={active}
      phoneLookupDegraded={phoneLookupDegraded}
      onEmail={() => {
        setParams(
          (current) => {
            const next = setStudioInspectorSectionParams(current, "review");
            next.set("detail", "email");
            return next;
          },
          { replace: true },
        );
      }}
    />
  );

  studioSession.visitBot(active.id);
  const sessionFor = (mode: WorkroomMode) => {
    const key = `${active.id}:${mode}`;
    let session = workroomConversations.get(key);
    if (!session) {
      session = {
        snapshot: {
          messages: [],
          clearing: false,
          clearError: null,
          replyError: null,
          interrupted: false,
        },
        loaded: false,
        operations: new Map(),
        listeners: new Set(),
      };
      workroomConversations.set(key, session);
    }
    return { key, session };
  };

  const main = sessionFor(mainMode);
  // Legacy route commands focus private voice rehearsal without editing the Bot.
  const mainReceivesCommand = mainMode === "test";

  const workroom = (
    <StudioWorkroom
      key={`${user?.id}:${main.key}`}
      ref={workroomRef}
      agentId={active.id}
      agentName={active.name}
      markKey={active.mark_key}
      initialCommand={mainReceivesCommand ? commandParam || undefined : undefined}
      commandNonce={mainReceivesCommand ? commandNonceParam || undefined : undefined}
      initialDraft={workroomDrafts.get(main.key)}
      onDraftChange={(draft) => workroomDrafts.set(main.key, draft)}
      conversationSession={main.session}
      timelineExtras={[
        ...new Map(
          [
            ...(computer.tasks || []),
            ...(computer.selected ? [computer.selected] : []),
            ...(computer.activeTask ? [computer.activeTask] : []),
          ]
            .filter((task) => task.agentId === active.id)
            .map((task) => [task.id, task]),
        ).values(),
      ].map((task) => ({
        id: `task-${task.id}`,
        createdAt: task.startedAt,
        updatedAt: task.updatedAt,
        node: (
          <StudioTaskMessages
            selected={task}
            agentId={active.id}
            agentName={active.name}
            markKey={active.mark_key}
            onReply={
              task.id === computer.activeTask?.id
                ? () => {
                    requestBrowserTask();
                    requestAnimationFrame(() => workroomRef.current?.focusComposer());
                  }
                : undefined
            }
            onShowBrowser={() => {
              computer.setSelectedId(task.id);
              showBrowser();
            }}
          />
        ),
      }))}
      browserRequested={!setupChat}
      computerViewOpen={panelOpen || mobileBrowserOpen}
      autoReply={!inspectorOpen && !mobileBrowserOpen}
      onRequestBrowserTask={requestBrowserTask}
      onActivateComputer={openComputerMode}
      onRequestMessage={requestMessage}
      onShowBrowser={showBrowser}
      timelineNotice={
        computer.listFailed ? (
          <StatusNotice
            tone="warning"
            title="Browser task history could not load"
            action={
              <Button size="sm" variant="secondary" onClick={() => void computer.loadTasks()}>
                Retry
              </Button>
            }
          >
            Your conversation is still available.
          </StatusNotice>
        ) : undefined
      }
      layout={splitWorkspace ? "split" : "standalone"}
      modeControls="composer"
      mode={mainMode}
      onModeChange={panelOpen ? undefined : setWorkroomMode}
      allowOutbound={Boolean(active.phone_number)}
      phoneNumber={active.phone_number}
      voiceVisible={!inspectorOpen && !mobileBrowserOpen}
    />
  );

  const restoreSplitView = () => {
    setPanelExpanded(false);
    if (!computerFocused) return;
    setPanelCollapsed(false);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("focus");
        return next;
      },
      { replace: true },
    );
  };

  const computerPanel =
    panelOpen || mobileBrowserOpen ? (
      <aside
        id="studio-computer-panel"
        className="flex h-full min-h-0 min-w-0 w-full flex-col"
        aria-label="Browser"
        onKeyDown={(event) => {
          if (
            event.key !== "Escape" ||
            !panelFill ||
            event.defaultPrevented ||
            document.fullscreenElement ||
            event.nativeEvent.isComposing
          )
            return;
          // A website, editor or open dialog owns Escape before workspace chrome.
          if (
            event.target instanceof Element &&
            event.target.closest(
              'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"], .wl-computer-screen__viewport',
            )
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          restoreSplitView();
          panelExpandRef.current?.focus();
        }}
      >
        <header className="wl-studio-panel-header">
          <h2 className="text-sm font-semibold">Browser</h2>
          <div className="wl-studio-panel-actions">
            {splitWorkspace ? (
              <button
                ref={panelExpandRef}
                type="button"
                onClick={() => {
                  if (panelFill) restoreSplitView();
                  else setPanelExpanded(true);
                }}
                className="wl-studio-panel-action wl-focus-ring-halo"
                aria-label={panelFill ? "Restore split view" : "Expand panel"}
                aria-pressed={panelFill}
                title={panelFill ? "Restore split view (Esc)" : "Expand panel"}
              >
                {panelFill ? (
                  <Minimize2 className="size-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="size-4" aria-hidden="true" />
                )}
                {panelFill ? <span>Split view</span> : null}
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeComputer}
              className="wl-studio-panel-action wl-focus-ring-halo"
              aria-label="Close browser"
              title="Close browser"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense
            fallback={
              <div className="p-3" aria-busy="true" aria-label="Loading computer">
                <PanelSkeleton rows={4} />
              </div>
            }
          >
            <ComputerWorkbench
              key={active.id}
              agentId={active.id}
              layout="panel"
              chatControls={splitWorkspace}
            />
          </Suspense>
        </div>
      </aside>
    ) : null;

  const botSetup = inspectorOpen ? (
    <section
      id="studio-inspector"
      aria-label="Bot setup"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-3 px-3 py-1 sm:px-6">
          <div className="wl-studio-panel-tabs" role="tablist" aria-label="Bot setup sections">
            {SETUP_TABS.map(({ id, label }, index) => (
              <button
                key={id}
                ref={(element) => {
                  setupTabRefs.current[index] = element;
                }}
                id={`studio-inspector-subtab-${id}`}
                type="button"
                role="tab"
                aria-selected={inspectorSection === id}
                aria-controls="studio-inspector-panel"
                tabIndex={inspectorSection === id ? 0 : -1}
                onClick={() => openInspector(id)}
                onKeyDown={(event) => {
                  const count = SETUP_TABS.length;
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? count - 1
                        : event.key === "ArrowLeft"
                          ? (index + count - 1) % count
                          : event.key === "ArrowRight"
                            ? (index + 1) % count
                            : null;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  openInspector(SETUP_TABS[nextIndex]!.id);
                  setupTabRefs.current[nextIndex]?.focus();
                }}
                className="wl-studio-panel-tab wl-focus-ring-halo"
              >
                {label}
              </button>
            ))}
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={closeSetup} className="min-h-11">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Work
          </Button>
        </div>
      </header>
      <div
        id="studio-inspector-panel"
        role="tabpanel"
        aria-labelledby={`studio-inspector-subtab-${inspectorSection}`}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {inspectorSection === "details"
          ? detailsPanel
          : inspectorSection === "review"
            ? reviewPanel
            : setupPanel}
      </div>
    </section>
  ) : null;

  return (
    <div className="wl-studio-workspace flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div ref={measureWorkspace} className="flex min-h-0 flex-1 overflow-hidden">
        {/* Keep drafts and in-flight conversations intact while another view is open. */}
        <div
          className={`${inspectorOpen || mobileBrowserOpen || panelFill ? "hidden" : "block"} min-h-0 min-w-0 flex-1 overflow-hidden`}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1">{workroom}</div>
          </div>
        </div>
        {botSetup}
        {splitWorkspace && !inspectorOpen ? (
          <WorkspaceResizablePanel
            storageKey={STUDIO_INSPECTOR_STORAGE_KEY}
            side="right"
            defaultSize={PANEL_DEFAULT_WIDTH}
            minSize={PANEL_MIN_WIDTH}
            maxSize={panelMaxSize}
            collapsedSize={0}
            collapsed={!panelOpen}
            fill={panelFill}
            onCollapsedChange={(collapsed) => {
              if (collapsed) closeComputer();
              else showBrowser();
            }}
            resizeHandleLabel="Resize workspace panel"
            controlsId="studio-computer-panel"
            className={panelOpen ? "wl-studio-panel-surface" : undefined}
          >
            {({ collapsed }) => (collapsed ? null : computerPanel)}
          </WorkspaceResizablePanel>
        ) : mobileBrowserOpen ? (
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{computerPanel}</div>
        ) : null}
      </div>
    </div>
  );
}
