import { useState } from "react";
import { Hammer, Loader2, Check, ArrowRight } from "lucide-react";
import { ShadButton } from "../../ui/shadcn/ShadButton";
import { authFetch } from "../../../lib/api";
import { Field, FormShell, ResultCard, TextArea, TextInput, ErrCard, RunButton } from "../shared";

interface AgentWireInitial {
  goal?: string;
  companyName?: string;
  industry?: string;
  websiteUrl?: string;
  voicePreference?: string;
}

interface ForgedAgentDesign {
  name: string;
  archetype: string;
  first_message: string;
  suggested_voice_tone?: string;
  personality_block: string;
  directives: { priority: number; content: string }[];
  seed_knowledge: string[];
  success_metrics?: string[];
  reasoning?: string;
}

export function AgentWireForm({
  initial,
  disabled,
}: {
  initial?: AgentWireInitial;
  disabled?: boolean;
}) {
  const [goal, setGoal] = useState(initial?.goal || "");
  const [companyName, setCompanyName] = useState(initial?.companyName || "");
  const [industry, setIndustry] = useState(initial?.industry || "");
  const [websiteUrl, setWebsiteUrl] = useState(initial?.websiteUrl || "");
  const [voicePref, setVoicePref] = useState(initial?.voicePreference || "");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [design, setDesign] = useState<ForgedAgentDesign | null>(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!goal) return;
    setLoading(true);
    setErr(null);
    setDesign(null);
    setCreatedAgentId(null);
    try {
      const r = await authFetch("/api/claude/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          companyName,
          industry,
          websiteUrl,
          voicePreference: voicePref,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setDesign(data.design);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!design) return;
    setCreating(true);
    setErr(null);
    try {
      const r = await authFetch("/api/claude/forge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design, websiteUrl }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setCreatedAgentId(data.agentId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <FormShell>
      <Field label="Agent job" hint="What should it do?">
        <TextArea
          value={goal}
          onChange={setGoal}
          rows={3}
          placeholder="Call warm leads, qualify interest, book the next step, and log the outcome."
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Company">
          <TextInput value={companyName} onChange={setCompanyName} placeholder="Acme Cloud" />
        </Field>
        <Field label="Use case">
          <TextInput
            value={industry}
            onChange={setIndustry}
            placeholder="Sales follow-up, billing recovery, scheduling, support overflow…"
          />
        </Field>
        <Field label="Website (optional)">
          <TextInput value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://acme.co" />
        </Field>
        <Field label="Voice (optional)">
          <TextInput value={voicePref} onChange={setVoicePref} placeholder="Warm, clear, calm" />
        </Field>
      </div>
      <RunButton onClick={run} loading={loading} disabled={disabled || !goal} label="Draft agent" />

      {err && <ErrCard error={err} />}
      {design && (
        <div className="space-y-4 pt-3">
          {createdAgentId && (
            <div className="rounded-md wl-status-success border p-4 wl-text-success text-sm flex items-center gap-3">
              <Check className="w-4 h-4" />
              Draft saved. Next: add a number, voice, and launch rules.
            </div>
          )}
          <div className="rounded-md wl-panel-elevated border border-white/12 p-6 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-4xl text-brand-display leading-none">
                {design.name}
              </h3>
              <span className="px-3 py-1 rounded-full wl-label bg-brand/15 text-brand border border-brand/30">
                {design.archetype}
              </span>
            </div>
            <p className="text-foreground/80 text-sm italic">"{design.first_message}"</p>
            {design.suggested_voice_tone && (
              <p className="text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.3em] text-muted">
                Voice · {design.suggested_voice_tone}
              </p>
            )}
          </div>
          <ResultCard title="Style" copyText={design.personality_block}>
            <pre className="whitespace-pre-wrap font-sans">{design.personality_block}</pre>
          </ResultCard>
          <ResultCard title="Rules">
            <ul className="space-y-2">
              {design.directives.map((d, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 px-2 py-0.5 rounded-full wl-label bg-brand/15 text-brand border border-brand/30">
                    P{d.priority}
                  </span>
                  <span className="text-foreground/85">{d.content}</span>
                </li>
              ))}
            </ul>
          </ResultCard>
          <ResultCard title="What it knows">
            <ul className="list-disc list-inside text-foreground/85 space-y-1">
              {design.seed_knowledge.map((k: string, i: number) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </ResultCard>
          {design.success_metrics && design.success_metrics.length > 0 && (
            <ResultCard title="Goals">
              <ul className="list-disc list-inside wl-text-success space-y-1">
                {design.success_metrics.map((m: string, i: number) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </ResultCard>
          )}
          {design.reasoning && (
            <ResultCard title="Why this fits">
              <p className="text-foreground/65">{design.reasoning}</p>
            </ResultCard>
          )}

          {!createdAgentId && (
            <ShadButton
              type="button"
              disableAnimations
              variant="editorial"
              onClick={create}
              disabled={creating}
              className="w-full !py-4 !text-[length:var(--wireline-typography-caption-size)] !tracking-[0.32em]"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Hammer className="w-4 h-4" /> Save draft <ArrowRight className="w-4 h-4" />
                </>
              )}
            </ShadButton>
          )}
        </div>
      )}
    </FormShell>
  );
}
