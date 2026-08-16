/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useState } from "react";
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

export function ColdEmailForm({
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
  const [agentId, setAgentId] = useState(initAgent || "");
  const [form, setForm] = useState({
    leadName: initial?.leadName ?? "",
    leadCompany: initial?.leadCompany ?? "",
    leadRole: initial?.leadRole ?? "",
    leadHook: initial?.leadHook ?? "",
    ourCompany: initial?.ourCompany ?? "",
    valueProp: initial?.valueProp ?? "",
    tone: "professional",
    callToAction: initial?.callToAction ?? "",
  });
  const { loading, err, result: email, run } = useRecipeAsync("/api/claude/cold-email", "email");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => run({ ...form, agentId: agentId || undefined });

  return (
    <FormShell>
      <Field label="Sending Agent" hint="Optional. Applies the agent's role lens to the email.">
        <Select
          value={agentId}
          onChange={setAgentId}
          options={[
            { value: "", label: "(no agent, generic copy)" },
            ...agents.map((a) => ({ value: a.id, label: `${a.name} · ${a.archetype}` })),
          ]}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Lead Name">
          <TextInput
            value={form.leadName}
            onChange={(v: string) => set("leadName", v)}
            placeholder="Avery Tang"
          />
        </Field>
        <Field label="Lead Role">
          <TextInput
            value={form.leadRole}
            onChange={(v: string) => set("leadRole", v)}
            placeholder="VP of Operations"
          />
        </Field>
        <Field label="Lead Company">
          <TextInput
            value={form.leadCompany}
            onChange={(v: string) => set("leadCompany", v)}
            placeholder="Acme Co"
          />
        </Field>
        <Field label="Tone">
          <Select
            value={form.tone}
            onChange={(v) => set("tone", v)}
            options={[
              { value: "warm", label: "Warm" },
              { value: "professional", label: "Professional" },
              { value: "punchy", label: "Punchy" },
              { value: "consultative", label: "Consultative" },
            ]}
          />
        </Field>
      </div>
      <Field
        label="Lead Hook"
        hint="Specific reason to reach out: recent news, mutual contact, etc."
      >
        <TextArea
          value={form.leadHook}
          onChange={(v: string) => set("leadHook", v)}
          rows={2}
          placeholder="Just announced Series B for international expansion."
        />
      </Field>
      <Field label="Our Company">
        <TextInput
          value={form.ourCompany}
          onChange={(v: string) => set("ourCompany", v)}
          placeholder="Wireline"
        />
      </Field>
      <Field label="Value Prop">
        <TextArea
          value={form.valueProp}
          onChange={(v: string) => set("valueProp", v)}
          rows={2}
          placeholder="Carrier-grade voice automation that scales with your agents."
        />
      </Field>
      <Field label="Call to Action">
        <TextInput
          value={form.callToAction}
          onChange={(v: string) => set("callToAction", v)}
          placeholder="Ask for a 15-min intro call next week."
        />
      </Field>
      <RunButton
        onClick={submit}
        loading={loading}
        disabled={disabled || !form.valueProp || !form.ourCompany}
        label="Compose Email"
      />

      {err && <ErrCard error={err} />}
      {email && (
        <div className="space-y-3 pt-3">
          <ResultCard title="Subject" copyText={email.subject}>
            <p className="font-display text-xl">{email.subject}</p>
          </ResultCard>
          <ResultCard title="Body" copyText={email.body}>
            <pre className="whitespace-pre-wrap font-sans">{email.body}</pre>
          </ResultCard>
          {email.personalization_notes?.length > 0 && (
            <ResultCard title="Personalization Notes">
              <ul className="list-disc list-inside text-foreground/65 space-y-1">
                {email.personalization_notes.map((n: string, i: number) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </ResultCard>
          )}
          {email.suggested_followup_date && (
            <ResultCard title="Suggested Follow-up">
              <p>{email.suggested_followup_date}</p>
            </ResultCard>
          )}
        </div>
      )}
    </FormShell>
  );
}
