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
        <header className="flex flex-col items-center gap-3 text-center wl-centered-header">
          <div>
            <h1 className="truncate font-[var(--wireline-font-family-display)] text-[var(--wireline-typography-h1-size)] font-normal leading-none tracking-[-0.025em] text-foreground">
              {active.name}
            </h1>
            <p className="mt-1 text-xs font-mono uppercase tracking-[0.1em] text-muted-foreground">
              {activeDescription}
            </p>
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

        <section className="studio-card p-5 sm:p-6 text-center wl-centered-header">
          <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-border bg-background p-3.5 sm:p-4">
            <label className="sr-only" htmlFor="studio-brief">
              What should this agent work on?
            </label>
            <textarea
              id="studio-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={3}
              placeholder={`Ask ${active.name} to...`}
              className="min-h-[90px] w-full resize-none bg-transparent px-1 py-0.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  onOpen(active.id, trimmedBrief || undefined);
                }
              }}
            />
            <div className="flex flex-col gap-3 border-t border-border/70 pt-3 w-full sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {WORK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setBrief(prompt)}
                    className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold text-muted-foreground transition-all hover:border-primary/30 hover:bg-accent hover:text-foreground active:scale-[0.985]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                className="w-full justify-center sm:w-auto active:scale-[0.985] transition-transform"
                onClick={() => onOpen(active.id, trimmedBrief || undefined)}
                aria-label={trimmedBrief ? "Send brief and open workroom" : "Open workroom"}
              >
                {trimmedBrief ? "Send to Workroom" : "Open Workroom"}
                <ArrowRight aria-hidden="true" size={15} />
              </Button>
            </div>
          </div>
        </section>

        {/* Purposeful flywheel teaser: surface outcomes from Run to drive Train */}
        <div className="studio-card px-4 py-3 text-center text-sm">
          <Link
            to={`/studio?agent=${encodeURIComponent(active.id)}`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Review recent outcomes in ledger → train the agent</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <section className="studio-card p-4 sm:p-5 text-center wl-centered-header">
          <div className="flex items-center justify-between px-0.5 pb-2">
            <p className="text-sm font-semibold tracking-[-0.01em] text-foreground">Agents</p>
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground transition-all hover:border-primary/30 hover:bg-accent active:scale-[0.985]"
            >
              <Plus size={13} /> New
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:gap-3 xl:grid xl:grid-cols-2 xl:overflow-visible xl:gap-3 2xl:grid-cols-3">
            {agents.map((agent) => {
              const selected = agent.id === active.id;
              const AgentIcon = agent.channel === "email" ? MessageSquareText : Phone;
              const description = agentDescription(agent);
              return (
<div
           key={agent.id}
           className={cn(
             "flex min-w-[210px] flex-1 flex-col rounded-xl border px-3.5 py-3 transition-all sm:min-w-[230px]",
             "group focus-within:border-primary/50 focus-within:shadow-[var(--wireline-elevation-sm)]",
             selected
               ? "border-primary/40 bg-primary/[0.04] shadow-[var(--wireline-elevation-sm)]"
               : "border-border bg-background hover:border-primary/30 hover:bg-primary/[0.02]",
           )}
         >
           <button
             type="button"
             onClick={() => onSelect(agent.id)}
             aria-current={selected ? "page" : undefined}
             className={cn(
               "flex items-center gap-3 text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md transition-colors",
               "group-hover:bg-[color-mix(in_srgb,var(--wireline-color-surface-raised)_25%,transparent)]",
             )}
           >
             <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold text-foreground transition-transform group-hover:scale-105">
               {agent.name.slice(0, 1).toUpperCase()}
             </span>
             <span className="min-w-0 flex-1 overflow-hidden text-left">
               <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                 {selected && <CircleDot className="size-3.5 shrink-0 text-primary transition-all" />}
                 <span className="truncate">{agent.name}</span>
               </span>
               <span className="mt-px flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                 {agent.is_business_agent && (
                   <BriefcaseBusiness className="shrink-0" size={11} />
                 )}
                 <AgentIcon className="shrink-0" size={11} />
                 <span className="truncate capitalize">{description}</span>
               </span>
             </span>
             {selected && (
               <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
             )}
           </button>
         </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
