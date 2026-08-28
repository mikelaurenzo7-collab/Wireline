import {
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  MessageCircle,
  Plus,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button, Skeleton } from "../components/atoms";
import { PanelSkeleton } from "../components/atoms/skeleton-presets";
import { EmptyState } from "../components/ui/EmptyState";
import WorkspaceResizablePanel from "../components/layout/WorkspaceResizablePanel";
import { useAgents } from "../contexts/AgentsContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { writeStudioLastAgentId } from "../lib/studio-agent-preference";
import { customerAgentLanguage } from "../lib/product-copy";
import StudioAgentReviewPanel from "./StudioAgentReviewPanel";
import StudioAgentWorkspacePanel from "./StudioAgentWorkspacePanel";
import StudioWorkroom, { type StudioWorkroomHandle } from "./StudioWorkroom";
import WorkspaceRecovery from "./WorkspaceRecovery";

type WorkspaceSection = "setup" | "test" | "review";

const BOT_LANGUAGE = customerAgentLanguage();
const STUDIO_INSPECTOR_STORAGE_KEY = "wireline:studio-inspector:v1";

const SECTIONS: Array<{
  id: WorkspaceSection;
  label: string;
  icon: typeof Settings2;
}> = [
  { id: "setup", label: "Setup", icon: Settings2 },
  { id: "test", label: "Test", icon: MessageCircle },
  { id: "review", label: "Review", icon: CheckCircle2 },
];

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
    <EmptyState
      fill
      icon={Sparkles}
      title="Build Your Bot"
      description="Describe the work. Configure calls, texts, email, tools, and the workflow around them."
      className="wl-composer-dock"
    >
      <div className="mx-auto mt-2 w-full max-w-xl text-left">
        <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor="studio-brief">
          {BOT_LANGUAGE.setupPrompt}
        </label>
        <textarea
          id="studio-brief"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          className="min-h-[92px] w-full resize-none rounded-xl border border-border bg-card p-4 text-base leading-6 placeholder:text-[var(--wireline-color-text-tertiary)] focus-visible:border-[var(--wireline-color-focus-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-focus-default)]/40 sm:resize-y md:text-[15px]"
          placeholder="Answer calls, qualify requests, book appointments, text confirmations, and email follow-ups…"
        />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to={createHref()}>
              <Plus size={15} aria-hidden="true" />
              Create Bot
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            Choose a role starter or make it entirely custom.
          </span>
        </div>
      </div>
    </EmptyState>
  );
}

function normalizeSection(value: string | null): WorkspaceSection {
  if (value === "test") return "test";
  if (value === "review" || value === "overview") return "review";
  return "setup";
}

