import { LayoutDashboard, MessageCircle, Plus, Settings2, Sparkles } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Skeleton } from "../components/atoms";
import { PanelSkeleton } from "../components/atoms/skeleton-presets";
import { EmptyState } from "../components/ui/EmptyState";
import { useAgents } from "../contexts/AgentsContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { writeStudioLastAgentId } from "../lib/studio-agent-preference";
import StudioAgentCanvas from "./StudioAgentCanvas";
import StudioAgentWorkspacePanel from "./StudioAgentWorkspacePanel";
import StudioWorkroom, { type StudioWorkroomHandle } from "./StudioWorkroom";

type WorkspaceSection = "setup" | "test" | "overview";

const SECTIONS: Array<{
  id: WorkspaceSection;
  label: string;
  description: string;
  icon: typeof Settings2;
}> = [
  { id: "setup", label: "Set up", description: "Basics, voice, and channels", icon: Settings2 },
  { id: "test", label: "Test", description: "Try real conversations", icon: MessageCircle },
  { id: "overview", label: "Overview", description: "Review the full configuration", icon: LayoutDashboard },
];

function StudioLoadingState() {
  return (
    <main
      className="flex min-h-[55vh] flex-col bg-background px-4 py-8 sm:px-6"
      aria-busy="true"
      aria-label="Loading employee workspace"
    >
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton shape="text" className="h-3 w-20" />
        <Skeleton shape="text" className="h-8 w-80 max-w-full" />
        <Skeleton shape="surface" className="h-[min(280px,45dvh)] w-full rounded-[var(--radius-xl)]" />
        <PanelSkeleton rows={2} className="pt-1" />
      </div>
    </main>
  );
}

function StudioEmptyState() {
  const navigate = useNavigate();
  const [brief, setBrief] = useState("");

  function createHref() {
    const params = new URLSearchParams({ create: "1" });
    const trimmed = brief.trim();
    if (trimmed) params.set("brief", trimmed);
    return `/studio?${params.toString()}`;
  }

  function startCreate() {
    navigate(createHref());
  }

  return (
    <EmptyState
      fill
      icon={Sparkles}
      title="Create your first AI employee"
      description="Describe the work once. Wireline guides you through setup, testing, and launch."
      className="wl-composer-dock"
    >
      <div className="mx-auto mt-2 w-full max-w-xl text-left">
        <label className="sr-only" htmlFor="studio-brief">
          What should this employee handle?
        </label>
        <textarea
          id="studio-brief"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              startCreate();
            }
          }}
          className="min-h-[84px] w-full resize-y rounded-xl border border-border bg-card p-4 text-[15px] leading-6 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          placeholder="Answer calls, book appointments, explain pricing, and follow up by text and email…"
        />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to={createHref()}>
              <Plus size={15} aria-hidden="true" />
              Start guided setup
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">or press Enter</span>
        </div>
      </div>
    </EmptyState>
  );
}

function normalizeSection(value: string | null): WorkspaceSection {
  return value === "test" || value === "overview" ? value : "setup";
}

export default function StudioWorkspaceV2() {
  const { loading } = useAgents();
  const navigate = useNavigate();
  const { requestedId, resolvedId: resolvedAgentId, agents } = useStudioActiveAgentId();
  const [params, setParams] = useSearchParams();
  const workroomRef = useRef<StudioWorkroomHandle>(null);
  const active = resolvedAgentId ? agents.find((agent) => agent.id === resolvedAgentId) : undefined;
  const section = normalizeSection(params.get("section"));
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
    if (loading || agents.length === 0 || !resolvedAgentId || resolvedAgentId === requestedId) return;
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

  function editOverviewSection(target: string) {
    if (!active) return;
    if (target === "knowledge") {
      navigate(`/knowledge?agent=${encodeURIComponent(active.id)}`);
      return;
    }
    setSection("setup");
    if (target === "presence") {
      window.setTimeout(() => {
        const advanced = document.getElementById("advanced-employee-options");
        advanced?.setAttribute("open", "");
        advanced?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }

  const testVoiceInChat = useCallback(() => {
    setSection("test");
    window.setTimeout(() => {
      workroomRef.current?.focusComposer("Introduce yourself and handle a sample customer call.");
    }, 120);
  }, [setSection]);

  if (loading) return <StudioLoadingState />;
  if (agents.length === 0) return <StudioEmptyState />;

  if (!active) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">Choose an AI employee from the sidebar.</p>
        <Link
          to="/studio?create=1"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          <Plus size={15} /> New AI employee
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border bg-card/70 px-3 py-3 sm:px-5">
        <div className="mx-auto flex w-full max-w-4xl gap-2" role="tablist" aria-label="Employee workspace">
          {SECTIONS.map((item) => {
            const selected = section === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSection(item.id)}
                className={`flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border px-2 text-left transition-colors sm:justify-start sm:px-4 ${
                  selected
                    ? "border-primary/35 bg-primary/5 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className={`size-4 shrink-0 ${selected ? "text-primary" : ""}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold sm:text-sm">{item.label}</span>
                  <span className="hidden truncate text-[11px] text-muted-foreground md:block">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {section === "setup" ? (
          <StudioAgentWorkspacePanel
            key={active.id}
            agentId={active.id}
            agentName={active.name}
            agentRole={active.role}
            isBusinessAgent={active.is_business_agent}
            onTestVoiceInChat={testVoiceInChat}
            className="h-full border-t-0"
          />
        ) : null}
        {section === "test" ? (
          <StudioWorkroom
            key={active.id}
            ref={workroomRef}
            agentId={active.id}
            agentName={active.name}
            initialCommand={params.get("command") || undefined}
            commandNonce={params.get("commandNonce") || undefined}
            onBack={() => setSection("setup")}
            backLabel="Setup"
            layout="split"
          />
        ) : null}
        {section === "overview" ? (
          <StudioAgentCanvas
            key={active.id}
            agentId={active.id}
            agentName={active.name}
            isBusinessAgent={active.is_business_agent}
            onEditSection={editOverviewSection}
            className="h-full"
          />
        ) : null}
      </div>
    </div>
  );
}
