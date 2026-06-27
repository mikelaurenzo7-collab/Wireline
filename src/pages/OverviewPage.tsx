import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Cable,
  CheckCircle2,
  FileText,
  Inbox,
  PlayCircle,
  Plus,
  Send,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import PostureBadge from "../components/ui/PostureBadge";
import { useAgents } from "../contexts/AgentsContext";
import { formatAgentRoleLabel, rosterSummary, WORKSPACE_VOICE } from "../lib/product-copy";

const WORKSPACE_MOVES = [
  { href: "/inbox", icon: Inbox, title: "Inbox", label: "Approve. Follow up." },
  { href: "/training", icon: FileText, title: "Training", label: "Facts. Rules. Voice." },
  { href: "/actions", icon: Cable, title: "Wire", label: "Connect tools." },
  {
    href: "/settings/customization",
    icon: SlidersHorizontal,
    title: "Tune",
    label: "One voice. Everywhere.",
  },
] as const;

function RosterLoading() {
  return (
    <div
      className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-busy="true"
      aria-label="Loading roster"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="studio-card min-h-[168px] p-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton shape="circle" className="size-9" />
            <Skeleton shape="text" className="h-3 w-12" />
          </div>
          <Skeleton shape="text" className="mt-4 h-5 w-3/4" />
          <Skeleton shape="text" className="mt-1.5 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const { agents, loading, degraded } = useAgents();
  const [command, setCommand] = useState("");
  const personalCount = agents.filter((agent) => !agent.is_business_agent).length;
  const businessCount = agents.filter((agent) => agent.is_business_agent).length;
  const hasAgents = !loading && agents.length > 0;
  const primaryAgent = agents[0];
  const commandText = command.trim();

  function openWorkroom() {
    if (!primaryAgent) return;
    const next = new URLSearchParams({ agent: primaryAgent.id, mode: "workroom" });
    if (commandText) {
      next.set("command", commandText);
      next.set("commandNonce", String(Date.now()));
    }
    navigate(`/studio?${next.toString()}`);
  }

  return (
    <WorkspaceShell
      title="Home"
      eyebrow="Workspace"
      action={
        <Button asChild size="sm">
          <Link to="/studio?create=1">
            <Plus aria-hidden="true" size={16} />
            New agent
          </Link>
        </Button>
      }
      contentClassName="pt-0.5 pb-8"
    >
      <div className="wl-overview flex w-full max-w-none flex-col pb-8">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.85fr)]">
          <div className="studio-card wl-composer-hero grid gap-4 p-4 sm:p-5 lg:p-6">
            <div className="wl-centered-header">
              <p className="studio-kicker">{`Create -> Train -> Run`}</p>
              <h2 className="mt-1 font-[var(--wireline-font-family-display)] text-[clamp(1.45rem,1.2rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em]">
                {hasAgents ? WORKSPACE_VOICE.runHeadline : WORKSPACE_VOICE.forgeHeadline}
              </h2>
            </div>

            {hasAgents ? (
              <div className="wl-composer-dock">
                <label className="sr-only" htmlFor="home-command">
                  Direct your first agent
                </label>
                <textarea
                  id="home-command"
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  rows={2}
                  placeholder={WORKSPACE_VOICE.directAgent(primaryAgent?.name)}
                  className="wl-composer-dock__input"
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      openWorkroom();
                    }
                  }}
                />
                <div className="wl-composer-dock__toolbar">
                  <div className="flex flex-wrap gap-1.5">
                    {WORKSPACE_VOICE.commandPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setCommand(prompt)}
                        className="wl-chip-suggestion"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <Button type="button" className="justify-center sm:w-auto" onClick={openWorkroom}>
                    {commandText ? "Send" : "Open Studio"}
                    {commandText ? (
                      <Send aria-hidden="true" size={15} />
                    ) : (
                      <ArrowRight aria-hidden="true" size={15} />
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-center text-sm text-muted-foreground">
                  {WORKSPACE_VOICE.emptyCue}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button asChild>
                    <Link to="/studio?create=1">
                      Create agent
                      <ArrowRight aria-hidden="true" size={15} />
                    </Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link to="/studio?create=1&posture=business">Business</Link>
                  </Button>
                </div>
              </>
            )}
          </div>

          <aside className="studio-card wl-status-card flex flex-col justify-between p-6 sm:p-7">
            <div>
              <p className="studio-kicker">Status</p>
              <div className="mt-4 flex items-baseline justify-center gap-2">
                <span className="wl-metric-value text-[2rem] font-semibold tabular-nums tracking-[-0.02em]">
                  {loading ? "--" : agents.length}
                </span>
                <span className="text-sm text-muted-foreground">
                  {agents.length === 1 ? "agent" : "agents"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {degraded
                  ? "Links recovering."
                  : hasAgents
                    ? rosterSummary(personalCount, businessCount)
                    : "Start here."}
              </p>
            </div>
            <div className="mt-6 flex justify-center border-t border-border pt-4">
              {degraded ? (
                <Badge variant="warning" className="text-center">
                  Check links
                </Badge>
              ) : (
                <Badge variant="success" className="inline-flex items-center gap-1">
                  <CheckCircle2 aria-hidden="true" className="size-3.5" />
                  {hasAgents ? "Live" : "Ready"}
                </Badge>
              )}
            </div>
          </aside>
        </section>

        {degraded ? (
          <StatusNotice tone="warning" title="Status partial.">
            Connections recovering.
          </StatusNotice>
        ) : null}

        <section className="wl-centered-header">
          <div className="mb-4 flex flex-wrap items-end justify-center gap-3 text-center">
            <div>
              <p className="studio-kicker">Next</p>
              <h2 className="wl-section-title mt-1">Work here.</h2>
            </div>
            {hasAgents ? (
              <Button asChild variant="link" className="h-auto px-0 text-sm">
                <Link to="/agents">
                  View agents <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {WORKSPACE_MOVES.map(({ href, icon: Icon, title, label }) => (
              <Link
                key={href}
                to={href}
                className="wl-overview-shortcut studio-card wl-card-action group flex flex-col p-5 text-center transition-colors hover:border-primary/20"
              >
                <Icon aria-hidden="true" className="mx-auto size-5 text-primary" />
                <div className="mt-auto flex flex-col items-center gap-3">
                  <div>
                    <h3 className="wl-card-title text-center tracking-[-0.01em]">{title}</h3>
                    <p className="mt-1 text-center text-sm text-muted-foreground">{label}</p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6 wl-centered-header">
          <div className="flex flex-col items-center gap-3 border-b border-border pb-4 text-center">
            <div>
              <p className="studio-kicker">Fleet</p>
              <h2 className="wl-section-title mt-1">{hasAgents ? "Ready." : "Forge one."}</h2>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to={hasAgents ? "/agents" : "/studio?create=1"}>
                {hasAgents ? "Manage fleet" : "Create agent"}
              </Link>
            </Button>
          </div>

          {loading ? (
            <RosterLoading />
          ) : hasAgents ? (
            <div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {agents.slice(0, 8).map((agent) => {
                const enc = encodeURIComponent(agent.id);
                return (
                  <div
                    key={agent.id}
                    className="wl-overview-roster-card studio-card wl-card-action group flex flex-col p-4 transition-colors hover:border-primary/20"
                  >
                    <Link to={`/studio?agent=${enc}`} className="flex flex-col">
                      <div className="flex items-center justify-between gap-3">
                        <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                          <Bot aria-hidden="true" size={18} />
                        </span>
                        <div className="flex flex-col items-end gap-1">
                          <span className="wl-overline text-[var(--wireline-typography-overline-size)]">
                            {agent.channel || "voice"}
                          </span>
                          <PostureBadge isBusiness={Boolean(agent.is_business_agent)} compact />
                        </div>
                      </div>
                      <h3 className="mt-2 wl-card-title text-center tracking-[-0.01em]">
                        {agent.name}
                      </h3>
                      <p className="mt-0.5 text-center text-sm text-muted-foreground">
                        {formatAgentRoleLabel(agent.role)}
                      </p>
                    </Link>
                    <div className="mt-auto flex justify-center border-t border-border/60 pt-3">
                      <Link
                        to={`/studio?agent=${enc}&mode=workroom`}
                        className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary"
                        aria-label={`Open ${agent.name} in workroom`}
                      >
                        Workroom <PlayCircle size={12} aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[152px] flex-col items-center justify-center gap-3 py-6 text-center">
              <Sparkles aria-hidden="true" className="size-6 text-primary" />
              <p className="text-sm text-muted-foreground">{WORKSPACE_VOICE.emptyCue}</p>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
