import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { FormShell, Field, TextArea, Select, RunButton, ResultCard, ErrCard } from "../shared";
import type { AgentLite } from "../types";
import { Checkbox } from "../../ui/shadcn/Checkbox";
import { useRecipeAsync } from "../useRecipeAsync";

export function PersonaCloneForm({
  agents,
  agentId: initAgent,
  disabled,
}: {
  agents: AgentLite[];
  agentId?: string;
  disabled: boolean;
}) {
  const [agentId, setAgentId] = useState(initAgent ?? "");
  const [description, setDescription] = useState("");
  const [samples, setSamples] = useState<string[]>([""]);
  const [apply, setApply] = useState(!!initAgent);
  const { loading, err, result, run } = useRecipeAsync("/api/claude/persona-clone");

  const submit = () => {
    const cleaned = samples.map((s) => s.trim()).filter(Boolean);
    run({ description, samples: cleaned, agentId, applyToAgent: apply });
  };

  return (
    <FormShell>
      <Field label="Persona Description" hint="Who are we cloning? Role, tone, attitude.">
        <TextArea
          value={description}
          onChange={setDescription}
          rows={2}
          placeholder="Senior account exec — direct, witty, secretly very kind."
        />
      </Field>
      <Field
        label="Sample Messages"
        hint="Paste 2–5 actual messages, calls, or emails from this person."
      >
        <div className="space-y-2">
          {samples.map((s, i) => (
            <div key={i} className="flex gap-2">
              <TextArea
                value={s}
                onChange={(v: string) => setSamples((arr) => arr.map((x, j) => (j === i ? v : x)))}
                rows={3}
                placeholder={`Sample ${i + 1}`}
              />
              {samples.length > 1 && (
                <button
                  onClick={() => setSamples((arr) => arr.filter((_, j) => j !== i))}
                  className="w-10 h-10 rounded-xl glass border border-white/10 flex items-center justify-center text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0 self-start mt-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {samples.length < 8 && (
            <button
              onClick={() => setSamples((arr) => [...arr, ""])}
              className="w-full py-2 rounded-xl glass border border-dashed border-white/10 text-[11px] uppercase tracking-[0.3em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" /> Add Sample
            </button>
          )}
        </div>
      </Field>

      <Field label="Apply to Agent (optional)">
        <Select
          value={agentId}
          onChange={setAgentId}
          options={[
            { value: "", label: "(don't apply — preview only)" },
            ...agents.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
      </Field>
      {agentId && (
        <label className="flex items-center gap-3 cursor-pointer text-sm text-ink/80">
          <Checkbox
            checked={apply}
            onChange={(e) => setApply(e.target.checked)}
            className="w-4 h-4 rounded border-black/20 bg-black/5 accent-brand"
          />
          Save persona block to{" "}
          <span className="text-brand">{agents.find((a) => a.id === agentId)?.name}</span>
        </label>
      )}
      <RunButton
        onClick={submit}
        loading={loading}
        disabled={disabled || samples.every((s) => !s.trim())}
        label="Compile Persona"
      />

      {err && <ErrCard error={err} />}
      {result?.persona && (
        <div className="space-y-3 pt-3">
          {result.applied && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-emerald-500 text-xs flex items-center gap-2">
              <Check className="w-3.5 h-3.5" /> Persona saved to agent — voice + email replies will
              use it on next call.
            </div>
          )}
          <ResultCard title="Persona Block" copyText={result.persona.persona_block}>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {result.persona.persona_block}
            </pre>
          </ResultCard>
          <ResultCard title="Tone Summary">
            <p>{result.persona.tone_summary}</p>
          </ResultCard>
          {result.persona.signature_phrases?.length > 0 && (
            <ResultCard title="Signature Phrases">
              <ul className="list-disc list-inside space-y-1">
                {result.persona.signature_phrases.map((p: string, i: number) => (
                  <li key={i} className="italic">
                    "{p}"
                  </li>
                ))}
              </ul>
            </ResultCard>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ResultCard title="Do">
              <ul className="list-disc list-inside text-emerald-500/90 space-y-1">
                {result.persona.do_rules.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </ResultCard>
            <ResultCard title="Don't">
              <ul className="list-disc list-inside text-rose-500/90 space-y-1">
                {result.persona.dont_rules.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </ResultCard>
          </div>
        </div>
      )}
    </FormShell>
  );
}
