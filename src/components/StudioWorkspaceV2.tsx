import { Plus, Sparkles, Users, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";

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

type InspectorSection = "setup" | "review";
type WorkroomMode = "configure" | "test";

const BOT_LANGUAGE = customerAgentLanguage();
const STUDIO_INSPECTOR_STORAGE_KEY = "wireline:studio-inspector:v1";

function StudioLoadingState() {
  return (
    <main
      className="flex min-h-[55vh] flex-col bg-background px-4 py-8 sm:px-6"
      aria-busy="true"
      aria-label="Loading Studio workspace"
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
  const inspectorTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const splitWorkspace = useMediaQuery("(min-width: 1180px)");
  const active = resolvedAgentId ? agents.find((agent) => agent.id === resolvedAgentId) : undefined;

  const sectionParam = params.get("section");
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
  // Settings are requested explicitly, including links from creation and review.
  // The route owns visibility so a saved desktop collapse cannot hide a deep link.
  const inspectorOpen = sectionParam === "setup" || sectionParam === "review";

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

  const closeInspector = useCallback(() => {
    setParams((current) => clearStudioInspectorSectionParams(current), { replace: true });
    requestAnimationFrame(() => document.getElementById("studio-settings-toggle")?.focus());
  }, [setParams]);

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
    setWorkroomMode("test");
  }, [active?.id, setWorkroomMode, user?.id]);

  useEffect(() => {
    if (!rehearsalFocusRequest) return;
    if (
      rehearsalFocusRequest.agentId !== active?.id ||
      rehearsalFocusRequest.ownerId !== user?.id ||
      workroomMode !== "test"
    ) {
      setRehearsalFocusRequest(null);
      return;
    }
    if (loading || inspectorOpen) return;
    // Focusing is separate from starting: only the account holder's explicit
    // Start click may request a microphone or create a voice session.
    workroomRef.current?.focusVoiceRehearsal();
    setRehearsalFocusRequest(null);
  }, [active?.id, inspectorOpen, loading, rehearsalFocusRequest, user?.id, workroomMode]);

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

  const workroomKey = `${active.id}:${workroomMode}`;
  studioSession.visitBot(active.id);
  let conversationSession = workroomConversations.get(workroomKey);
  if (!conversationSession) {
    conversationSession = {
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
    workroomConversations.set(workroomKey, conversationSession);
  }
  const workroom = (
    <StudioWorkroom
      key={`${user?.id}:${workroomKey}`}
      ref={workroomRef}
      agentId={active.id}
      agentName={active.name}
      markKey={active.mark_key}
      initialCommand={commandParam || undefined}
      commandNonce={commandNonceParam || undefined}
      initialDraft={workroomDrafts.get(workroomKey)}
      onDraftChange={(draft) => workroomDrafts.set(workroomKey, draft)}
      conversationSession={conversationSession}
      layout={splitWorkspace ? "split" : "standalone"}
      mode={workroomMode}
      onModeChange={setWorkroomMode}
      allowOutbound={Boolean(active.phone_number)}
      phoneNumber={active.phone_number}
      voiceVisible={splitWorkspace || !inspectorOpen}
    />
  );

  const inspectorHeader = (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
      <div
        className="flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-1 rounded-lg bg-muted/35 p-0.5"
        role="tablist"
        aria-label="Bot settings"
      >
        {(["setup", "review"] as const).map((id, index) => (
          <button
            key={id}
            ref={(element) => {
              inspectorTabRefs.current[index] = element;
            }}
            id={`studio-inspector-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={inspectorSection === id}
            aria-controls="studio-inspector-panel"
            tabIndex={inspectorSection === id ? 0 : -1}
            onClick={() => openInspector(id)}
            onKeyDown={(event) => {
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowRight"
                      ? 1 - index
                      : null;
              if (nextIndex === null) return;
              event.preventDefault();
              openInspector(nextIndex === 0 ? "setup" : "review");
              inspectorTabRefs.current[nextIndex]?.focus();
            }}
            className={`min-h-[44px] rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors wl-focus-ring-halo ${
              inspectorSection === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {id === "setup" ? "Setup" : "Review"}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={closeInspector}
        className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
        aria-label="Close Bot settings"
        title="Close settings"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </header>
  );

  const inspectorBody = (
    <div
      id="studio-inspector-panel"
      role="tabpanel"
      aria-labelledby={`studio-inspector-tab-${inspectorSection}`}
      className="min-h-0 flex-1 overflow-hidden"
    >
      {inspectorSection === "review" ? reviewPanel : setupPanel}
    </div>
  );

  const inspector = (
    <aside
      id="studio-inspector"
      className="flex h-full min-h-0 w-full flex-col"
      aria-label="Bot settings"
    >
      {inspectorHeader}
      {inspectorBody}
    </aside>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      {/* Keep drafts and in-flight conversations intact while mobile settings are open. */}
      <div
        className={`${!splitWorkspace && inspectorOpen ? "hidden" : "block"} min-h-0 min-w-0 flex-1 overflow-hidden`}
      >
        {workroom}
      </div>
      {splitWorkspace ? (
        <WorkspaceResizablePanel
          storageKey={STUDIO_INSPECTOR_STORAGE_KEY}
          side="right"
          defaultSize={372}
          minSize={312}
          maxSize={520}
          collapsedSize={0}
          collapsed={!inspectorOpen}
          onCollapsedChange={(collapsed) => {
            if (collapsed) closeInspector();
            else if (!inspectorOpen) openInspector(inspectorSection);
          }}
          resizeHandleLabel="Resize Bot inspector"
          className={inspectorOpen ? "border-l border-border/70 bg-card/25" : undefined}
        >
          {({ collapsed }) => (collapsed ? null : inspector)}
        </WorkspaceResizablePanel>
      ) : inspectorOpen ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{inspector}</div>
      ) : null}
    </div>
  );
}
