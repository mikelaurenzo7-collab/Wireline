import { Globe, Maximize2, Minimize2, Plus, Sparkles, Users, X } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import { Button, Skeleton } from "../components/atoms";
import { PanelSkeleton } from "../components/atoms/skeleton-presets";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusNotice } from "./molecules/StatusNotice";
import { BotBoundLockup } from "./brand/BotBoundBrand";
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
} from "../lib/studio-route-state";
import { customerAgentLanguage } from "../lib/product-copy";
import StudioAgentReviewPanel from "./StudioAgentReviewPanel";
import StudioAgentWorkspacePanel from "./StudioAgentWorkspacePanel";
import StudioWorkroom, { type StudioWorkroomHandle } from "./StudioWorkroom";
import WorkspaceRecovery from "./WorkspaceRecovery";
import StudioTaskChat from "./StudioTaskChat";
import { ComputerWorkspaceProvider } from "../contexts/ComputerWorkspaceContext";

// The computer is a page of its own; load it only when its panel tab opens.
const ComputerWorkbench = lazy(() =>
  import("../pages/ComputerPage").then((module) => ({ default: module.ComputerWorkbench })),
);

type InspectorSection = "setup" | "review";
/** Panel tabs that are not route-owned: the panel returns to the last one used. */
type RestingSection = "try" | "computer";
type PanelSection = RestingSection | InspectorSection;
type WorkroomMode = "configure" | "test";

const BOT_LANGUAGE = customerAgentLanguage();
// A wider browser workspace has its own size preference. Earlier saved widths
// belong to the narrower setup inspector and cannot fit a usable browser.
const STUDIO_INSPECTOR_STORAGE_KEY = "wireline:studio-panel:v3";
const STUDIO_PANEL_REST_STORAGE_KEY = "wireline:studio-panel-rest:v1";
const PANEL_TABS: ReadonlyArray<{ id: PanelSection; label: string }> = [
  { id: "computer", label: "Browser" },
  { id: "try", label: "Rehearse" },
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
    if (!raw) return false;
    return (JSON.parse(raw) as { collapsed?: unknown })?.collapsed === true;
  } catch {
    return false;
  }
}

