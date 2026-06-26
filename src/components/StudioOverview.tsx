import { useState } from "react";
import { ArrowRight, BriefcaseBusiness, CircleDot, Plus } from "lucide-react";

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

export default function StudioOverview({ active, agents, degraded, onSelect, onOpen, onCreate }: StudioOverviewProps) {
  const [brief, setBrief] = useState("");

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-background px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="wl-overline">Build</p>
            <h1 className="mt-1 truncate text-[clamp(1.9rem,4vw,3.4rem)] font-semibold leading-none tracking-[-.06em] text-foreground">{active.name}</h1>
            <p className="mt-2 text-sm capitalize text-muted-foreground">{roleLabel(active)} · {channelLabel(active)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={onCreate}><Plus aria-hidden="true" size={15} />New</Button>
            <Button type="button" onClick={() => onOpen(active.id)}>Open <ArrowRight aria-hidden="true" size={15} /></Button>
          </div>
        </header>

        {degraded ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-5 text-muted-foreground">
            Agent list is delayed. The selected agent can still open.
          </p>
        ) : null}

        <section className="rounded-3xl border border-border bg-card p-4 shadow-[var(--wireline-elevation-sm)] sm:p-5 lg:p-6">
          <p className="wl-overline text-primary">Workroom</p>
          <h2 className="mt-3 max-w-[11ch] text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[.95] tracking-[-.065em] text-foreground">
            What should it do?
          </h2>
          <p className="mt-4 max-w-xl text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground">
            Give the agent a clear outcome. The next screen is chat-first.
          </p>

          <div className="mt-8 rounded-2xl border border-border bg-background p-3 focus-within:border-primary/35">
            <label className="sr-only" htmlFor="studio-brief">What should this agent work on?</label>
            <textarea
              id="studio-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={4}
              placeholder={`Tell ${active.name} what to work on…`}
              className="min-h-[128px] w-full resize-none bg-transparent px-3 py-2 text-[var(--wireline-typography-body-size)] leading-6 text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex flex-col gap-3 border-t border-border px-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {["Review conversations", "Draft follow-up", "Improve handoff"].map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setBrief(prompt)} className="rounded-full border border-border px-3 py-1.5 text-[var(--wireline-typography-caption-size)] text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground">
                    {prompt}
                  </button>
                ))}
              </div>
              <Button type="button" disabled={!brief.trim()} onClick={() => onOpen(active.id, brief)}>Continue <ArrowRight aria-hidden="true" size={15} /></Button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <p className="wl-overline">Agents</p>
            <button type="button" onClick={onCreate} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Plus size={14} />New</button>
          </div>
          <div className="flex gap-2 overflow-x-auto px-1 pb-1 pt-2">
            {agents.map((agent) => {
              const selected = agent.id === active.id;
              return (
                <button key={agent.id} type="button" onClick={() => selected ? onOpen(agent.id) : onSelect(agent.id)} className={`flex min-w-[220px] items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${selected ? "border-primary/30 bg-primary/[0.06]" : "border-border bg-background hover:border-primary/25"}`}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-sm font-semibold text-foreground">{agent.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">{selected ? <CircleDot className="size-3 text-primary" /> : null}{agent.name}</span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-xs capitalize text-muted-foreground">{agent.is_business_agent ? <BriefcaseBusiness size={12} /> : null}{roleLabel(agent)} · {channelLabel(agent)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
