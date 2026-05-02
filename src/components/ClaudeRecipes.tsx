/**
 * Claude Recipes — inline buttons + modal drawer.
 *
 * Drop <ClaudeRecipeButton recipe="..." agentId="..."/> anywhere in the app
 * and it opens the matching recipe in a modal, pre-filled with context.
 *
 * Recipes:
 *   brief             → Pre-call tactical briefing
 *   qualify           → BANT lead qualification (post-call)
 *   objection-drill   → Practice scenarios + scripted responses
 *   cold-email        → Cold email composer
 *   persona-clone     → Distill persona from sample messages
 *   summarize-thread  → Email thread summary + action items
 *   agent-review      → Deep performance review w/ one-click directive apply
 */

import React, { useState, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles, Brain, Target, Mail, Wand2, AlertTriangle, Loader2,
  ArrowRight, ShieldAlert, Compass, BarChart3, ChevronRight, Check,
  Plus, X, Copy, ScrollText
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";

export type Recipe =
  | "brief"
  | "qualify"
  | "objection-drill"
  | "cold-email"
  | "persona-clone"
  | "summarize-thread"
  | "agent-review";

interface RecipeMeta {
  title: string;
  tagline: string;
  icon: any;
  accent: string;
  thinking: boolean;
}

const RECIPE_META: Record<Recipe, RecipeMeta> = {
  "brief":            { title: "Pre-Call Brief",       tagline: "Tactical playbook before you dial.",           icon: Compass,     accent: "#7DF9FF", thinking: true  },
  "qualify":          { title: "Lead Qualification",   tagline: "BANT-scored evidence, not vibes.",             icon: Target,      accent: "#C58BFF", thinking: true  },
  "objection-drill":  { title: "Objection Drills",     tagline: "Realistic scenarios with scripted rebuttals.", icon: ShieldAlert, accent: "#FF6BD9", thinking: false },
  "cold-email":       { title: "Cold Email",           tagline: "Reply-worthy outreach in 120 words.",          icon: Mail,        accent: "#4DFFC4", thinking: false },
  "persona-clone":    { title: "Persona Clone",        tagline: "Distill a person's voice from samples.",       icon: Wand2,       accent: "#FFC07D", thinking: true  },
  "summarize-thread": { title: "Thread Summary",       tagline: "Action items + sentiment in one sweep.",       icon: ScrollText,  accent: "#7DF9FF", thinking: false },
  "agent-review":     { title: "Performance Review",   tagline: "Deep audit of your last N calls.",             icon: BarChart3,   accent: "#C58BFF", thinking: true  },
};

interface AgentLite { id: string; name: string; archetype: string; }

/* ────────────────────  Public component  ────────────────────────── */

export function ClaudeRecipeButton({
  recipe,
  agentId,
  threadId,
  callId,
  initial,
  label,
  variant = "default",
  className,
}: {
  recipe: Recipe;
  agentId?: string;
  threadId?: string;
  callId?: string;
  initial?: Record<string, any>;
  label?: string;
  variant?: "default" | "ghost" | "compact";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const meta = RECIPE_META[recipe];

  const buttonStyles = {
    default: "px-4 py-2.5 rounded-full glass border border-brand/30 text-[11px] uppercase tracking-[0.3em] text-brand hover:bg-brand/10 hover:border-brand/60 transition-all flex items-center gap-2",
    ghost: "px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand transition-colors flex items-center gap-1.5",
    compact: "w-9 h-9 rounded-full glass border border-brand/30 flex items-center justify-center text-brand hover:bg-brand/10 transition-all",
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(buttonStyles[variant], className)}
        title={meta.title}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {variant !== "compact" && (label ?? meta.title)}
      </button>
      <AnimatePresence>
        {open && (
          <RecipeModal
            recipe={recipe}
            agentId={agentId}
            threadId={threadId}
            callId={callId}
            initial={initial}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ────────────────────  Modal shell  ─────────────────────────────── */

function RecipeModal({
  recipe, agentId, threadId, callId, initial, onClose,
}: {
  recipe: Recipe;
  agentId?: string;
  threadId?: string;
  callId?: string;
  initial?: Record<string, any>;
  onClose: () => void;
}) {
  const meta = RECIPE_META[recipe];
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, a] = await Promise.all([
          authFetch("/api/claude/status").then((r) => r.json()),
          authFetch("/api/agents").then((r) => r.json()),
        ]);
        setAvailable(!!s.available);
        setAgents((a.agents ?? []).map((x: any) => ({ id: x.id, name: x.name, archetype: x.archetype })));
      } catch {
        setAvailable(false);
      }
    })();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8"
    >
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 24 }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        className="relative aurora-ring rounded-3xl w-full max-w-3xl max-h-[88vh] flex flex-col"
      >
        <div className="relative rounded-3xl glass-strong overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${meta.accent}, transparent)` }} />

          <div className="relative z-10 flex items-center justify-between px-7 py-5 border-b border-white/8">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl glass border border-white/10 flex items-center justify-center" style={{ color: meta.accent }}>
                <meta.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display italic text-2xl leading-none">{meta.title}</h2>
                  {meta.thinking && (
                    <span className="px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 text-[9px] uppercase tracking-[0.25em] text-brand flex items-center gap-1">
                      <Brain className="w-2.5 h-2.5" /> Adaptive
                    </span>
                  )}
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted mt-1">{meta.tagline}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-ink/60 hover:text-ink hover:border-brand/40 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          {available === false && <NoKeyInline />}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {recipe === "brief"            && <BriefForm           agents={agents} agentId={agentId} initial={initial} disabled={!available} />}
            {recipe === "qualify"          && <QualifyForm         callId={callId} initial={initial} disabled={!available} />}
            {recipe === "objection-drill"  && <ObjectionDrillForm  agents={agents} agentId={agentId} initial={initial} disabled={!available} />}
            {recipe === "cold-email"       && <ColdEmailForm       initial={initial} disabled={!available} />}
            {recipe === "persona-clone"    && <PersonaCloneForm    agents={agents} agentId={agentId} disabled={!available} />}
            {recipe === "summarize-thread" && <ThreadSummaryForm   threadId={threadId} disabled={!available} />}
            {recipe === "agent-review"     && <AgentReviewForm     agents={agents} agentId={agentId} disabled={!available} />}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function NoKeyInline() {
  return (
    <div className="px-7 py-4 bg-rose-500/10 border-y border-rose-500/30 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
      <p className="text-xs text-rose-500 leading-relaxed">
        Claude Brain is offline — set <code className="font-mono">ANTHROPIC_API_KEY</code> to enable this recipe.
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" className="underline ml-2">Get a key →</a>
      </p>
    </div>
  );
}

/* ────────────────────  Form primitives  ─────────────────────────── */

function FormShell({ children }: { children: ReactNode }) {
  return <div className="p-7 space-y-6">{children}</div>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-[0.4em] text-muted">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted/70 leading-relaxed">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: any) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full h-12 px-4 rounded-xl bg-black/30 border border-white/10 outline-none text-ink text-sm placeholder:text-muted/50 focus:border-brand/60 focus:bg-black/40 transition-all"
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 5 }: any) {
  return (
    <textarea
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 outline-none text-ink text-sm placeholder:text-muted/50 focus:border-brand/60 focus:bg-black/40 transition-all resize-none leading-relaxed font-sans"
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full h-12 px-4 rounded-xl bg-black/30 border border-white/10 outline-none text-ink text-sm focus:border-brand/60 transition-all"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function RunButton({ onClick, loading, disabled, label = "Generate" }: any) {
  return (
    <button
      onClick={onClick} disabled={loading || disabled}
      className="brutal-btn w-full !py-4 !text-[12px] !tracking-[0.32em]"
    >
      {loading ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Thinking…</>
      ) : (
        <><Sparkles className="w-4 h-4" /> {label} <ArrowRight className="w-4 h-4" /></>
      )}
    </button>
  );
}