function readStoredRestingSection(): RestingSection {
  try {
    return window.localStorage.getItem(STUDIO_PANEL_REST_STORAGE_KEY) === "try"
      ? "try"
      : "computer";
  } catch {
    return "computer";
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
      <BotBoundLockup size="standard" surface="bare" className="mx-auto mb-6" />
      <EmptyState
        icon={Sparkles}
        title="Create Your Bot"
        className="wl-composer-dock mx-auto w-full max-w-3xl"
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
  const { loading, degraded, refresh } = useAgents();
  const { user } = useAuth();
  const studioSession = useStudioSessionState();
  const {
    setupDrafts,
    drafts: workroomDrafts,
    conversations: workroomConversations,
  } = studioSession;
  const { requestedId, resolvedId: resolvedAgentId, agents } = useStudioActiveAgentId();
  const [params, setParams] = useSearchParams();
  const workroomRef = useRef<StudioWorkroomHandle>(null);
  const tryWorkroomRef = useRef<StudioWorkroomHandle>(null);
  const inspectorTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const computerRouteApplied = useRef(false);
  const panelExpandRef = useRef<HTMLButtonElement | null>(null);
  const splitWorkspace = useMediaQuery("(min-width: 1180px)");
  // Wide screens open Work chat beside its browser. Rehearsal and setup share
  // that optional panel; explicit links reopen it even after a saved collapse.
  const [panelCollapsed, setPanelCollapsedState] = useState(readStoredPanelCollapsed);
  const [restingSection, setRestingSectionState] = useState(readStoredRestingSection);
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
  const setupChat =
    params.get("chat") === "setup" ||
    sectionParam === "setup" ||
    sectionParam === "review" ||
    workroomParam === "test" ||
    Boolean(commandParam || commandNonceParam);
  const routeState = {
    section: sectionParam,
    workroom: workroomParam,
    command: commandParam,
    commandNonce: commandNonceParam,
  };

  const [inspectorSection, setInspectorSection] = useState<InspectorSection>(() =>
    readStudioInspectorSection(sectionParam),
  );
  const [workroomMode, setWorkroomModeState] = useState<WorkroomMode>(() =>
    readStudioWorkroomMode(routeState),
  );
  const [rehearsalFocusRequest, setRehearsalFocusRequest] = useState<{
    agentId: string;
    ownerId: string;
  } | null>(null);
  // Details are requested explicitly, including links from creation and review.
  // The route owns visibility so a saved desktop collapse cannot hide a deep link.
  const inspectorOpen = sectionParam === "setup" || sectionParam === "review";
  const computerFocused = params.get("focus") === "computer" && !inspectorOpen;
  const panelSection: PanelSection = inspectorOpen
    ? inspectorSection
    : computerFocused
      ? "computer"
      : restingSection;
  const panelOpen = splitWorkspace && (inspectorOpen || computerFocused || !panelCollapsed);
  const mobileBrowserOpen = !splitWorkspace && panelParam === "computer" && !inspectorOpen;
  const panelFill = panelOpen && (panelExpanded || computerFocused);
  // Set up chat keeps its configuration and rehearsal histories separate. A
  // rehearsal command still reaches that conversation if another panel is open.
  const injectedRehearsal = Boolean(commandParam || commandNonceParam);
  const mainMode: WorkroomMode =
    panelOpen && !(injectedRehearsal && panelSection !== "try") ? "configure" : workroomMode;
  const panelMaxSize =
    workspaceWidth > 0
      ? Math.min(PANEL_MAX_CAP, Math.max(PANEL_MIN_WIDTH, workspaceWidth - CONVERSATION_MIN_WIDTH))
      : PANEL_DEFAULT_WIDTH;

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

  const setRestingSection = useCallback((section: RestingSection) => {
    setRestingSectionState(section);
    try {
      window.localStorage.setItem(STUDIO_PANEL_REST_STORAGE_KEY, section);
    } catch {
      // Storage may be unavailable in private browsing or hardened webviews.
    }
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
    // A Details link, or a rehearsal request on a wide screen, opens the panel;
    // a rehearsal request also brings Rehearse forward over the browser.
    if (!splitWorkspace) return;
    if (inspectorOpen || workroomMode === "test") setPanelCollapsed(false);
    if (workroomMode === "test" && !inspectorOpen) setRestingSection("try");
  }, [inspectorOpen, setPanelCollapsed, setRestingSection, splitWorkspace, workroomMode]);

  useEffect(() => {
    // Full width belongs to an open wide-screen panel only.
    if (!panelOpen) setPanelExpanded(false);
  }, [panelOpen]);

  useEffect(() => {
    const inspectorRequested = sectionParam === "setup" || sectionParam === "review";
    if (inspectorRequested) {
      setInspectorSection(readStudioInspectorSection(sectionParam));
    }
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
      setInspectorSection(section);
      setParams(
        (current) => {
          const next = setStudioInspectorSectionParams(current, section);
          next.delete("focus");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const openPanelSection = useCallback(
    (section: PanelSection) => {
      if (section === "try" || section === "computer") {
        setRestingSection(section);
        setPanelCollapsed(false);
        setParams(
          (current) => {
            const next = clearStudioInspectorSectionParams(current);
            if (section !== "computer") {
              next.delete("focus");
              next.delete("panel");
            }
            return next;
          },
          { replace: true },
        );
        return;
      }
      openInspector(section);
    },
    [openInspector, setPanelCollapsed, setParams, setRestingSection],
  );

  useEffect(() => {
    // The Computer destination and the optional side panel share one workbench.
    // Keep its explicit route so the rail and reload retain the same destination.
    if (panelParam !== "computer" || !splitWorkspace) {
      computerRouteApplied.current = false;
      return;
    }
    if (requestedAgentUnavailable || computerRouteApplied.current) return;
    // Apply each explicit route once; local panel changes can render before the
    // router commits their URL update and must not reopen the previous panel.
    computerRouteApplied.current = true;
    openPanelSection("computer");
  }, [openPanelSection, panelParam, requestedAgentUnavailable, splitWorkspace]);

  const closeInspector = useCallback(() => {
    setPanelExpanded(false);
    if (splitWorkspace) {
      // Closing the wide-screen panel also returns the conversation to editing.
      setPanelCollapsed(true);
      setParams(
        (current) => {
          const next = setStudioWorkroomModeParams(
            clearStudioInspectorSectionParams(current),
            "configure",
          );
          next.delete("focus");
          next.delete("panel");
          return next;
        },
        { replace: true },
      );
    } else {
      setParams(
        (current) => {
          const next = clearStudioInspectorSectionParams(current);
          next.delete("focus");
          next.delete("panel");
          return next;
        },
        { replace: true },
      );
    }
    requestAnimationFrame(() => document.getElementById("studio-settings-toggle")?.focus());
  }, [setPanelCollapsed, setParams, splitWorkspace]);

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
    if (splitWorkspace) openPanelSection("try");
    else setWorkroomMode("test");
  }, [active?.id, openPanelSection, setWorkroomMode, splitWorkspace, user?.id]);

  const rehearsalVisible = panelOpen ? panelSection === "try" : workroomMode === "test";

  const showBrowser = useCallback(() => {
    if (splitWorkspace) openPanelSection("computer");
    else
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("panel", "computer");
          return next;
        },
        { replace: true },
      );
  }, [openPanelSection, setParams, splitWorkspace]);

  useEffect(() => {
    if (!rehearsalFocusRequest) return;
    if (
      rehearsalFocusRequest.agentId !== active?.id ||
      rehearsalFocusRequest.ownerId !== user?.id
    ) {
      setRehearsalFocusRequest(null);
      return;
    }
    if (loading || !rehearsalVisible || (!splitWorkspace && inspectorOpen)) return;
    // Focusing is separate from starting: only the account holder's explicit
    // Start click may request a microphone or create a voice session.
    (panelOpen ? tryWorkroomRef : workroomRef).current?.focusVoiceRehearsal();
    setRehearsalFocusRequest(null);
  }, [
    active?.id,
    inspectorOpen,
    loading,
    panelOpen,
    rehearsalFocusRequest,
    rehearsalVisible,
    splitWorkspace,
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
      isBusinessAgent={Boolean(active.is_business_agent)}
      onRehearseVoiceInChat={startRehearsal}
      drafts={setupDrafts}
      className="h-full border-t-0"
      compact={splitWorkspace}
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
      className="h-full"
      compact={splitWorkspace}
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
      layout={splitWorkspace ? "split" : "standalone"}
      modeControls="composer"
      mode={mainMode}
      // With the private rehearsal pane open, Set up chat only edits the Bot.
      // Narrow screens switch that same setup conversation into rehearsal.
      onModeChange={panelOpen ? undefined : setWorkroomMode}
      allowOutbound={Boolean(active.phone_number)}
      phoneNumber={active.phone_number}
      voiceVisible={setupChat && (splitWorkspace || !inspectorOpen) && !mobileBrowserOpen}
    />
  );

  const tryRoom = sessionFor("test");
  const tryWorkroom =
    panelOpen && panelSection === "try" ? (
      <StudioWorkroom
        key={`${user?.id}:${tryRoom.key}`}
        ref={tryWorkroomRef}
        agentId={active.id}
        agentName={active.name}
        markKey={active.mark_key}
        initialCommand={commandParam || undefined}
        commandNonce={commandNonceParam || undefined}
        initialDraft={workroomDrafts.get(tryRoom.key)}
        onDraftChange={(draft) => workroomDrafts.set(tryRoom.key, draft)}
        conversationSession={tryRoom.session}
        layout="split"
        mode="test"
        allowOutbound={Boolean(active.phone_number)}
        phoneNumber={active.phone_number}
        voiceVisible
      />
    ) : null;

  // Keyed by Bot: a different Bot's computer composer never inherits a draft.
  const computerPanel =
    (panelOpen && panelSection === "computer") || mobileBrowserOpen ? (
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
    ) : null;

  // Wide screens offer Browser, Rehearse, Set up and Summary in one pane.
  // Phones keep Work, Configure, and Browser in one row.
  const panelTabs = splitWorkspace
    ? PANEL_TABS
    : PANEL_TABS.filter((tab) => tab.id !== "try" && tab.id !== "computer");
  const activePanelSection: PanelSection = splitWorkspace ? panelSection : inspectorSection;
  const selectPanelSection = (section: PanelSection) =>
    section === "try" || section === "computer"
      ? openPanelSection(section)
      : openInspector(section);

  const restoreSplitView = () => {
    setPanelExpanded(false);
    if (!computerFocused) return;
    setPanelCollapsed(false);
    setRestingSection("computer");
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("focus");
        return next;
      },
      { replace: true },
    );
  };

  const inspectorHeader = (
    <header className="wl-studio-panel-header">
      <div className="wl-studio-panel-tabs" role="tablist" aria-label="Workspace panel">
        {panelTabs.map(({ id, label }, index) => (
          <button
            key={id}
            ref={(element) => {
              inspectorTabRefs.current[index] = element;
            }}
            id={`studio-inspector-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activePanelSection === id}
            aria-controls="studio-inspector-panel"
            tabIndex={activePanelSection === id ? 0 : -1}
            onClick={() => selectPanelSection(id)}
            onKeyDown={(event) => {
              const last = panelTabs.length - 1;
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? last
                    : event.key === "ArrowLeft"
                      ? index === 0
                        ? last
                        : index - 1
                      : event.key === "ArrowRight"
                        ? index === last
                          ? 0
                          : index + 1
                        : null;
              if (nextIndex === null) return;
              event.preventDefault();
              selectPanelSection(panelTabs[nextIndex]!.id);
              inspectorTabRefs.current[nextIndex]?.focus();
            }}
            className="wl-studio-panel-tab wl-focus-ring-halo"
          >
            {label}
          </button>
        ))}
      </div>
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
            aria-controls="studio-inspector"
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
          onClick={closeInspector}
          className="wl-studio-panel-action wl-focus-ring-halo"
          aria-label="Close panel"
          title="Close panel"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );

  const inspectorBody = (
    <div
      id="studio-inspector-panel"
      role="tabpanel"
      aria-labelledby={`studio-inspector-tab-${activePanelSection}`}
      className="min-h-0 flex-1 overflow-hidden"
    >
      {activePanelSection === "try"
        ? tryWorkroom
        : activePanelSection === "computer"
          ? computerPanel
          : activePanelSection === "review"
            ? reviewPanel
            : setupPanel}
    </div>
  );

  const inspector = (
    <aside
      id="studio-inspector"
      className="flex h-full min-h-0 w-full flex-col"
      aria-label="Workspace panel"
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
      {inspectorHeader}
      {inspectorBody}
    </aside>
  );

  const chatModes = (
    <div className="wl-studio-chat-modes" role="group" aria-label="Conversation mode">
      {(
        [
          { id: "work", label: "Work" },
          { id: "setup", label: "Configure" },
        ] as const
      ).map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={!mobileBrowserOpen && (id === "setup") === setupChat}
          onClick={() => {
            setParams(
              (current) => {
                const next = setStudioWorkroomModeParams(current, "configure");
                next.delete("panel");
                if (id === "setup") next.set("chat", "setup");
                else {
                  next.delete("chat");
                  next.delete("section");
                  next.delete("focus");
                }
                return next;
              },
              { replace: true },
            );
            if (id === "work" && splitWorkspace) {
              setRestingSection("computer");
              setPanelCollapsed(false);
            }
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="wl-studio-workspace flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {(!splitWorkspace || !panelOpen) && !inspectorOpen ? (
        <nav className="wl-studio-surface-nav" aria-label="Workspace view">
          {chatModes}
          <button
            type="button"
            aria-pressed={mobileBrowserOpen}
            onClick={() => {
              if (splitWorkspace) openPanelSection("computer");
              else
                setParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    next.set("panel", "computer");
                    next.delete("focus");
                    return next;
                  },
                  { replace: true },
                );
            }}
          >
            <Globe className="size-4" aria-hidden="true" />
            Browser
          </button>
        </nav>
      ) : null}
      <div ref={measureWorkspace} className="flex min-h-0 flex-1 overflow-hidden">
        {/* Keep drafts and in-flight conversations intact while mobile details
          are open or the panel is full width. */}
        <div
          className={`${(!splitWorkspace && inspectorOpen) || mobileBrowserOpen || panelFill ? "hidden" : "block"} min-h-0 min-w-0 flex-1 overflow-hidden`}
        >
          <div className="flex h-full min-h-0 flex-col">
            {splitWorkspace && panelOpen ? (
              <header className="wl-studio-mode-header">{chatModes}</header>
            ) : null}
            <div hidden={!setupChat} className="min-h-0 flex-1">
              {workroom}
            </div>
            <div hidden={setupChat} className="min-h-0 flex-1">
              <StudioTaskChat
                key={`${user?.id}:${active.id}`}
                agentId={active.id}
                agentName={active.name}
                onShowBrowser={showBrowser}
              />
            </div>
          </div>
        </div>
        {splitWorkspace ? (
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
              if (collapsed) closeInspector();
              else openPanelSection(panelSection);
            }}
            resizeHandleLabel="Resize workspace panel"
            controlsId="studio-inspector"
            className={panelOpen ? "wl-studio-panel-surface" : undefined}
          >
            {({ collapsed }) => (collapsed ? null : inspector)}
          </WorkspaceResizablePanel>
        ) : mobileBrowserOpen ? (
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{computerPanel}</div>
        ) : inspectorOpen ? (
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{inspector}</div>
        ) : null}
      </div>
    </div>
  );
}
