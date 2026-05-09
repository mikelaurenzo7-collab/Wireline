import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  Sparkles, Hammer, Globe, Phone, Mic, Check, ArrowRight,
  Waves, Loader2, PlayCircle, PhoneCall, ExternalLink
} from "lucide-react";
import { authFetch } from "../lib/api";
import { ClaudeRecipeButton } from "./ClaudeRecipes";

interface ProgressData {
  agents: number;
  knowledge: number;
  numbers: number;
  calls: number;
}

const STEPS = [
  {
    id: "agent",
    title: "Create your first agent",
    body: "Describe what the agent should do in one sentence. Wireline AI will generate the name, persona, directives, and starter knowledge automatically.",
    icon: Hammer,
    accent: "#0AC8D4",
    badge: "~30 seconds",
  },
  {
    id: "knowledge",
    title: "Add your business knowledge",
    body: "Paste your website URL. Wireline AI will extract services, pricing, hours, and policies into structured facts you can apply in one click.",
    icon: Globe,
    accent: "#9B59F5",
    badge: "Instant ingest",
  },
  {
    id: "number",
    title: "Connect a phone number",
    body: "Connect a phone number through your phone provider so inbound callers can reach your agent around the clock.",
    icon: Phone,
    accent: "#E040C0",
    badge: "1 minute",
  },
  {
    id: "call",
    title: "Run a live test call",
    body: "Start a live voice test with your agent directly from your browser. No phone is required.",
    icon: Mic,
    accent: "#10B981",
    badge: "Try it now",
  },
] as const;

