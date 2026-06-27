import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
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

const WORK_PROMPTS = ["Review conversations", "Draft follow-up", "Prep handoff", "Plan calls"] as const;

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
    <main className="h-full min-h-0 overflow-y-auto bg-background px-4 py-4 sm:px-6 sm:py-7 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">Studio</p>
            <h1 className="mt-1 truncate font-[var(--wireline-font-family-display)] text-[clamp(2rem,10vw,3rem)] font-semibold leading-none tracking-[-.055em] text-foreground">
              {active.name}
            </h1>
            <p className="mt-2 text-base capitalize leading-6 text-muted-foreground">
              {activeDescription}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
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
            <Button type="button" onClick={() => onOpen(active.id)} className="justify-center">
              Chat <ArrowRight aria-hidden="true" size={15} />
            </Button>
          </div>
        </header>

        {degraded ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-5 text-muted-foreground">
            Agent list is delayed. The selected agent can still open.
          </p>
        ) : null}

        <section className="studio-card p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold text-muted-foreground">Workroom</p>
              <h2 className="mt-2 font-[var(--wireline-font-family-display)] text-[clamp(1.45rem,6vw,2.25rem)] font-semibold leading-[1.02] tracking-[-.04em] text-foreground">
                Next job.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Describe the outcome. Approvals stay visible.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              <CheckCircle2 aria-hidden="true" size={14} className="text-primary" />
              Ready
            </div>
          </div>

          <div className="mt-5 rounded-[var(--radius-lg)] border border-border bg-background p-3 focus-within:border-primary/35 sm:p-4">
            <label className="sr-only" htmlFor="studio-brief">
              What should this agent work on?
            </label>
            <textarea
              id="studio-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={4}
              placeholder={`What should ${active.name} do next?`}
              className="min-h-[116px] w-full resize-none bg-transparent px-2 py-1 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground/60 sm:min-h-[132px]"
            />
            <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {WORK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setBrief(prompt)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
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
                {trimmedBrief ? "Start" : "Open"}
                <ArrowRight aria-hidden="true" size={15} />
              </Button>
            </div>
          </div>
        </section>

        <section className="studio-card p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 px-1 py-1.5">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Agents</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{agents.length} agents</p>
            </div>
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus size={14} />
              New
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 pt-3 sm:flex sm:overflow-x-auto">
            {agents.map((agent) => {
              const selected = agent.id === active.id;
              const AgentIcon = agent.channel === "email" ? MessageSquareText : Phone;
              const description = agentDescription(agent);
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => (selected ? onOpen(agent.id) : onSelect(agent.id))}
                  aria-current={selected ? "true" : undefined}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-3 text-left transition-colors sm:min-w-[240px] ${selected ? "border-primary/35 bg-accent" : "border-border bg-background hover:border-primary/25 hover:bg-accent"}`}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
                    {agent.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                      {selected ? <CircleDot className="size-3 shrink-0 text-primary" /> : null}
                      <span className="truncate">{agent.name}</span>
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs capitalize text-muted-foreground">
                      {agent.is_business_agent ? (
                        <BriefcaseBusiness className="shrink-0" size={12} />
                      ) : null}
                      <AgentIcon className="shrink-0" size={12} />
                      <span className="truncate">{description}</span>
                    </span>
                  </span>
                  {selected ? <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
