/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Sparkles } from "lucide-react";
import { authFetch } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { FormShell, Field, Select, RunButton, ResultCard, ErrCard } from "../shared";
import type { AgentLite } from "../types";

export function AgentReviewForm({
  agents,
  agentId: initAgent,
  disabled,
}: {
  agents: AgentLite[];
  agentId?: string;
  disabled: boolean;
}) {
  const [agentId, setAgentId] = useState(initAgent || agents[0]?.id || "");
  const [lookback, setLookback] = useState(15);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState<any>(null);
  const [applying, setApplying] = useState<number | null>(null);
  const [appliedSet, setAppliedSet] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setReview(null);
    setAppliedSet(new Set());
    try {
      const r = await authFetch("/api/claude/agent-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, lookback }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setReview(data.review);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const apply = async (i: number, d: any) => {
    setApplying(i);
    try {
      await authFetch("/api/claude/agent-review/apply-directive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, directive: d.directive, priority: d.priority }),
      });
      setAppliedSet((s) => new Set(s).add(i));
    } finally {
      setApplying(null);
    }
  };

  return (
    <FormShell>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Agent">
          <Select
            value={agentId}
            onChange={setAgentId}
            options={agents.map((a) => ({ value: a.id, label: `${a.name} · ${a.archetype}` }))}
          />
        </Field>
        <Field label="Lookback (calls)">
          <Select
            value={String(lookback)}
            onChange={(v) => setLookback(parseInt(v))}
            options={[10, 15, 20, 25, 30].map((n) => ({ value: String(n), label: `Last ${n}` }))}
          />
        </Field>
      </div>
      <RunButton
        onClick={run}
        loading={loading}
        disabled={disabled || !agentId}
        label="Run Deep Review"
      />

      {err && <ErrCard error={err} />}
      {review && (
        <div className="space-y-4 pt-3">
          <div className="rounded-2xl glass-strong border border-white/12 p-6 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-muted mb-2">
                Overall Grade
              </div>
              <div className="font-display italic text-7xl text-aurora leading-none">
                {review.overall_grade}
              </div>
            </div>
            <Sparkles className="w-10 h-10 text-brand/60" />
          </div>
          <ResultCard title="Executive Summary">
            <p>{review.executive_summary}</p>
          </ResultCard>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ResultCard title="Strengths">
              <ul className="list-disc list-inside text-emerald-500/90 space-y-1">
                {review.strengths.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </ResultCard>
            <ResultCard title="Weaknesses">
              <ul className="list-disc list-inside text-rose-500/90 space-y-1">
                {review.weaknesses.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </ResultCard>
          </div>
          <div className="space-y-2.5">
            <h4 className="text-[10px] uppercase tracking-[0.4em] text-brand">
              Suggested Directives — One-Click Apply
            </h4>
            {review.suggested_directives.map((d: any, i: number) => (
              <div
                key={i}
                className="rounded-2xl glass border border-white/10 p-4 flex items-start gap-3"
              >
                <div
                  className={cn(
                    "shrink-0 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] mt-0.5",
                    d.priority === "critical" &&
                      "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                    d.priority === "high" && "bg-brand-3/15 text-brand-3 border border-brand-3/30",
                    d.priority === "medium" && "bg-brand/15 text-brand border border-brand/30",
                    d.priority === "low" &&
                      "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30",
                  )}
                >
                  {d.priority}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm text-ink/90">{d.directive}</p>
                  <p className="text-xs text-ink/55 italic">{d.rationale}</p>
                </div>
                <button
                  onClick={() => apply(i, d)}
                  disabled={applying === i || appliedSet.has(i)}
                  className={cn(
                    "shrink-0 px-3 py-2 rounded-full glass border text-[10px] uppercase tracking-[0.3em] transition-all flex items-center gap-1.5",
                    appliedSet.has(i)
                      ? "border-emerald-500/30 text-emerald-500"
                      : "border-brand/30 text-brand hover:bg-brand/10 disabled:opacity-50",
                  )}
                >
                  {applying === i ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : appliedSet.has(i) ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Plus className="w-3 h-3" />
                  )}
                  {appliedSet.has(i) ? "Applied" : "Apply"}
                </button>
              </div>
            ))}
          </div>
          {review.suggested_knowledge_entries?.length > 0 && (
            <ResultCard title="Suggested Knowledge Entries">
              <ul className="list-disc list-inside space-y-1">
                {review.suggested_knowledge_entries.map((k: string, i: number) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </ResultCard>
          )}
          {review.suggested_archetype && (
            <ResultCard title="Suggested Archetype">
              <p>{review.suggested_archetype}</p>
            </ResultCard>
          )}
          {review.risk_alerts?.length > 0 && (
            <ResultCard title="Risk Alerts">
              <ul className="list-disc list-inside text-rose-500/90 space-y-1">
                {review.risk_alerts.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </ResultCard>
          )}
        </div>
      )}
    </FormShell>
  );
}
