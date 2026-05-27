/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useState } from "react";
import { ArrowRight, Check, Hammer, Loader2 } from "lucide-react";
import { authFetch } from "../../../lib/api";
import { FormShell, Field, TextInput, TextArea, RunButton, ResultCard, ErrCard } from "../shared";

export function AgentForgeForm({ initial, disabled }: { initial?: any; disabled: boolean }) {
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial?.websiteUrl ?? "");
  const [voicePref, setVoicePref] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [design, setDesign] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  const run = async () => {
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
    } catch (e: any) {
      setErr(e.message);
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
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <FormShell>
      <Field label="Goal" hint="Describe the agent's job in one sentence.">
        <TextArea
          value={goal}
          onChange={setGoal}
          rows={3}
          placeholder="A friendly front-desk agent that books HVAC service appointments and answers basic pricing questions."
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Company Name">
          <TextInput value={companyName} onChange={setCompanyName} placeholder="Acme HVAC" />
        </Field>
        <Field label="Industry">
          <TextInput value={industry} onChange={setIndustry} placeholder="Home services" />
        </Field>
        <Field label="Website (optional)">
          <TextInput value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://acme.co" />
        </Field>
        <Field label="Voice Preference (optional)">
          <TextInput
            value={voicePref}
            onChange={setVoicePref}
            placeholder="Warm, mid-range female voice"
          />
        </Field>
      </div>
      <RunButton onClick={run} loading={loading} disabled={disabled || !goal} label="Forge Agent" />

      {err && <ErrCard error={err} />}
      {design && (
        <div className="space-y-4 pt-3">
          {createdAgentId && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-emerald-500 text-sm flex items-center gap-3">
              <Check className="w-4 h-4" />
              Agent created. Open Fleet Topology to assign a phone number and voice.
            </div>
          )}
          <div className="rounded-2xl glass-strong border border-white/12 p-6 space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display italic text-4xl text-aurora leading-none">
                {design.name}
              </h3>
              <span className="px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.3em] bg-brand/15 text-brand border border-brand/30">
                {design.archetype}
              </span>
            </div>
            <p className="text-ink/80 text-sm italic">"{design.first_message}"</p>
            {design.suggested_voice_tone && (
              <p className="text-[11px] uppercase tracking-[0.3em] text-muted">
                Voice tone · {design.suggested_voice_tone}
              </p>
            )}
          </div>
          <ResultCard title="Personality Block" copyText={design.personality_block}>
            <pre className="whitespace-pre-wrap font-sans">{design.personality_block}</pre>
          </ResultCard>
          <ResultCard title="Directives">
            <ul className="space-y-2">
              {design.directives.map((d: any, i: number) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] bg-brand/15 text-brand border border-brand/30">
                    P{d.priority}
                  </span>
                  <span className="text-ink/85">{d.content}</span>
                </li>
              ))}
            </ul>
          </ResultCard>
          <ResultCard title="Seed Knowledge">
            <ul className="list-disc list-inside text-ink/85 space-y-1">
              {design.seed_knowledge.map((k: string, i: number) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </ResultCard>
          {design.success_metrics?.length > 0 && (
            <ResultCard title="Success Metrics">
              <ul className="list-disc list-inside text-emerald-500/90 space-y-1">
                {design.success_metrics.map((m: string, i: number) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </ResultCard>
          )}
          {design.reasoning && (
            <ResultCard title="Reasoning">
              <p className="text-ink/65">{design.reasoning}</p>
            </ResultCard>
          )}

          {!createdAgentId && (
            <button
              onClick={create}
              disabled={creating}
              className="disabled:opacity-50 disabled:cursor-not-allowed brutal-btn w-full !py-4 !text-[12px] !tracking-[0.32em]"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating Agent…
                </>
              ) : (
                <>
                  <Hammer className="w-4 h-4" /> Forge & Deploy <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </FormShell>
  );
}