const ResultCard: React.FC<{ title: string; copyText?: string; children?: ReactNode }> = ({ title, children, copyText }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl glass border border-white/10 p-5 space-y-3 relative">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] uppercase tracking-[0.4em] text-brand">{title}</h4>
        {copyText && (
          <button
            onClick={async () => { await navigator.clipboard.writeText(copyText); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand flex items-center gap-1.5 transition-colors"
          >
            {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
        )}
      </div>
      <div className="text-sm text-ink/85 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function ErrCard({ error }: { error: string }) {
  return (
    <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-rose-500 text-sm flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );
}

/* ────────────────────  Brief  ───────────────────────────────────── */

function BriefForm({ agents, agentId: initAgent, initial, disabled }: { agents: AgentLite[]; agentId?: string; initial?: any; disabled: boolean }) {
  const [agentId, setAgentId] = useState(initAgent || agents[0]?.id || "");
  const [name, setName] = useState(initial?.customerName ?? "");
  const [number, setNumber] = useState(initial?.customerNumber ?? "");
  const [reason, setReason] = useState(initial?.reasonForCall ?? "");
  const [past, setPast] = useState(initial?.pastInteractionSummary ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [brief, setBrief] = useState<any>(null);

  useEffect(() => { if (!agentId && agents[0]) setAgentId(agents[0].id); }, [agents]);

  const run = async () => {
    setLoading(true); setErr(null); setBrief(null);
    try {
      const r = await authFetch("/api/claude/brief", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, customerName: name, customerNumber: number, reasonForCall: reason, pastInteractionSummary: past }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setBrief(data.brief);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <FormShell>
      <Field label="Agent">
        <Select value={agentId} onChange={setAgentId} options={[{ value: "", label: "(no agent — generic brief)" }, ...agents.map((a) => ({ value: a.id, label: `${a.name} · ${a.archetype}` }))]} />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Customer Name"><TextInput value={name} onChange={setName} placeholder="Jordan Pike" /></Field>
        <Field label="Customer Number"><TextInput value={number} onChange={setNumber} placeholder="+1 415 555 0142" /></Field>
      </div>
      <Field label="Reason for Call">
        <TextArea value={reason} onChange={setReason} placeholder="Following up on demo request from yesterday." rows={3} />
      </Field>
      <Field label="Past Interaction" hint="Optional — paste the last interaction or notes.">
        <TextArea value={past} onChange={setPast} placeholder="Last call: explored pricing, hesitant on commitment length." rows={3} />
      </Field>
      <RunButton onClick={run} loading={loading} disabled={disabled || !reason} label="Generate Brief" />

      {err && <ErrCard error={err} />}
      {brief && (
        <div className="space-y-4 pt-3">
          <ResultCard title="Opening Line" copyText={brief.opening_line}><p>"{brief.opening_line}"</p></ResultCard>
          <ResultCard title="Intent Hypothesis"><p>{brief.intent_hypothesis}</p></ResultCard>
          <ResultCard title="Key Questions">
            <ol className="list-decimal list-inside space-y-1.5">{brief.key_questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ol>
          </ResultCard>
          <ResultCard title="Objections to Anticipate">
            <ul className="space-y-3">
              {brief.objections_to_anticipate.map((o: any, i: number) => (
                <li key={i} className="space-y-1">
                  <div className="text-rose-500 text-[11px] uppercase tracking-[0.25em]">"{o.objection}"</div>
                  <div className="text-ink/85">→ {o.response}</div>
                </li>
              ))}
            </ul>
          </ResultCard>
          <ResultCard title="Value Props">
            <ul className="list-disc list-inside space-y-1">{brief.value_props.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
          </ResultCard>
          <ResultCard title="Closing Strategy"><p>{brief.closing_strategy}</p></ResultCard>
          {brief.risk_flags?.length > 0 && (
            <ResultCard title="Risk Flags">
              <ul className="list-disc list-inside text-rose-400 space-y-1">{brief.risk_flags.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>
            </ResultCard>
          )}
        </div>
      )}
    </FormShell>
  );
}

/* ────────────────────  Qualify  ─────────────────────────────────── */

function QualifyForm({ callId, initial, disabled }: { callId?: string; initial?: any; disabled: boolean }) {
  const [transcript, setTranscript] = useState(initial?.transcript ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState<any>(null);

  const run = async () => {
    setLoading(true); setErr(null); setQ(null);
    try {
      const r = await authFetch("/api/claude/qualify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "voice_call", transcript: callId ? undefined : transcript, callId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setQ(data.qualification);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <FormShell>
      {!callId && (
        <Field label="Transcript or Email Body" hint="Paste the conversation text. Claude scores it against BANT with evidence.">
          <TextArea value={transcript} onChange={setTranscript} placeholder="Customer: I'm exploring options for our 200-seat team..." rows={10} />
        </Field>
      )}
      {callId && <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Qualifying call <span className="text-brand font-mono">{callId.toString().slice(0, 8)}…</span> from log</p>}
      <RunButton onClick={run} loading={loading} disabled={disabled || (!transcript && !callId)} label="Score Lead" />

      {err && <ErrCard error={err} />}
      {q && (
        <div className="space-y-4 pt-3">
          <div className="rounded-2xl p-6 glass-strong border border-white/12 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-muted mb-2">Aggregate</div>
              <div className="font-display italic text-6xl text-aurora leading-none">{q.total_score}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.4em] text-muted mb-2">Label</div>
              <div className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.3em]",
                q.qualification_label === "hot" && "bg-rose-500/15 border border-rose-500/40 text-rose-500",
                q.qualification_label === "warm" && "bg-brand/15 border border-brand/40 text-brand",
                q.qualification_label === "cool" && "bg-zinc-500/15 border border-zinc-500/40 text-zinc-300",
                q.qualification_label === "cold" && "bg-zinc-700/15 border border-zinc-700/40 text-zinc-400",
                q.qualification_label === "disqualified" && "bg-rose-700/15 border border-rose-700/40 text-rose-400",
              )}>
                <Sparkles className="w-3 h-3" />
                {q.qualification_label}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["budget", "authority", "need", "timeline"] as const).map((k) => (
              <ResultCard key={k} title={k}>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="font-display italic text-3xl text-ink">{q[k].score}</div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-muted">/ 100</div>
                </div>
                <p className="text-sm text-ink/70">{q[k].evidence}</p>
              </ResultCard>
            ))}
          </div>
          <ResultCard title="Recommended Next Step"><p>{q.recommended_next_step}</p></ResultCard>
          <ResultCard title="Reasoning"><p className="text-ink/65">{q.reasoning}</p></ResultCard>
        </div>
      )}
    </FormShell>
  );
}

/* ────────────────────  Objection drill  ─────────────────────────── */

function ObjectionDrillForm({ agents, agentId: initAgent, initial, disabled }: { agents: AgentLite[]; agentId?: string; initial?: any; disabled: boolean }) {
  const [agentId, setAgentId] = useState(initAgent || agents[0]?.id || "");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => { if (!agentId && agents[0]) setAgentId(agents[0].id); }, [agents]);

  const run = async () => {
    setLoading(true); setErr(null); setResult(null);
    try {
      const r = await authFetch("/api/claude/objection-drill", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, topic, count }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResult(data);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <FormShell>
      <Field label="Agent">
        <Select value={agentId} onChange={setAgentId} options={[{ value: "", label: "(no agent)" }, ...agents.map((a) => ({ value: a.id, label: a.name }))]} />
      </Field>
      <Field label="Topic" hint="What kind of objection scenarios do you want to drill?">
        <TextInput value={topic} onChange={setTopic} placeholder="Pricing pushback on enterprise tier" />
      </Field>
      <Field label="Count">
        <Select value={String(count)} onChange={(v) => setCount(parseInt(v))} options={[3, 5, 7, 10].map((n) => ({ value: String(n), label: `${n} drills` }))} />
      </Field>
      <RunButton onClick={run} loading={loading} disabled={disabled || !topic} label="Compose Drills" />

      {err && <ErrCard error={err} />}
      {result?.scenarios && (
        <div className="space-y-3 pt-3">
          {result.scenarios.map((s: any, i: number) => (
            <div key={i} className="rounded-2xl glass border border-white/10 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-display italic text-xl">{s.title}</h4>
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em]",
                  s.difficulty === "easy" && "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
                  s.difficulty === "medium" && "bg-brand/15 text-brand border border-brand/30",
                  s.difficulty === "hard" && "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                )}>{s.difficulty}</span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-rose-500 mb-1">Prospect</div>
                <p className="text-ink/90 italic">"{s.prospect_says}"</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-brand mb-1">Recommended Response</div>
                <p className="text-ink/90">{s.recommended_response}</p>
              </div>
              <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted mb-1">Coaching Note</div>
                <p className="text-ink/60 text-xs leading-relaxed">{s.coaching_note}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </FormShell>
  );
}

/* ────────────────────  Cold email  ──────────────────────────────── */

function ColdEmailForm({ initial, disabled }: { initial?: any; disabled: boolean }) {
  const [form, setForm] = useState({
    leadName: initial?.leadName ?? "", leadCompany: initial?.leadCompany ?? "", leadRole: initial?.leadRole ?? "",
    leadHook: initial?.leadHook ?? "", ourCompany: initial?.ourCompany ?? "", valueProp: initial?.valueProp ?? "",
    tone: "professional", callToAction: initial?.callToAction ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState<any>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const run = async () => {
    setLoading(true); setErr(null); setEmail(null);
    try {
      const r = await authFetch("/api/claude/cold-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setEmail(data.email);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <FormShell>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Lead Name"><TextInput value={form.leadName} onChange={(v: string) => set("leadName", v)} placeholder="Avery Tang" /></Field>
        <Field label="Lead Role"><TextInput value={form.leadRole} onChange={(v: string) => set("leadRole", v)} placeholder="VP of Operations" /></Field>
        <Field label="Lead Company"><TextInput value={form.leadCompany} onChange={(v: string) => set("leadCompany", v)} placeholder="Acme Co" /></Field>
        <Field label="Tone">
          <Select value={form.tone} onChange={(v) => set("tone", v)} options={[
            { value: "warm", label: "Warm" }, { value: "professional", label: "Professional" },
            { value: "punchy", label: "Punchy" }, { value: "consultative", label: "Consultative" },
          ]} />
        </Field>
      </div>
      <Field label="Lead Hook" hint="Specific reason to reach out — recent news, mutual contact, etc.">
        <TextArea value={form.leadHook} onChange={(v: string) => set("leadHook", v)} rows={2} placeholder="Just announced Series B for international expansion." />
      </Field>
      <Field label="Our Company"><TextInput value={form.ourCompany} onChange={(v: string) => set("ourCompany", v)} placeholder="Wireline" /></Field>
      <Field label="Value Prop">
        <TextArea value={form.valueProp} onChange={(v: string) => set("valueProp", v)} rows={2} placeholder="Carrier-grade voice automation that scales with your fleet." />
      </Field>
      <Field label="Call to Action"><TextInput value={form.callToAction} onChange={(v: string) => set("callToAction", v)} placeholder="Ask for a 15-min intro call next week." /></Field>
      <RunButton onClick={run} loading={loading} disabled={disabled || !form.valueProp || !form.ourCompany} label="Compose Email" />

      {err && <ErrCard error={err} />}
      {email && (
        <div className="space-y-3 pt-3">
          <ResultCard title="Subject" copyText={email.subject}><p className="font-display italic text-xl">{email.subject}</p></ResultCard>
          <ResultCard title="Body" copyText={email.body}><pre className="whitespace-pre-wrap font-sans">{email.body}</pre></ResultCard>
          {email.personalization_notes?.length > 0 && (
            <ResultCard title="Personalization Notes">
              <ul className="list-disc list-inside text-ink/65 space-y-1">{email.personalization_notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
            </ResultCard>
          )}
          {email.suggested_followup_date && <ResultCard title="Suggested Follow-up"><p>{email.suggested_followup_date}</p></ResultCard>}
        </div>
      )}
    </FormShell>
  );
}

/* ────────────────────  Persona clone  ───────────────────────────── */

function PersonaCloneForm({ agents, agentId: initAgent, disabled }: { agents: AgentLite[]; agentId?: string; disabled: boolean }) {
  const [agentId, setAgentId] = useState(initAgent ?? "");
  const [description, setDescription] = useState("");
  const [samples, setSamples] = useState<string[]>([""]);
  const [apply, setApply] = useState(!!initAgent);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setLoading(true); setErr(null); setResult(null);
    try {
      const cleaned = samples.map((s) => s.trim()).filter(Boolean);
      const r = await authFetch("/api/claude/persona-clone", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, samples: cleaned, agentId, applyToAgent: apply }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setResult(data);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <FormShell>
      <Field label="Persona Description" hint="Who are we cloning? Role, tone, attitude.">
        <TextArea value={description} onChange={setDescription} rows={2} placeholder="Senior account exec — direct, witty, secretly very kind." />
      </Field>
      <Field label="Sample Messages" hint="Paste 2–5 actual messages, calls, or emails from this person.">
        <div className="space-y-2">
          {samples.map((s, i) => (
            <div key={i} className="flex gap-2">
              <TextArea value={s} onChange={(v: string) => setSamples((arr) => arr.map((x, j) => j === i ? v : x))} rows={3} placeholder={`Sample ${i + 1}`} />
              {samples.length > 1 && (
                <button onClick={() => setSamples((arr) => arr.filter((_, j) => j !== i))} className="w-10 h-10 rounded-xl glass border border-white/10 flex items-center justify-center text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0 self-start mt-1">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {samples.length < 8 && (
            <button onClick={() => setSamples((arr) => [...arr, ""])} className="w-full py-2 rounded-xl glass border border-dashed border-white/10 text-[11px] uppercase tracking-[0.3em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center justify-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Add Sample
            </button>
          )}
        </div>
      </Field>

      <Field label="Apply to Agent (optional)">
        <Select value={agentId} onChange={setAgentId} options={[{ value: "", label: "(don't apply — preview only)" }, ...agents.map((a) => ({ value: a.id, label: a.name }))]} />
      </Field>
      {agentId && (
        <label className="flex items-center gap-3 cursor-pointer text-sm text-ink/80">
          <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-black/30 accent-brand" />
          Save persona block to <span className="text-brand">{agents.find((a) => a.id === agentId)?.name}</span>
        </label>
      )}
      <RunButton onClick={run} loading={loading} disabled={disabled || samples.every((s) => !s.trim())} label="Compile Persona" />

      {err && <ErrCard error={err} />}
      {result?.persona && (
        <div className="space-y-3 pt-3">
          {result.applied && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-emerald-500 text-xs flex items-center gap-2">
              <Check className="w-3.5 h-3.5" /> Persona saved to agent — voice + email replies will use it on next call.
            </div>
          )}
          <ResultCard title="Persona Block" copyText={result.persona.persona_block}>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{result.persona.persona_block}</pre>
          </ResultCard>
          <ResultCard title="Tone Summary"><p>{result.persona.tone_summary}</p></ResultCard>
          {result.persona.signature_phrases?.length > 0 && (
            <ResultCard title="Signature Phrases">
              <ul className="list-disc list-inside space-y-1">{result.persona.signature_phrases.map((p: string, i: number) => <li key={i} className="italic">"{p}"</li>)}</ul>
            </ResultCard>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ResultCard title="Do">
              <ul className="list-disc list-inside text-emerald-500/90 space-y-1">{result.persona.do_rules.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
            </ResultCard>
            <ResultCard title="Don't">
              <ul className="list-disc list-inside text-rose-500/90 space-y-1">{result.persona.dont_rules.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
            </ResultCard>
          </div>
        </div>
      )}
    </FormShell>
  );
}

/* ────────────────────  Thread summary  ──────────────────────────── */

function ThreadSummaryForm({ threadId, disabled }: { threadId?: string; disabled: boolean }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [s, setS] = useState<any>(null);

  const run = async () => {
    if (!threadId) { setErr("No thread selected."); return; }
    setLoading(true); setErr(null); setS(null);
    try {
      const r = await authFetch("/api/claude/summarize-thread", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setS(data.summary);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <FormShell>
      {!threadId && <ErrCard error="Open a thread to summarize it." />}
      {threadId && <p className="text-[11px] uppercase tracking-[0.3em] text-muted">Summarizing thread <span className="text-brand font-mono">{threadId.slice(0, 8)}…</span></p>}
      <RunButton onClick={run} loading={loading} disabled={disabled || !threadId} label="Summarize" />

      {err && <ErrCard error={err} />}
      {s && (
        <div className="space-y-3 pt-3">
          <ResultCard title="Summary" copyText={s.summary}><p>{s.summary}</p></ResultCard>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ResultCard title="Sentiment">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.3em]",
                s.sentiment === "positive" && "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
                s.sentiment === "delighted" && "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
                s.sentiment === "neutral" && "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
                s.sentiment === "frustrated" && "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                s.sentiment === "angry" && "bg-rose-500/15 text-rose-500 border border-rose-500/30",
              )}>{s.sentiment}</span>
            </ResultCard>
            <ResultCard title="Urgency">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.3em]",
                s.urgency === "low" && "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
                s.urgency === "medium" && "bg-brand/15 text-brand border border-brand/30",
                s.urgency === "high" && "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                s.urgency === "critical" && "bg-rose-500/15 text-rose-500 border border-rose-500/30",
              )}>{s.urgency}</span>
            </ResultCard>
          </div>
          <ResultCard title="Key Points">
            <ul className="list-disc list-inside space-y-1">{s.key_points.map((k: string, i: number) => <li key={i}>{k}</li>)}</ul>
          </ResultCard>
          <ResultCard title="Action Items">
            <ul className="space-y-2">
              {s.action_items.map((a: any, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={cn(
                    "shrink-0 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] mt-0.5",
                    a.owner === "us" ? "bg-brand/15 text-brand border border-brand/30" : "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                  )}>{a.owner}</span>
                  <span>{a.description}{a.due_hint ? <span className="text-muted ml-2 italic text-xs">— {a.due_hint}</span> : null}</span>
                </li>
              ))}
            </ul>
          </ResultCard>
          <ResultCard title="Recommended Next Step"><p>{s.recommended_next_step}</p></ResultCard>
        </div>
      )}
    </FormShell>
  );
}

/* ────────────────────  Agent review  ────────────────────────────── */

function AgentReviewForm({ agents, agentId: initAgent, disabled }: { agents: AgentLite[]; agentId?: string; disabled: boolean }) {
  const [agentId, setAgentId] = useState(initAgent || agents[0]?.id || "");
  const [lookback, setLookback] = useState(15);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState<any>(null);
  const [applying, setApplying] = useState<number | null>(null);
  const [appliedSet, setAppliedSet] = useState<Set<number>>(new Set());

  useEffect(() => { if (!agentId && agents[0]) setAgentId(agents[0].id); }, [agents]);

  const run = async () => {
    setLoading(true); setErr(null); setReview(null); setAppliedSet(new Set());
    try {
      const r = await authFetch("/api/claude/agent-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, lookback }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setReview(data.review);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };

  const apply = async (i: number, d: any) => {
    setApplying(i);
    try {
      await authFetch("/api/claude/agent-review/apply-directive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, directive: d.directive, priority: d.priority }) });
      setAppliedSet((s) => new Set(s).add(i));
    } finally { setApplying(null); }
  };

  return (
    <FormShell>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Agent"><Select value={agentId} onChange={setAgentId} options={agents.map((a) => ({ value: a.id, label: `${a.name} · ${a.archetype}` }))} /></Field>
        <Field label="Lookback (calls)">
          <Select value={String(lookback)} onChange={(v) => setLookback(parseInt(v))} options={[10, 15, 20, 25, 30].map((n) => ({ value: String(n), label: `Last ${n}` }))} />
        </Field>
      </div>
      <RunButton onClick={run} loading={loading} disabled={disabled || !agentId} label="Run Deep Review" />

      {err && <ErrCard error={err} />}
      {review && (
        <div className="space-y-4 pt-3">
          <div className="rounded-2xl glass-strong border border-white/12 p-6 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-muted mb-2">Overall Grade</div>
              <div className="font-display italic text-7xl text-aurora leading-none">{review.overall_grade}</div>
            </div>
            <Sparkles className="w-10 h-10 text-brand/60" />
          </div>
          <ResultCard title="Executive Summary"><p>{review.executive_summary}</p></ResultCard>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ResultCard title="Strengths">
              <ul className="list-disc list-inside text-emerald-500/90 space-y-1">{review.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
            </ResultCard>
            <ResultCard title="Weaknesses">
              <ul className="list-disc list-inside text-rose-500/90 space-y-1">{review.weaknesses.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
            </ResultCard>
          </div>
          <div className="space-y-2.5">
            <h4 className="text-[10px] uppercase tracking-[0.4em] text-brand">Suggested Directives — One-Click Apply</h4>
            {review.suggested_directives.map((d: any, i: number) => (
              <div key={i} className="rounded-2xl glass border border-white/10 p-4 flex items-start gap-3">
                <div className={cn(
                  "shrink-0 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] mt-0.5",
                  d.priority === "critical" && "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                  d.priority === "high" && "bg-brand-3/15 text-brand-3 border border-brand-3/30",
                  d.priority === "medium" && "bg-brand/15 text-brand border border-brand/30",
                  d.priority === "low" && "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30",
                )}>{d.priority}</div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm text-ink/90">{d.directive}</p>
                  <p className="text-xs text-ink/55 italic">{d.rationale}</p>
                </div>
                <button
                  onClick={() => apply(i, d)} disabled={applying === i || appliedSet.has(i)}
                  className={cn(
                    "shrink-0 px-3 py-2 rounded-full glass border text-[10px] uppercase tracking-[0.3em] transition-all flex items-center gap-1.5",
                    appliedSet.has(i)
                      ? "border-emerald-500/30 text-emerald-500"
                      : "border-brand/30 text-brand hover:bg-brand/10 disabled:opacity-50",
                  )}
                >
                  {applying === i ? <Loader2 className="w-3 h-3 animate-spin" /> : appliedSet.has(i) ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {appliedSet.has(i) ? "Applied" : "Apply"}
                </button>
              </div>
            ))}
          </div>
          {review.suggested_knowledge_entries?.length > 0 && (
            <ResultCard title="Suggested Knowledge Entries">
              <ul className="list-disc list-inside space-y-1">{review.suggested_knowledge_entries.map((k: string, i: number) => <li key={i}>{k}</li>)}</ul>
            </ResultCard>
          )}
          {review.suggested_archetype && <ResultCard title="Suggested Archetype"><p>{review.suggested_archetype}</p></ResultCard>}
          {review.risk_alerts?.length > 0 && (
            <ResultCard title="Risk Alerts">
              <ul className="list-disc list-inside text-rose-500/90 space-y-1">{review.risk_alerts.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
            </ResultCard>
          )}
        </div>
      )}
    </FormShell>
  );
}
