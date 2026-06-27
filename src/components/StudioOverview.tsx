import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  CircleDot,
  MessageSquareText,
  Phone,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";

import { Button } from "../components/atoms";
import type { WorkspaceAgentSummary } from "../contexts/AgentsContext";

type StudioOverviewProps = {
  active: WorkspaceAgentSummary;
  agents: WorkspaceAgentSummary[];
  degraded: boolean;
  onSelect: (agentId: string) => void;
  onOpen: (agentId: string, command?: string) => void;
  onCreate: () => void;
};

const WORK_PROMPTS = ["Review calls", "Draft reply", "Prep handoff", "Plan follow-up"] as const;

function roleLabel(agent: WorkspaceAgentSummary) {
  if (agent.role) return agent.role.replace(/_/g, " ");
  return agent.is_business_agent ? "Business" : "Personal";
}

function channelLabel(agent: WorkspaceAgentSummary) {
  if (agent.channel === "voice") return "Voice";
  if (agent.channel === "email") return "Email";
  if (agent.channel === "omnichannel") return "Omni";
  return "Agent";
}

function agentDescription(agent: WorkspaceAgentSummary) {
  return `${roleLabel(agent)} - ${channelLabel(agent)}`;
}

export default function StudioOverview({
  active,
  agents,
  degraded,
  onSelect,
  onOpen,
  onCreate,
}: StudioOverviewProps) {
  const [brief, setBrief] = useState("");
  const activeDescription = agentDescription(active);
  const trimmedBrief = brief.trim();

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-background px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 sm:gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <div>
            <p className="studio-kicker">Studio</p>
            <h1 className="mt-1 truncate font-[var(--wireline-font-family-display)] text-[clamp(1.9rem,7vw,2.75rem)] font-semibold leading-none tracking-[-0.05em] text-foreground">
              {active.name}
            </h1>
            <p className="mt-1 text-xs font-mono uppercase tracking-[0.1em] text-muted-foreground/70">{activeDescription}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="secondary" onClick={onCreate} className="justify-center">
              <Plus aria-hidden="true" size={15} />
              New
            </Button>
            <Button asChild variant="secondary" className="justify-center">
              <Link to="/settings">
                <SettingsIcon aria-hidden="true" size={15} />
                Settings
              </Link>
            </Button>
          </div>
        </header>

        {degraded ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-5 text-muted-foreground">
            Agent list is delayed. The selected agent can still open the workroom.
          </div>
        ) : null}

        <section className="studio-card p-5 sm:p-6 text-center">
          <div>
            <p className="studio-kicker">Brief</p>
            <h2 className="mt-1.5 font-[var(--wireline-font-family-display)] text-[clamp(1.35rem,5vw,2rem)] font-semibold leading-tight tracking-[-0.035em] text-foreground">
              Task it.
            </h2>
          </div>

          <div className="mt-4 rounded-[var(--radius-lg)] border border-border bg-background p-3.5 focus-within:border-primary/40 sm:p-4">
            <label className="sr-only" htmlFor="studio-brief">
              What should this agent work on?
            </label>
            <textarea
              id="studio-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={4}
              placeholder={`Ask ${active.name} to...`}
              className="min-h-[110px] w-full resize-none bg-transparent px-1 py-0.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/60 sm:min-h-[128px]"
            />
            <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {WORK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setBrief(prompt)}
                    className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold text-muted-foreground transition-all hover:border-primary/30 hover:bg-accent hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                className="w-full justify-center sm:w-auto"
                onClick={() => onOpen(active.id, trimmedBrief || undefined)}
              >
                {trimmedBrief ? "Start" : "Workroom"}
                <ArrowRight aria-hidden="true" size={15} />
              </Button>
            </div>
          </div>
        </section>

        <section className="studio-card p-4 sm:p-5 text-center">
          <div className="flex items-center justify-between px-0.5 pb-2">
            <p className="studio-kicker">Fleet</p>
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground transition-all hover:border-primary/30 hover:bg-accent"
            >
              <Plus size={13} /> New
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:gap-3 xl:grid xl:grid-cols-2 xl:overflow-visible xl:gap-3 2xl:grid-cols-3">
            {agents.map((agent) => {
              const selected = agent.id === active.id;
              const AgentIcon = agent.channel === "email" ? MessageSquareText : Phone;
              const description = agentDescription(agent);
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => (selected ? onOpen(agent.id) : onSelect(agent.id))}
                  aria-current={selected ? "page" : undefined}
                  className={`flex min-w-[210px] flex-1 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all sm:min-w-[230px] xl:min-w-0 ${selected ? "border-primary/40 bg-accent shadow-sm" : "border-border bg-background hover:border-primary/20 hover:bg-accent"}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold text-foreground">
                    {agent.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden text-left">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                      {selected && <CircleDot className="size-3.5 shrink-0 text-primary" />}
                      <span className="truncate">{agent.name}</span>
                    </span>
                    <span className="mt-px flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      {agent.is_business_agent && <BriefcaseBusiness className="shrink-0" size={11} />}
                      <AgentIcon className="shrink-0" size={11} />
                      <span className="truncate capitalize">{description}</span>
                    </span>
                  </span>
                  {selected && <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
