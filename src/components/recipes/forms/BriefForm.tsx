/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useEffect, useState } from "react";
import {
  FormShell,
  Field,
  TextInput,
  TextArea,
  Select,
  RunButton,
  ResultCard,
  ErrCard,
} from "../shared";
import type { AgentLite } from "../types";
import { useRecipeAsync } from "../useRecipeAsync";

export function BriefForm({
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
  const [name, setName] = useState(initial?.customerName ?? "");
  const [number, setNumber] = useState(initial?.customerNumber ?? "");
  const [reason, setReason] = useState(initial?.reasonForCall ?? "");
  const [past, setPast] = useState(initial?.pastInteractionSummary ?? "");
  const { loading, err, result: brief, run } = useRecipeAsync("/api/claude/brief", "brief");

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const submit = () =>
    run({
      agentId,
      customerName: name,
      customerNumber: number,
      reasonForCall: reason,
      pastInteractionSummary: past,
    });

  return (
    <FormShell>
      <Field label="Agent">
        <Select
          value={agentId}
          onChange={setAgentId}
          options={[
            { value: "", label: "(no agent, generic brief)" },
            ...agents.map((a) => ({ value: a.id, label: `${a.name} · ${a.archetype}` })),
          ]}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Customer Name">
          <TextInput value={name} onChange={setName} placeholder="Jordan Pike" />
        </Field>
        <Field label="Customer Number">
          <TextInput value={number} onChange={setNumber} placeholder="+1 415 555 0142" />
        </Field>
      </div>
      <Field label="Reason for Call">
        <TextArea
          value={reason}
          onChange={setReason}
          placeholder="Following up on demo request from yesterday."
          rows={3}
        />
      </Field>
      <Field label="Past Interaction" hint="Optional. Paste the last interaction or notes.">
        <TextArea
          value={past}
          onChange={setPast}
          placeholder="Last call: explored pricing, hesitant on commitment length."
          rows={3}
        />
      </Field>
      <RunButton
        onClick={submit}
        loading={loading}
        disabled={disabled || !reason}
        label="Generate Brief"
      />

      {err && <ErrCard error={err} />}
      {brief && (
        <div className="space-y-4 pt-3">
          <ResultCard title="Opening Line" copyText={brief.opening_line}>
            <p>"{brief.opening_line}"</p>
          </ResultCard>
          <ResultCard title="Intent Hypothesis">
            <p>{brief.intent_hypothesis}</p>
          </ResultCard>
          <ResultCard title="Key Questions">
            <ol className="list-decimal list-inside space-y-1.5">
              {brief.key_questions.map((q: string, i: number) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </ResultCard>
          <ResultCard title="Objections to Anticipate">
            <ul className="space-y-3">
              {brief.objections_to_anticipate.map((o: any, i: number) => (
                <li key={i} className="space-y-1">
                  <div className="text-rose-500 text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.25em]">
                    "{o.objection}"
                  </div>
                  <div className="text-foreground/85">→ {o.response}</div>
                </li>
              ))}
            </ul>
          </ResultCard>
          <ResultCard title="Value Props">
            <ul className="list-disc list-inside space-y-1">
              {brief.value_props.map((v: string, i: number) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </ResultCard>
          <ResultCard title="Closing Strategy">
            <p>{brief.closing_strategy}</p>
          </ResultCard>
          {brief.risk_flags?.length > 0 && (
            <ResultCard title="Risk Flags">
              <ul className="list-disc list-inside text-rose-500 space-y-1">
                {brief.risk_flags.map((f: string, i: number) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </ResultCard>
          )}
        </div>
      )}
    </FormShell>
  );
}
