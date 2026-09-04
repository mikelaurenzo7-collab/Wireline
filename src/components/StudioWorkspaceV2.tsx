import {
  ChevronsLeft,
  ChevronsRight,
  MessageCircle,
  Plus,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Skeleton } from "../components/atoms";
import { PanelSkeleton } from "../components/atoms/skeleton-presets";
import { EmptyState } from "../components/ui/EmptyState";
import { BotBoundLockup } from "./brand/BotBoundBrand";
import WorkspaceResizablePanel from "../components/layout/WorkspaceResizablePanel";
import { useAgents } from "../contexts/AgentsContext";
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
        title="Build Your Bot"
        description="Describe the role and outcome."
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
  const { requestedId, resolvedId: resolvedAgentId, agents } = useStudioActiveAgentId();
  const [params, setParams] = useSearchParams();
  const workroomRef = useRef<StudioWorkroomHandle>(null);
  const splitWorkspace = useMediaQuery("(min-width: 1180px)");
  const active = resolvedAgentId ? agents.find((agent) => agent.id === resolvedAgentId) : undefined;

  const sectionParam = params.get("section");
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
  // On narrow viewports the inspector replaces the workroom rather than sitting
  // beside it. On wide screens the inspector is always its own resizable rail.
  // A deep link that names a config section (for example, ?section=setup after
  // creating a Bot) opens the inspector so the intended surface is visible.
  const [narrowInspectorOpen, setNarrowInspectorOpen] = useState(
    () => sectionParam === "setup" || sectionParam === "review",
  );

  useEffect(() => {
    const inspectorRequested = sectionParam === "setup" || sectionParam === "review";
    if (inspectorRequested) {
      setInspectorSection(readStudioInspectorSection(sectionParam));
    }
    setNarrowInspectorOpen(inspectorRequested);
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
    if (loading || agents.length === 0 || !resolvedAgentId || resolvedAgentId === requestedId)
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
  }, [agents, loading, requestedId, resolvedAgentId, setParams]);

  useEffect(() => {
    if (active?.id) writeStudioLastAgentId(active.id);
  }, [active?.id]);

  const openInspector = useCallback(
    (section: InspectorSection) => {
      setInspectorSection(section);
      setNarrowInspectorOpen(true);
      setParams((current) => setStudioInspectorSectionParams(current, section), {
        replace: true,
      });
    },
    [setParams],
  );

  const closeInspector = useCallback(() => {
    setNarrowInspectorOpen(false);
    setParams((current) => clearStudioInspectorSectionParams(current), { replace: true });
  }, [setParams]);

  const setWorkroomMode = useCallback(
    (mode: WorkroomMode) => {
      setWorkroomModeState(mode);
      setNarrowInspectorOpen(false);
      setParams((current) => setStudioWorkroomModeParams(current, mode), { replace: true });
    },
    [setParams],
  );

  const startCustomerTest = useCallback(() => {
    setWorkroomMode("test");
    window.setTimeout(() => {
      workroomRef.current?.focusComposer(
        "Hi, can you explain what you can do and help me take the next step?",
      );
    }, 120);
  }, [setWorkroomMode]);

  if (loading) return <StudioLoadingState />;
  if (agents.length === 0 && degraded) return <WorkspaceRecovery onRetry={refresh} />;
  if (agents.length === 0) return <StudioEmptyState />;

  if (!active) {
    return (
      <EmptyState
        fill
        icon={Users}
        title="Choose a Bot"
        description="Select or create one."
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
      onTestVoiceInChat={startCustomerTest}
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
      onTest={startCustomerTest}
      className="h-full"
      compact={splitWorkspace}
    />
  );

  const workroom = (
    <StudioWorkroom
      key={active.id}
      ref={workroomRef}
      agentId={active.id}
      agentName={active.name}
      markKey={active.mark_key}
      initialCommand={commandParam || undefined}
      commandNonce={commandNonceParam || undefined}
      layout={splitWorkspace ? "split" : "standalone"}
      mode={workroomMode}
      onModeChange={setWorkroomMode}
      allowOutbound={Boolean(active.phone_number)}
    />
  );

  const inspectorHeader = (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-3">
      <div
        className="flex items-center gap-1 rounded-lg bg-muted/35 p-0.5"
        role="tablist"
        aria-label="Bot inspector"
      >
        {(["setup", "review"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={inspectorSection === id}
            onClick={() => openInspector(id)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors wl-focus-ring-halo ${
              inspectorSection === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {id === "setup" ? "Setup" : "Review"}
          </button>
        ))}
      </div>
      {splitWorkspace ? null : (
        <button
          type="button"
          onClick={closeInspector}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
          aria-label="Back to workroom"
          title="Back to workroom"
        >
          <ChevronsRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </header>
  );

  const inspectorBody = (
    <div className="min-h-0 flex-1 overflow-hidden">
      {inspectorSection === "review" ? reviewPanel : setupPanel}
    </div>
  );

  if (splitWorkspace) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1">{workroom}</div>

          <WorkspaceResizablePanel
            storageKey={STUDIO_INSPECTOR_STORAGE_KEY}
            side="right"
            defaultSize={372}
            minSize={312}
            maxSize={520}
            collapsedSize={44}
            resizeHandleLabel="Resize Bot inspector"
            className="border-l border-border/70 bg-card/25"
          >
            {({ collapsed, toggleCollapsed }) =>
              collapsed ? (
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="flex h-full w-full flex-col items-center gap-3 py-3 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground wl-focus-ring-halo"
                  aria-label="Open Bot inspector"
                  title="Open Bot inspector"
                >
                  <ChevronsLeft className="size-4 shrink-0" aria-hidden="true" />
                  <span
                    className="text-xs font-semibold uppercase tracking-[0.14em]"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {inspectorSection === "review" ? "Review" : "Setup"}
                  </span>
                </button>
              ) : (
                <aside className="flex h-full min-h-0 w-full flex-col" aria-label="Bot inspector">
                  {inspectorHeader}
                  {inspectorBody}
                </aside>
              )
            }
          </WorkspaceResizablePanel>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {narrowInspectorOpen ? (
        <>
          {inspectorHeader}
          {inspectorBody}
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">{workroom}</div>
      )}
      {!narrowInspectorOpen ? (
        <nav
          className="shrink-0 border-t border-border/70 bg-card/45 px-3 py-2 sm:px-5"
          aria-label="Bot workspace"
        >
          <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-1 rounded-xl bg-muted/35 p-1">
            <button
              type="button"
              onClick={closeInspector}
              className="rounded-lg px-2.5 py-2 text-center text-xs font-semibold text-foreground transition-colors bg-card shadow-sm sm:text-sm"
              aria-current="page"
            >
              <span className="flex items-center justify-center gap-1.5">
                <MessageCircle className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>Workroom</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => openInspector(inspectorSection)}
              className="rounded-lg px-2.5 py-2 text-center text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground sm:text-sm wl-focus-ring-halo"
            >
              <span className="flex items-center justify-center gap-1.5">
                <Settings2 className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{inspectorSection === "review" ? "Review" : "Setup"}</span>
              </span>
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
