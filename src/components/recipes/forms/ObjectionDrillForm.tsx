/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useEffect, useState } from "react";
import { cn } from "../../../lib/utils";
import { FormShell, Field, TextInput, Select, RunButton, ErrCard } from "../shared";
import type { AgentLite } from "../types";
import { useRecipeAsync } from "../useRecipeAsync";

export function ObjectionDrillForm({
  agents,
  agentId: initAgent,
  initial,
  disabled,
}: {
  agents: AgentLite[];
  agentId?: string;
  initial?: any;
  disabled: boolean;
}) {
  const [agentId, setAgentId] = useState(initAgent || agents[0]?.id || "");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [count, setCount] = useState(5);
  const { loading, err, result, run } = useRecipeAsync("/api/claude/objection-drill");

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const submit = () => run({ agentId, topic, count });

  return (
    <FormShell>
      <Field label="Agent">
        <Select
          value={agentId}
          onChange={setAgentId}
          options={[
            { value: "", label: "(no agent)" },
            ...agents.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
      </Field>
      <Field label="Topic" hint="What kind of objection scenarios do you want to drill?">
        <TextInput
          value={topic}
          onChange={setTopic}
          placeholder="Pricing pushback on enterprise tier"
        />
      </Field>
      <Field label="Count">
        <Select
          value={String(count)}
          onChange={(v) => setCount(parseInt(v))}
          options={[3, 5, 7, 10].map((n) => ({ value: String(n), label: `${n} drills` }))}
        />
      </Field>
      <RunButton
        onClick={submit}
        loading={loading}
        disabled={disabled || !topic}
        label="Compose Drills"
      />

      {err && <ErrCard error={err} />}
      {result?.scenarios && (
        <div className="space-y-3 pt-3">
          {result.scenarios.map((s: any, i: number) => (
            <div key={i} className="rounded-md wl-panel border border-white/10 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-xl">{s.title}</h4>
                <span
                  className={cn(
                    "px-2.5 py-0.5 rounded-full wl-label",
                    s.difficulty === "easy" && "wl-status-success border wl-text-success",
                    s.difficulty === "medium" && "bg-brand/15 text-brand border border-brand/30",
                    s.difficulty === "hard" &&
                      "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                  )}
                >
                  {s.difficulty}
                </span>
              </div>
              <div>
                <div className="wl-label text-rose-500 mb-1">Prospect</div>
                <p className="text-foreground/90 italic">"{s.prospect_says}"</p>
              </div>
              <div>
                <div className="wl-label text-brand mb-1">Recommended Response</div>
                <p className="text-foreground/90">{s.recommended_response}</p>
              </div>
              <div className="pt-2 border-t border-white/5">
                <div className="wl-label-muted mb-1">Coaching Note</div>
                <p className="text-foreground/70 text-xs leading-relaxed">{s.coaching_note}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </FormShell>
  );
}
