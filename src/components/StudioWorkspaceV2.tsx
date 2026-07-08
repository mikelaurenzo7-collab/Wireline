import { Plus, Sparkles } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";

import { Skeleton } from "../components/atoms";
import { useAgents } from "../contexts/AgentsContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { writeStudioLastAgentId } from "../lib/studio-agent-preference";
import StudioAgentCanvas from "./StudioAgentCanvas";
import StudioAgentWorkspacePanel from "./StudioAgentWorkspacePanel";
import StudioWorkroom, { type StudioWorkroomHandle } from "./StudioWorkroom";
import { useIsDesktop } from "../hooks/useMediaQuery";

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
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background px-4 py-8 text-center sm:px-6 sm:py-12">
      <div className="w-full max-w-xl lg:max-w-2xl">
        <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card sm:mb-6 sm:h-14 sm:w-14">
          <Sparkles size={24} strokeWidth={1.5} className="sm:size-7" />
        </div>

        <h1 className="font-[var(--wireline-font-family-display)] text-3xl font-normal tracking-[-0.025em] sm:text-4xl lg:text-5xl">
          Wire one.
        </h1>
        <p className="mx-auto mt-2 max-w-prose text-base text-muted-foreground sm:mt-3 sm:text-lg">
          Brief it. It learns from every outcome.
        </p>

        <div className="mt-6 space-y-4 sm:mt-8">
          <div>
            <label className="sr-only" htmlFor="studio-brief">
              What should this agent do?
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
              className="w-full min-h-[68px] resize-y rounded-xl border border-border bg-card p-3 text-[14px] leading-6 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 sm:min-h-[80px] sm:p-4 sm:text-[15px]"
              placeholder="Book appointments, answer pricing questions, follow up on leads..."
            />
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to={createHref()}
              style={{
                background: "var(--wireline-color-action-primary-default)",
                color: "var(--wireline-color-text-onAction)",
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-medium shadow-sm transition hover:opacity-95 active:scale-[0.985] sm:px-8 sm:py-3 sm:text-base"
            >
              <Plus size={15} className="sm:size-[17px]" /> Wire it (start setup)
            </Link>
            <span className="self-center text-[10px] text-muted-foreground sm:text-xs">
              or press Enter
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudioWorkspaceV2() {
  const { loading } = useAgents();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
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

  function openWorkspacePanel(hash?: string) {
    if (!active) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("agent", active.id);
      next.set("view", "workspace");
      return next;
    });
    if (hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#${hash}`,
      );
    }
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

  function editCanvasSection(section: string) {
    if (!active) return;
    if (section === "knowledge") {
      navigate(`/knowledge?agent=${encodeURIComponent(active.id)}`);
      return;
    }
    if (section === "identity" || section === "presence") {
      openWorkspacePanel(section === "presence" ? "agent-presence" : undefined);
      return;
    }
    openWorkspacePanel();
  }

  const testVoiceInChat = useCallback(() => {
    workroomRef.current?.focusComposer("Introduce yourself using your new voice.");
  }, []);

  if (loading) return <StudioLoadingState />;

  if (agents.length === 0) return <StudioEmptyState />;

  if (!active) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">Pick an agent above to open its canvas.</p>
        <Link
          to="/studio?create=1"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          <Plus size={15} /> Wire an agent
        </Link>
      </div>
    );
  }

  // Below lg the chat and canvas can't sit side-by-side gracefully — chat
  // alone takes ~560px, and stacking forces a long scroll to reach the
  // canvas. A pane=chat|canvas search-param drives a mobile tab strip so
  // either pane gets the full viewport; on lg+ the strip vanishes and
  // both panes render side-by-side as the prototype intends.
  const mobilePane = (params.get("pane") as "chat" | "canvas" | null) || "canvas";
  function setMobilePane(next: "chat" | "canvas") {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set("pane", next);
        return updated;
      },
      { replace: true },
    );
  }
  const rightPane = workspaceView ? (
    <StudioAgentWorkspacePanel
      key={active.id}
      agentId={active.id}
      agentName={active.name}
      agentRole={active.role}
      isBusinessAgent={active.is_business_agent}
      onTestVoiceInChat={testVoiceInChat}
      className="lg:border-t-0"
    />
  ) : (
    <StudioAgentCanvas
      key={active.id}
      agentId={active.id}
      agentName={active.name}
      isBusinessAgent={active.is_business_agent}
      onEditSection={editCanvasSection}
    />
  );

  const activationNextAction = active ? (
    <div className="border-b border-primary/15 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">First-agent next action:</span> Add training,
      wire a phone channel, start a test call, then review the first outcome.
      <Link
        className="ml-2 font-semibold text-primary"
        to={`/knowledge?agent=${encodeURIComponent(active.id)}`}
      >
        Add training
      </Link>
      <Link className="ml-2 font-semibold text-primary" to="/settings/phone">
        Wire phone
      </Link>
      <Link className="ml-2 font-semibold text-primary" to="/phone?tab=logs">
        Review outcomes
      </Link>
    </div>
  ) : null;

  const workroomNode = (
    <StudioWorkroom
      key={active.id}
      ref={workroomRef}
      agentId={active.id}
      agentName={active.name}
      initialCommand={params.get("command") || undefined}
      commandNonce={params.get("commandNonce") || undefined}
      onBack={workspaceView ? returnToCanvas : openWorkspacePanel}
      backLabel={workspaceView ? "Back to canvas" : "Deep edit"}
      layout="split"
    />
  );

  // ONE branch mounts at a time, gated by useIsDesktop(). Earlier this
  // returned both a `lg:hidden` mobile tree AND a `hidden lg:grid` desktop
  // tree side-by-side and toggled them with Tailwind `hidden` — but `hidden`
  // is display:none, not unmount, so the offscreen branch's children still
  // mounted and ran their effects (doubling /api/agent-config and /api/calls
  // fetches on every viewport, plus aliasing workroomRef to whichever instance
  // committed last). The hook keeps things truthful: only the visible branch
  // exists in the React tree.
  if (isDesktop) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {activationNextAction}
        <div className="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)]">
          <div className="border-r border-border/60">{workroomNode}</div>
          {rightPane}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {activationNextAction}
      <div
        role="tablist"
        aria-label="Studio pane"
        className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-[var(--wireline-color-surface-default)] px-3 py-2"
      >
        {(["chat", "canvas"] as const).map((pane) => {
          const isActive = mobilePane === pane;
          return (
            <button
              key={pane}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setMobilePane(pane)}
              className="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-[8px] px-3 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--wireline-color-action-primary-default)]"
              style={
                isActive
                  ? {
                      background: "var(--wireline-color-action-primary-default)",
                      color: "var(--wireline-color-text-onAction)",
                    }
                  : { color: "var(--wireline-color-text-secondary)" }
              }
            >
              {pane === "chat" ? "Chat" : workspaceView ? "Edit" : "Canvas"}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {mobilePane === "chat" ? workroomNode : rightPane}
      </div>
    </div>
  );
}
