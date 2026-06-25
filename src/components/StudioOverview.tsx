import { useState } from "react";
import { ArrowRight, Bot, CircleDot, MessageSquareText, Plus } from "lucide-react";

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
  return agent.is_business_agent ? "Business assistant" : "Personal assistant";
}

function channelLabel(agent: WorkspaceAgentSummary) {
  if (agent.channel === "voice") return "Voice";
  if (agent.channel === "email") return "Email";
  if (agent.channel === "omnichannel") return "Voice · email · text";
  return "Assistant";
}

export default function StudioOverview({ active, agents, degraded, onSelect, onOpen, onCreate }: StudioOverviewProps) {
  const [brief, setBrief] = useState("");

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-background px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-7">
        <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="wl-overline text-primary">Studio / workspace</p>
            <div className="mt-2 flex items-center gap-2">
              <h1 className="truncate text-[clamp(1.55rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-.04em] text-foreground">{active.name}</h1>
              <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[var(--wireline-typography-caption-size)] text-muted-foreground sm:inline-flex">
                <CircleDot className="size-3 text-primary" aria-hidden="true" /> Selected assistant
              </span>
            </div>
            <p className="mt-2 text-[var(--wireline-typography-body-size)] text-muted-foreground">{roleLabel(active)} · {channelLabel(active)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={onCreate}><Plus aria-hidden="true" size={15} /> New assistant</Button>
            <Button type="button" onClick={() => onOpen(active.id)}>Open workspace <ArrowRight aria-hidden="true" size={15} /></Button>
          </div>
        </header>

        {degraded ? (
          <p className="rounded-md border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3 text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
            Your assistant list may be delayed. You can still open the selected workspace.
          </p>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
          <div className="min-w-0">
            <p className="wl-overline text-primary">Studio · today</p>
            <h2 className="mt-3 max-w-[12ch] text-[clamp(2.25rem,5vw,4.1rem)] font-semibold leading-[.98] tracking-[-.055em] text-foreground">
              What should we work on today?
            </h2>
            <p className="mt-5 max-w-xl text-[var(--wireline-typography-body-size)] leading-7 text-muted-foreground sm:text-[1.05rem]">
              Give {active.name} a clear outcome. Review the plan and choose what happens next before anything is sent.
            </p>

            <div className="mt-8 rounded-xl border border-border bg-card p-3 shadow-[0_12px_32px_-4px_rgba(93,63,211,0.08),0_4px_12px_rgba(93,63,211,0.04)]">
              <label className="sr-only" htmlFor="studio-brief">What should this assistant work on?</label>
              <textarea
                id="studio-brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                rows={4}
                placeholder={`Describe what you need ${active.name} to work on…`}
                className="min-h-[124px] w-full resize-none bg-transparent px-3 py-2 text-[var(--wireline-typography-body-size)] leading-6 text-foreground outline-none placeholder:text-muted-foreground/70"
              />
              <div className="flex flex-col gap-3 border-t border-border px-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {["Review recent conversations", "Prepare a follow-up", "Improve the handoff"].map((prompt) => (
                    <button key={prompt} type="button" onClick={() => setBrief(prompt)} className="rounded-full border border-border px-3 py-1.5 text-[var(--wireline-typography-caption-size)] text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground">
                      {prompt}
                    </button>
                  ))}
                </div>
                <Button type="button" disabled={!brief.trim()} onClick={() => onOpen(active.id, brief)}>Continue in workspace <ArrowRight aria-hidden="true" size={15} /></Button>
              </div>
            </div>
          </div>

          <aside className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_32px_-4px_rgba(93,63,211,0.08),0_4px_12px_rgba(93,63,211,0.04)] sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="wl-overline text-primary">Your assistants</p>
                <h2 className="mt-1 text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.02em] text-foreground">{agents.length} in this workspace</h2>
              </div>
              <button type="button" onClick={onCreate} className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground" aria-label="Create a new assistant"><Plus size={16} aria-hidden="true" /></button>
            </div>

            <div className="mt-3 space-y-2">
              {agents.map((agent) => {
                const selected = agent.id === active.id;
                return (
                  <button key={agent.id} type="button" onClick={() => selected ? onOpen(agent.id) : onSelect(agent.id)} className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${selected ? "border-primary/30 bg-primary/[0.06]" : "border-border bg-background hover:border-primary/25"}`}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-[var(--wireline-typography-caption-size)] font-semibold text-foreground">{agent.name.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--wireline-typography-body-size)] font-semibold text-foreground">{agent.name}</span>
                      <span className="mt-0.5 block truncate text-[var(--wireline-typography-caption-size)] text-muted-foreground">{roleLabel(agent)} · {channelLabel(agent)}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-[var(--wireline-typography-caption-size)] font-semibold text-foreground">Work stays reviewable.</p>
                  <p className="mt-1 text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">Start from the outcome, then inspect suggestions before any action is taken.</p>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
