import { Plus, Sparkles } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";

import { Skeleton } from "../components/atoms";
import { useAgents } from "../contexts/AgentsContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { writeStudioLastAgentId } from "../lib/studio-agent-preference";
import StudioAgentWorkspacePanel from "./StudioAgentWorkspacePanel";
import StudioWorkroom, { type StudioWorkroomHandle } from "./StudioWorkroom";

function StudioLoadingState() {
  return (
    <main
      className="grid min-h-[55vh] place-items-center bg-background px-4 sm:px-6 safe-area-insets"
      aria-busy="true"
      aria-label="Loading Studio"
    >
      <div className="w-full max-w-5xl space-y-4">
        <Skeleton shape="text" className="h-3 w-20" />
        <Skeleton shape="text" className="h-8 w-80 max-w-full" />
        <Skeleton shape="text" className="h-3 w-64" />
        <div className="pt-3">
          <Skeleton
            shape="surface"
            className="h-[min(280px,45dvh)] w-full rounded-[var(--radius-xl)]"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Skeleton shape="text" className="h-8 w-28 rounded-full" />
          <Skeleton shape="text" className="h-8 w-28 rounded-full" />
        </div>
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
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background px-4 py-8 sm:px-6 sm:py-12 text-center">
      <div className="max-w-xl lg:max-w-2xl w-full">
        <div className="mx-auto mb-5 sm:mb-6 inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-border bg-card">
          <Sparkles size={24} strokeWidth={1.5} className="sm:size-7" />
        </div>

        <h1 className="font-[var(--wireline-font-family-display)] text-3xl font-normal tracking-[-0.025em] sm:text-4xl lg:text-5xl">
          Wire one.
        </h1>
        <p className="mt-2 sm:mt-3 text-base sm:text-lg text-muted-foreground max-w-prose mx-auto">
          Start with a brief. Tell your agent what to do — calls, texts, follow-ups — and it learns
          from every outcome.
        </p>

        <div className="mt-6 sm:mt-8 space-y-4">
          <div>
            <label className="sr-only" htmlFor="initial-brief">
              What should this agent do?
            </label>
            <textarea
              id="initial-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  startCreate();
                }
              }}
              className="w-full min-h-[68px] sm:min-h-[80px] resize-y rounded-xl border border-border bg-card p-3 sm:p-4 text-[14px] sm:text-[15px] leading-6 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Book appointments, answer pricing questions, follow up on leads..."
            />
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to={createHref()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base font-medium text-primary-foreground shadow-sm transition active:scale-[0.985]"
            >
              <Plus size={15} className="sm:size-[17px]" /> Wire it (start setup)
            </Link>
            <span className="text-[10px] sm:text-xs text-muted-foreground self-center">
              or press Enter in the box above
            </span>
          </div>
        </div>

        <p className="mt-5 sm:mt-6 text-[10px] text-muted-foreground/70">
          After creation, open the agent’s workspace for full voice previews (xAI + ElevenLabs),
          personality, knowledge, tools, and more.
        </p>
      </div>
    </div>
  );
}

export default function StudioWorkspaceV2() {
  const { loading } = useAgents();
  const { requestedId, resolvedId: resolvedAgentId, agents } = useStudioActiveAgentId();
  const [params, setParams] = useSearchParams();
  const workroomRef = useRef<StudioWorkroomHandle>(null);
  const legacyMode = params.get("mode");
  const workspaceView = params.get("view") === "workspace";
  const active = resolvedAgentId ? agents.find((agent) => agent.id === resolvedAgentId) : undefined;

  useEffect(() => {
    if (legacyMode !== "workroom") return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("mode");
        return next;
      },
      { replace: true },
    );
  }, [legacyMode, setParams]);

  useEffect(() => {
    if (loading || agents.length === 0 || !resolvedAgentId || resolvedAgentId === requestedId) {
      return;
    }
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
    if (!params.get("command") && !params.get("commandNonce")) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("command");
        next.delete("commandNonce");
        return next;
      },
      { replace: true },
    );
  }, [active?.id, params, setParams]);

  useEffect(() => {
    if (active?.id) writeStudioLastAgentId(active.id);
  }, [active?.id]);

  function openWorkspacePanel() {
    if (!active) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("agent", active.id);
      next.set("view", "workspace");
      return next;
    });
  }

  function returnToCanvas() {
    if (!active) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("agent", active.id);
      next.delete("view");
      return next;
    });
  }

  const testVoiceInChat = useCallback(() => {
    workroomRef.current?.focusComposer("Introduce yourself using your new voice.");
  }, []);

  if (loading) return <StudioLoadingState />;

  if (agents.length === 0) return <StudioEmptyState />;

  if (!active) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Pick an agent from the bar above to open the canvas composer.
        </p>
        <Link
          to="/studio?create=1"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          <Plus size={15} /> Wire an agent
        </Link>
      </div>
    );
  }

  return (
    <div
      className={
        workspaceView
          ? "grid min-h-full bg-background lg:h-full lg:min-h-0 lg:grid-cols-[minmax(380px,0.82fr)_minmax(520px,1.18fr)]"
          : "flex h-full min-h-0 flex-col bg-background"
      }
    >
      <div
        className={
          workspaceView
            ? "min-h-[560px] border-b border-border/60 lg:min-h-0 lg:border-b-0 lg:border-r"
            : "min-h-0 flex-1"
        }
      >
        <StudioWorkroom
          key={active.id}
          ref={workroomRef}
          agentId={active.id}
          agentName={active.name}
          initialCommand={params.get("command") || undefined}
          commandNonce={params.get("commandNonce") || undefined}
          onBack={workspaceView ? returnToCanvas : openWorkspacePanel}
          backLabel={workspaceView ? "Back to chat" : "Agent workspace"}
          layout={workspaceView ? "split" : "canvas"}
        />
      </div>

      {workspaceView ? (
        <StudioAgentWorkspacePanel
          key={active.id}
          agentId={active.id}
          agentName={active.name}
          onTestVoiceInChat={testVoiceInChat}
          className="lg:border-t-0"
        />
      ) : null}
    </div>
  );
}
