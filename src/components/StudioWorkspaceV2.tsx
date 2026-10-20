import { Maximize2, Minimize2, Plus, Sparkles, Users, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import { Button, Skeleton } from "../components/atoms";
import { PanelSkeleton } from "../components/atoms/skeleton-presets";
import { EmptyState } from "../components/ui/EmptyState";
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
// v2: the wide-screen panel now rests open on Try It instead of closed.
const STUDIO_INSPECTOR_STORAGE_KEY = "wireline:studio-panel:v2";
const STUDIO_PANEL_REST_STORAGE_KEY = "wireline:studio-panel-rest:v1";
const PANEL_TABS: ReadonlyArray<{ id: PanelSection; label: string }> = [
  { id: "try", label: "Try It" },
  { id: "computer", label: "Computer" },
  { id: "setup", label: "Details" },
  { id: "review", label: "Summary" },
];
// The panel can be dragged as wide as the conversation allows; Full width
// takes the rest. The conversation never narrows past a readable column.
const PANEL_DEFAULT_WIDTH = 440;
const PANEL_MIN_WIDTH = 384;
const PANEL_MAX_FLOOR = 560;
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
    return window.localStorage.getItem(STUDIO_PANEL_REST_STORAGE_KEY) === "computer"
      ? "computer"
      : "try";
  } catch {
    return "try";
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
  const splitWorkspace = useMediaQuery("(min-width: 1180px)");
  // Wide screens keep Try It beside the setup conversation. The owner can close
  // the panel; that choice persists, and a Details link always reopens it.
  const [panelCollapsed, setPanelCollapsedState] = useState(readStoredPanelCollapsed);
  const [restingSection, setRestingSectionState] = useState(readStoredRestingSection);
  // Full width hides the conversation (kept mounted) until the owner restores it.
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const workspaceObserverRef = useRef<ResizeObserver | null>(null);
  const active = resolvedAgentId ? agents.find((agent) => agent.id === resolvedAgentId) : undefined;

  const sectionParam = params.get("section");
  const panelParam = params.get("panel");
  const creatingRequested = params.get("create") === "1";
  const workroomParam = params.get("workroom");
  const commandParam = params.get("command");
  const commandNonceParam = params.get("commandNonce");
  const legacyMode = params.get("mode");
  const legacyView = params.get("view");
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
  const panelSection: PanelSection = inspectorOpen ? inspectorSection : restingSection;
  const panelOpen = splitWorkspace && (inspectorOpen || !panelCollapsed);
  const panelFill = panelOpen && panelExpanded;
  // With Try It beside it, the main conversation edits the Bot. A rehearsal
  // command still has to land somewhere when Details or Summary is the open
  // panel, so that command keeps the main conversation in Try It.
  const injectedRehearsal = Boolean(commandParam || commandNonceParam);
  const mainMode: WorkroomMode =
    panelOpen && !(injectedRehearsal && panelSection !== "try") ? "configure" : workroomMode;
  const panelMaxSize =
    workspaceWidth > 0
      ? Math.min(PANEL_MAX_CAP, Math.max(PANEL_MAX_FLOOR, workspaceWidth - CONVERSATION_MIN_WIDTH))
      : PANEL_MAX_FLOOR;

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
    // a rehearsal request also brings Try It forward over the computer.
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
    const needsNormalization =
      legacyMode === "workroom" ||
      legacyView === "workspace" ||
      sectionParam === "test" ||
      ((commandParam || commandNonceParam) && workroomParam !== "test");
    if (!needsNormalization) return;
    // The helper performs the legacy next.delete("mode") / next.delete("view") cleanup.
    setParams((current) => normalizeStudioRouteParams(current), { replace: true });
  }, [
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
        if (!requestedId) {
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
  }, [agents, creatingRequested, loading, requestedId, resolvedAgentId, setParams]);

  useEffect(() => {
    if (active?.id) writeStudioLastAgentId(active.id);
  }, [active?.id]);

  const openInspector = useCallback(
    (section: InspectorSection) => {
      setInspectorSection(section);
      setParams((current) => setStudioInspectorSectionParams(current, section), {
        replace: true,
      });
    },
    [setParams],
  );

  const openPanelSection = useCallback(
    (section: PanelSection) => {
      if (section === "try" || section === "computer") {
        setRestingSection(section);
        setPanelCollapsed(false);
        setParams((current) => clearStudioInspectorSectionParams(current), { replace: true });
        return;
      }
      openInspector(section);
    },
    [openInspector, setPanelCollapsed, setParams, setRestingSection],
  );

  useEffect(() => {
    // "Beside chat" on the full Computer page lands here with ?panel=computer.
    if (panelParam !== "computer") return;
    if (splitWorkspace) openPanelSection("computer");
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("panel");
        return next;
      },
      { replace: true },
    );
  }, [openPanelSection, panelParam, setParams, splitWorkspace]);

  const closeInspector = useCallback(() => {
    setPanelExpanded(false);
    if (splitWorkspace) {
      // Closing the wide-screen panel also returns the conversation to editing.
      setPanelCollapsed(true);
      setParams(
        (current) =>
          setStudioWorkroomModeParams(clearStudioInspectorSectionParams(current), "configure"),
        { replace: true },
      );
    } else {
      setParams((current) => clearStudioInspectorSectionParams(current), { replace: true });
    }
    requestAnimationFrame(() => document.getElementById("studio-settings-toggle")?.focus());
  }, [setPanelCollapsed, setParams, splitWorkspace]);

  const setWorkroomMode = useCallback(
    (mode: WorkroomMode) => {
      setWorkroomModeState(mode);
      setParams(
        (current) => clearStudioInspectorSectionParams(setStudioWorkroomModeParams(current, mode)),
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
  // Route commands prefill a rehearsal; beside the panel, that is Try It's composer.
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
      mode={mainMode}
      // Beside an open Try It panel the conversation only edits; otherwise
      // the owner switches between changing the Bot and trying it here.
      onModeChange={panelOpen ? undefined : setWorkroomMode}
      allowOutbound={Boolean(active.phone_number)}
      phoneNumber={active.phone_number}
      voiceVisible={splitWorkspace || !inspectorOpen}
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
    panelOpen && panelSection === "computer" ? (
      <Suspense
        fallback={
          <div className="p-3" aria-busy="true" aria-label="Loading computer">
            <PanelSkeleton rows={4} />
          </div>
        }
      >
        <ComputerWorkbench key={active.id} agentId={active.id} layout="panel" />
      </Suspense>
    ) : null;

  // Wide screens add Try It and the Bot's computer beside Details and Summary;
  // narrow screens switch the conversation itself between Change and Try It,
  // and reach the computer through the Workspace section strip.
  const panelTabs = splitWorkspace
    ? PANEL_TABS
    : PANEL_TABS.filter((tab) => tab.id !== "try" && tab.id !== "computer");
  const activePanelSection: PanelSection = splitWorkspace ? panelSection : inspectorSection;
  const selectPanelSection = (section: PanelSection) =>
    section === "try" || section === "computer"
      ? openPanelSection(section)
      : openInspector(section);

  const inspectorHeader = (
    <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
      <div
        className="flex min-w-0 max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted/35 p-0.5"
        role="tablist"
        aria-label="Set Up panel"
      >
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
            className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold transition-colors wl-focus-ring-halo ${
              activePanelSection === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex shrink-0 items-center">
        {splitWorkspace ? (
          <button
            type="button"
            onClick={() => setPanelExpanded((expanded) => !expanded)}
            className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
            aria-label="Full width"
            aria-pressed={panelExpanded}
            title={panelExpanded ? "Show the conversation" : "Full width"}
          >
            {panelExpanded ? (
              <Minimize2 className="size-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          onClick={closeInspector}
          className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
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
      aria-label="Set Up panel"
    >
      {inspectorHeader}
      {inspectorBody}
    </aside>
  );

  return (
    <div ref={measureWorkspace} className="flex h-full min-h-0 overflow-hidden bg-background">
      {/* Keep drafts and in-flight conversations intact while mobile details
          are open or the panel is full width. */}
      <div
        className={`${(!splitWorkspace && inspectorOpen) || panelFill ? "hidden" : "block"} min-h-0 min-w-0 flex-1 overflow-hidden`}
      >
        {workroom}
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
          resizeHandleLabel="Resize Set Up panel"
          className={
            panelOpen ? `${panelFill ? "" : "border-l border-border/70 "}bg-card/25` : undefined
          }
        >
          {({ collapsed }) => (collapsed ? null : inspector)}
        </WorkspaceResizablePanel>
      ) : inspectorOpen ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{inspector}</div>
      ) : null}
    </div>
  );
}
