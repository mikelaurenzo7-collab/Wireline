/* eslint-disable @typescript-eslint/no-explicit-any -- agent-config + overview rows aren't shared as client types yet. */
import { useEffect, useState } from "react";
import { ArrowUpRight, Brain, Phone, ShieldAlert, Sparkles, Trash2 } from "lucide-react";

import { authFetch } from "../lib/api";
import { formatDate } from "../lib/safe-date";
import { OPS_CHANNEL_EMPTY } from "../lib/wireline-ops-design";
import { Badge, Button, EmptyState, Skeleton } from "./atoms";
import { StatusNotice } from "./molecules";

interface AgentMemoryPanelProps {
  agentId: string;
  agentName: string;
  messageCount: number;
  onClearMemory: () => void;
  onOpenTraining: () => void;
}

interface RecentCall {
  summary: string | null;
  sentiment: string | null;
  intent: string | null;
  outcome: string | null;
  createdAt: string | null;
}

function MemoryLoadingState() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-live="polite">
      <Skeleton shape="surface" className="h-24 w-full" />
      <Skeleton shape="surface" className="h-28 w-full" />
      <Skeleton shape="surface" className="h-40 w-full" />
    </div>
  );
}

function sentimentVariant(value: string | null) {
  if (value?.toLowerCase() === "positive") return "success" as const;
  if (value?.toLowerCase() === "negative") return "destructive" as const;
  return "default" as const;
}

export default function AgentMemoryPanel({ agentId, agentName, messageCount, onClearMemory, onOpenTraining }: AgentMemoryPanelProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [directives, setDirectives] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [personality, setPersonality] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [overviewResponse, configResponse] = await Promise.all([
          authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/overview`),
          authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`),
        ]);
        if (!active) return;
        if (!overviewResponse.ok || !configResponse.ok) throw new Error("Memory context could not be loaded.");

        const [overview, config] = await Promise.all([overviewResponse.json(), configResponse.json()]);
        if (!active) return;
        setRecentCalls(Array.isArray(overview?.recentCalls) ? overview.recentCalls : []);
        setLessons(Array.isArray(config?.lessons) ? config.lessons : []);
        setDirectives(Array.isArray(config?.directives) ? config.directives : []);
        setKnowledge(Array.isArray(config?.knowledge) ? config.knowledge : []);
        setPersonality(config?.personality || "");
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Memory context could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [agentId]);

  if (loading) return <MemoryLoadingState />;

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      {loadError ? <StatusNotice tone="destructive" title="Memory context is unavailable">{loadError}</StatusNotice> : null}

      <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary"><Brain className="size-5" /></span>
            <div className="min-w-0">
              <p className="text-eyebrow">Assistant context</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-.025em] text-foreground">What {agentName} can reference</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Wireline separates active conversation context, call-derived recall, and the rules and facts you configure for this assistant.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary"><Sparkles className="size-4" /></span>
            <div>
              <h4 className="font-semibold text-foreground">Conversation thread</h4>
              <p className="mt-1 text-sm text-muted-foreground">{messageCount} message{messageCount === 1 ? "" : "s"} available in this assistant’s current thread.</p>
            </div>
          </div>
          {messageCount > 0 ? <Button type="button" variant="ghost" size="sm" onClick={onClearMemory}><Trash2 className="size-4" /> Clear thread</Button> : null}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Clearing this thread removes the stored conversation context. It does not delete configured rules, knowledge, or historical call records.</p>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary"><Phone className="size-4" /></span>
          <div>
            <h4 className="font-semibold text-foreground">Recent call recall</h4>
            <p className="mt-1 text-sm text-muted-foreground">Summaries from the most recent conversations available to this workspace.</p>
          </div>
        </div>
        {recentCalls.length ? <div className="mt-4 space-y-3">{recentCalls.map((call, index) => <article key={`${call.createdAt || "call"}-${index}`} className="rounded-[var(--radius-md)] border border-border bg-[var(--wl-surface-subtle)] p-3"><p className="text-sm leading-6 text-foreground">{call.summary || "Call handled — no summary was captured."}</p><div className="mt-3 flex flex-wrap items-center gap-2">{call.intent ? <Badge variant="info">{call.intent}</Badge> : null}{call.sentiment ? <Badge variant={sentimentVariant(call.sentiment)}>{call.sentiment}</Badge> : null}{call.outcome ? <Badge variant="outline">{call.outcome}</Badge> : null}{call.createdAt ? <span className="ml-auto text-xs text-muted-foreground">{formatDate(call.createdAt)}</span> : null}</div></article>)}</div> : <EmptyState icon={<Phone className="size-5" />} eyebrow={OPS_CHANNEL_EMPTY.agentRecall.eyebrow} title={OPS_CHANNEL_EMPTY.agentRecall.title} description={`Once ${agentName} takes calls, conversation summaries appear here as recall context.`} density="compact" />}
      </section>

      {lessons.length ? <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary"><Sparkles className="size-4" /></span><div><h4 className="font-semibold text-foreground">Patterns learned from calls</h4><p className="mt-1 text-sm text-muted-foreground">Derived observations, shown separately from your configured instructions.</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-2">{lessons.map((lesson) => <p key={lesson.id} className="rounded-[var(--radius-md)] border border-[var(--wl-info-border)] bg-[var(--wl-info-surface)] p-3 text-sm leading-6 text-foreground">{lesson.lesson}</p>)}</div></section> : null}

      <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--wl-warning-surface)] text-[var(--wl-warning)]"><ShieldAlert className="size-4" /></span><div><h4 className="font-semibold text-foreground">Configured rules, facts, and personality</h4><p className="mt-1 text-sm text-muted-foreground">{directives.length} rule{directives.length === 1 ? "" : "s"} · {knowledge.length} fact{knowledge.length === 1 ? "" : "s"}</p></div></div>
          <Button type="button" variant="secondary" size="sm" onClick={onOpenTraining}><ArrowUpRight className="size-4" /> Manage in Training</Button>
        </div>
        {personality ? <p className="mt-4 rounded-[var(--radius-md)] bg-[var(--wl-surface-subtle)] p-3 text-sm leading-6 text-foreground">{personality}</p> : <p className="mt-3 text-sm leading-6 text-muted-foreground">No personality guidance is configured yet.</p>}
      </section>
    </div>
  );
}
