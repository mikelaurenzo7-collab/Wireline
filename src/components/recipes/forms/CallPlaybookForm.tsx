/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useEffect, useState } from "react";
import { FormShell, Field, TextArea, Select, RunButton, ResultCard, ErrCard } from "../shared";
import type { AgentLite } from "../types";
import { useRecipeAsync } from "../useRecipeAsync";

const TECHNIQUE_LABEL: Record<string, string> = {
  acknowledge_redirect: "Acknowledge & Redirect",
  reframe_roi: "Reframe ROI",
  social_proof: "Social Proof",
  feel_felt_found: "Feel / Felt / Found",
  clarifying_question: "Clarifying Question",
};

export function CallPlaybookForm({
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
  const [scenario, setScenario] = useState(initial?.scenario ?? "");
  const {
    loading,
    err,
    result: playbook,
    run,
  } = useRecipeAsync("/api/claude/call-playbook", "playbook");

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const submit = () => run({ agentId, scenario });

  return (
    <FormShell>
      <Field label="Agent">
        <Select
          value={agentId}
          onChange={setAgentId}
          options={agents.map((a) => ({ value: a.id, label: a.name }))}
        />
      </Field>
      <Field label="Scenario" hint="What type of call should this playbook handle?">
        <TextArea
          value={scenario}
          onChange={setScenario}
          rows={3}
          placeholder="An inbound caller asking about pricing and whether we can match a competitor's quote."
        />
      </Field>
      <RunButton
        onClick={submit}
        loading={loading}
        disabled={disabled || !agentId || !scenario}
        label="Build Playbook"
      />

      {err && <ErrCard error={err} />}

      {playbook && (
        <div className="space-y-4 pt-3">
          <ResultCard title="Opening Hook" copyText={playbook.opening_hook}>
            <p className="text-foreground/90 italic text-sm leading-relaxed">
              "{playbook.opening_hook}"
            </p>
            {playbook.purpose_statement && (
              <p className="text-foreground/70 text-sm mt-2">
                Then: "{playbook.purpose_statement}"
              </p>
            )}
          </ResultCard>

          {playbook.discovery_questions?.length > 0 && (
            <ResultCard title="Discovery Questions">
              <div className="space-y-3">
                {playbook.discovery_questions.map((q: any, i: number) => (
                  <div key={i} className="border-l-2 border-brand/40 pl-3">
                    <p className="text-foreground/90 text-sm font-medium">
                      {i + 1}. "{q.question}"
                    </p>
                    <p className="text-muted text-[length:var(--wireline-typography-overline-size)] mt-0.5">
                      Intent: {q.intent}
                    </p>
                    {q.follow_up && (
                      <p className="text-foreground/70 text-[length:var(--wireline-typography-overline-size)] mt-1">
                        Follow-up: "{q.follow_up}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ResultCard>
          )}

          <ResultCard title="Value Proposition Script" copyText={playbook.value_prop_script}>
            <p className="text-foreground/90 text-sm leading-relaxed italic">
              "{playbook.value_prop_script}"
            </p>
          </ResultCard>

          {playbook.objection_handlers?.length > 0 && (
            <ResultCard title="Objection Handlers">
              <div className="space-y-4">
                {playbook.objection_handlers.map((o: any, i: number) => (
                  <div key={i} className="rounded-md bg-white/5 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-foreground/70 text-xs italic">"{o.objection}"</p>
                      <span className="shrink-0 px-2 py-0.5 rounded-full wl-label bg-amber-500/15 text-amber-500 border border-amber-500/30">
                        {TECHNIQUE_LABEL[o.technique] ?? o.technique}
                      </span>
                    </div>
                    <p className="text-foreground/90 text-sm">"{o.response}"</p>
                  </div>
                ))}
              </div>
            </ResultCard>
          )}

          {playbook.closing_variants?.length > 0 && (
            <ResultCard title="Closing Variants">
              <div className="space-y-3">
                {playbook.closing_variants.map((c: any, i: number) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-full wl-label wl-status-success border wl-text-success">
                      {c.style?.replace(/_/g, " ")}
                    </span>
                    <p className="text-foreground/90 text-sm italic">"{c.script}"</p>
                  </div>
                ))}
              </div>
            </ResultCard>
          )}

          <ResultCard title="Voicemail Script" copyText={playbook.voicemail_script}>
            <p className="text-foreground/90 text-sm leading-relaxed italic">
              "{playbook.voicemail_script}"
            </p>
          </ResultCard>

          {playbook.success_criteria && (
            <ResultCard title="Success Criteria">
              <p className="wl-text-success/90 text-sm">{playbook.success_criteria}</p>
            </ResultCard>
          )}
        </div>
      )}
    </FormShell>
  );
}