export default function OnboardingQuickstart() {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [a, k, n, c] = await Promise.all([
          authFetch("/api/agents").then((r) => r.json()).then((d) => d.agents?.length ?? 0).catch(() => 0),
          authFetch("/api/agent-config/default-agent").then((r) => r.json()).then((d) => d.knowledge?.length ?? 0).catch(() => 0),
          authFetch("/api/phone-numbers").then((r) => r.json()).then((d) => d.numbers?.length ?? 0).catch(() => 0),
          authFetch("/api/calls?limit=1").then((r) => r.json()).then((d) => d.total ?? 0).catch(() => 0),
        ]);
        setProgress({ agents: a, knowledge: k, numbers: n, calls: c });
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading || !progress) return (
    <div className="space-y-3 animate-pulse px-1">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-white/8 shrink-0" />
          <div className="flex-1 h-4 rounded-lg bg-white/8" style={{ width: `${60 + i * 10}%` }} />
        </div>
      ))}
    </div>
  );

  const completion = {
    agent:     progress.agents > 0,
    knowledge: progress.knowledge > 0,
    number:    progress.numbers > 0,
    call:      progress.calls > 0,
  };
  const completedCount = Object.values(completion).filter(Boolean).length;
  // Fully onboarded — don't render.
  if (completedCount === STEPS.length) return null;
  const completionPct = Math.round((completedCount / STEPS.length) * 100);

  // Find the first incomplete step so we can spotlight it.
  const activeStepId = STEPS.find(s => !completion[s.id as keyof typeof completion])?.id ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="relative aurora-ring rounded-3xl"
    >
      <div className="relative rounded-3xl glass-strong overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-30 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #0AC8D4, transparent)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #E040C0, transparent)" }} />

        {/* Header */}
        <div className="relative z-10 px-7 md:px-10 pt-8 pb-6 border-b border-white/8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5, #E040C0)" }}>
                <Waves className="w-6 h-6 text-paper" strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-brand flex items-center gap-2">
                  <Sparkles className="w-3 h-3" /> Get started in 4 steps
                </div>
                <h2 className="font-display italic text-3xl md:text-4xl text-ink leading-tight mt-1">Welcome to WIRELINE</h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.3em] text-muted">{completedCount} / {STEPS.length} done</span>
              <div className="w-32 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${completionPct}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, #0AC8D4, #9B59F5, #E040C0)" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="relative z-10 p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {STEPS.map((s, i) => (
            <Step
              key={s.id}
              step={s}
              index={i}
              done={completion[s.id as keyof typeof completion]}
              isActive={s.id === activeStepId}
            />
          ))}
        </div>

        {/* Demo call CTA strip */}
        {!completion.call && completion.agent && (
          <div className="relative z-10 px-7 md:px-10 pb-7 pt-0">
            <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1">
                <PhoneCall className="w-5 h-5 text-brand shrink-0" />
                <div>
                  <p className="text-sm font-medium text-ink leading-tight">Your agent is ready to talk</p>
                  <p className="text-xs text-ink/50 mt-0.5">Open the dashboard and select <strong>Start Test Call</strong> to place a live browser test.</p>
                </div>
              </div>
              <Link
                to="/"
                className="shrink-0 px-4 py-2.5 rounded-full glass border border-brand/40 text-[11px] uppercase tracking-[0.3em] text-brand hover:bg-brand/10 hover:border-brand/60 transition-all flex items-center gap-2"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                Open Dashboard
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

const Step: React.FC<{
  step: typeof STEPS[number];
  index: number;
  done: boolean;
  isActive: boolean;
}> = ({ step, index, done, isActive }) => {
  const Icon = step.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index }}
      className="relative aurora-ring rounded-2xl"
    >
      <div className={`relative rounded-2xl glass border p-5 overflow-hidden h-full flex flex-col gap-4 transition-all ${done ? "border-emerald-500/40" : isActive ? "border-brand/30" : "border-white/10"}`}>
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${step.accent}, transparent)` }} />
        <div className="relative z-10 flex items-start justify-between">
          <div className={`w-11 h-11 rounded-2xl glass border flex items-center justify-center transition-all ${done ? "border-emerald-500/40 text-emerald-500" : isActive ? "border-brand/40" : "border-white/10"}`} style={!done ? { color: step.accent } : {}}>
            {done ? <Check className="w-5 h-5" strokeWidth={2.5} /> : <Icon className="w-5 h-5" />}
          </div>
          <div className="flex items-center gap-2">
            {!done && isActive && (
              <span className="text-[9px] uppercase tracking-[0.3em] text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">Next</span>
            )}
            <span className="text-[9px] uppercase tracking-[0.25em] text-muted">{step.badge}</span>
          </div>
        </div>
        <div className="relative z-10 flex-1">
          <h3 className="font-display italic text-2xl text-ink leading-tight mb-1.5">{step.title}</h3>
          <p className="text-sm text-ink/60 leading-relaxed">{step.body}</p>
        </div>
        <div className="relative z-10 flex items-center gap-2 mt-auto">
          {done ? (
            <div className="px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[10px] uppercase tracking-[0.3em] flex items-center gap-1.5">
              <Check className="w-3 h-3" /> Complete
            </div>
          ) : (
            <StepCTA stepId={step.id} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StepCTA({ stepId }: { stepId: string }) {
  if (stepId === "agent")     return <ClaudeRecipeButton recipe="agent-forge" label="Forge with Claude" />;
  if (stepId === "knowledge") return <ClaudeRecipeButton recipe="knowledge-from-url" label="Ingest from URL" />;
  if (stepId === "number")    return <CTAButton to="/agents" label="Connect a Number" />;
  if (stepId === "call")      return <CTAButton to="/" label="Start Test Call" icon={<PlayCircle className="w-3.5 h-3.5" />} />;
  return null;
}

function CTAButton({ to, label, icon }: { to: string; label: string; icon?: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-4 py-2.5 rounded-full glass border border-brand/30 text-[11px] uppercase tracking-[0.3em] text-brand hover:bg-brand/10 hover:border-brand/60 transition-all flex items-center gap-2"
    >
      {icon ?? <Sparkles className="w-3.5 h-3.5" />}
      {label}
      <ArrowRight className="w-3.5 h-3.5" />
    </Link>
  );
}