export default function StudioWorkspaceV2() {
  const { loading, degraded, refresh } = useAgents();
  const { requestedId, resolvedId: resolvedAgentId, agents } = useStudioActiveAgentId();
  const [params, setParams] = useSearchParams();
  const workroomRef = useRef<StudioWorkroomHandle>(null);
  const splitWorkspace = useMediaQuery("(min-width: 1180px)");
  const active = resolvedAgentId ? agents.find((agent) => agent.id === resolvedAgentId) : undefined;
  const section = normalizeSection(params.get("section"));
  const inspectorSection = section === "review" ? "review" : "setup";
  const legacyMode = params.get("mode");
  const legacyView = params.get("view");
  const hasCommand = Boolean(params.get("command") || params.get("commandNonce"));

  useEffect(() => {
    if (legacyMode !== "workroom" && legacyView !== "workspace") return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("mode");
        next.delete("view");
        next.set("section", legacyMode === "workroom" ? "test" : "setup");
        return next;
      },
      { replace: true },
    );
  }, [legacyMode, legacyView, setParams]);

  useEffect(() => {
    if (loading || agents.length === 0 || !resolvedAgentId || resolvedAgentId === requestedId)
      return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("agent", resolvedAgentId);
        if (!requestedId) {
          next.delete("command");
          next.delete("commandNonce");
        }
        return next;
      },
      { replace: true },
    );
  }, [agents, loading, requestedId, resolvedAgentId, setParams]);

  useEffect(() => {
    if (!hasCommand || section === "test") return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("section", "test");
        return next;
      },
      { replace: true },
    );
  }, [hasCommand, section, setParams]);

  useEffect(() => {
    if (active?.id) writeStudioLastAgentId(active.id);
  }, [active?.id]);

  const setSection = useCallback(
    (nextSection: WorkspaceSection, replace = false) => {
      if (!active) return;
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("agent", active.id);
          next.set("section", nextSection);
          next.delete("view");
          next.delete("mode");
          if (nextSection !== "test") {
            next.delete("command");
            next.delete("commandNonce");
          }
          return next;
        },
        { replace },
      );
    },
    [active, setParams],
  );

  const startCustomerTest = useCallback(() => {
    setSection("test");
    window.setTimeout(() => {
      workroomRef.current?.focusComposer(
        "Hi, can you explain what you can do and help me take the next step?",
      );
    }, 120);
  }, [setSection]);

  if (loading) return <StudioLoadingState />;
  if (agents.length === 0 && degraded) return <WorkspaceRecovery onRetry={refresh} />;
  if (agents.length === 0) return <StudioEmptyState />;

  if (!active) {
    return (
      <EmptyState
        fill
        icon={Users}
        title="Choose a Bot"
        description="Select one, or create a new role in this workspace."
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

  const studioTabId = (id: WorkspaceSection) => `studio-tab-${id}`;
  const studioPanelId = (id: WorkspaceSection) => `studio-panel-${id}`;
  const handleSectionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = SECTIONS.findIndex((item) => item.id === section);
    const lastIndex = SECTIONS.length - 1;
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    } else if (event.key === "ArrowLeft") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }
    event.preventDefault();
    const next = SECTIONS[nextIndex].id;
    setSection(next);
    window.requestAnimationFrame(() => document.getElementById(studioTabId(next))?.focus());
  };

  const sectionTabs = (
    <nav
      className="shrink-0 border-b border-border/70 bg-card/45 px-3 py-2 sm:px-5"
      aria-label="Bot workspace"
    >
      <div
        className="mx-auto grid w-full max-w-md grid-cols-3 gap-1 rounded-xl bg-muted/35 p-1"
        role="tablist"
        aria-label={`${BOT_LANGUAGE.singular} workspace`}
        onKeyDown={handleSectionKeyDown}
      >
        {SECTIONS.map((item) => {
          const selected = section === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={studioTabId(item.id)}
              aria-selected={selected}
              aria-controls={
                splitWorkspace && item.id === "test"
                  ? "studio-split-workspace"
                  : studioPanelId(item.id)
              }
              tabIndex={selected ? 0 : -1}
              onClick={() => setSection(item.id)}
              className={`min-w-0 rounded-lg px-2.5 py-2 text-center transition-colors wl-focus-ring-halo ${
                selected
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Icon
                  className={`size-3.5 shrink-0 ${selected ? "text-primary" : ""}`}
                  aria-hidden="true"
                />
                <span className="truncate text-xs font-semibold sm:text-sm">{item.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  const setupPanel = (
    <StudioAgentWorkspacePanel
      key={active.id}
      agentId={active.id}
      agentName={active.name}
      isBusinessAgent={Boolean(active.is_business_agent)}
      onTestVoiceInChat={startCustomerTest}
      className="h-full border-t-0"
      compact={splitWorkspace && section === "test"}
    />
  );

  const reviewPanel = (
    <StudioAgentReviewPanel
      key={active.id}
      agentId={active.id}
      agentName={active.name}
      agentRole={active.role}
      phoneNumber={active.phone_number}
      onEdit={() => setSection("setup")}
      onTest={startCustomerTest}
      className="h-full"
      compact={splitWorkspace && section === "test"}
    />
  );

  const workroom = (
    <StudioWorkroom
      key={active.id}
      ref={workroomRef}
      agentId={active.id}
      agentName={active.name}
      initialCommand={params.get("command") || undefined}
      commandNonce={params.get("commandNonce") || undefined}
      onBack={() => setSection("setup")}
      backLabel="Back to setup"
      layout={splitWorkspace && section === "test" ? "split" : "standalone"}
      mode={section === "test" ? "test" : "configure"}
      allowOutbound={Boolean(active.phone_number)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {sectionTabs}

      {splitWorkspace && section === "test" ? (
        <div
          id="studio-split-workspace"
          role="tabpanel"
          aria-labelledby={studioTabId(section)}
          className="flex min-h-0 flex-1 overflow-hidden"
        >
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
                    className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {inspectorSection === "review" ? "Review" : "Setup"}
                  </span>
                </button>
              ) : (
                <aside className="flex h-full min-h-0 w-full flex-col" aria-label="Bot inspector">
                  <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-3">
                    <div className="flex items-center gap-1 rounded-lg bg-muted/35 p-0.5">
                      {(["setup", "review"] as const).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSection(id)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
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
                      onClick={toggleCollapsed}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
                      aria-label="Collapse Bot inspector"
                      title="Collapse inspector"
                    >
                      <ChevronsRight className="size-4" aria-hidden="true" />
                    </button>
                  </header>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {inspectorSection === "review" ? reviewPanel : setupPanel}
                  </div>
                </aside>
              )
            }
          </WorkspaceResizablePanel>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          {section === "setup" ? (
            <div
              role="tabpanel"
              id={studioPanelId("setup")}
              aria-labelledby={studioTabId("setup")}
              className="h-full min-h-0"
            >
              {setupPanel}
            </div>
          ) : null}
          {section === "test" ? (
            <div
              role="tabpanel"
              id={studioPanelId("test")}
              aria-labelledby={studioTabId("test")}
              className="h-full min-h-0"
            >
              {workroom}
            </div>
          ) : null}
          {section === "review" ? (
            <div
              role="tabpanel"
              id={studioPanelId("review")}
              aria-labelledby={studioTabId("review")}
              className="h-full min-h-0"
            >
              {reviewPanel}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
