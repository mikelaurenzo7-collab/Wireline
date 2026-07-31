/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payload bridges loosely typed agent API. */
import { useState } from "react";
import { Building2, ExternalLink } from "lucide-react";
import {
  FormShell,
  Field,
  TextInput,
  TextArea,
  RunButton,
  ResultCard,
  ErrCard,
  Stat,
} from "../shared";
import { useRecipeAsync } from "../useRecipeAsync";
import { BRAND } from "../../../constants/brand-colors";

export function EnrichLeadForm({ initial, disabled }: { initial?: any; disabled: boolean }) {
  const [name, setName] = useState(initial?.customerName ?? "");
  const [number, setNumber] = useState(initial?.customerNumber ?? "");
  const [context, setContext] = useState(initial?.context ?? "");
  const [industryHint, setIndustryHint] = useState("");
  const {
    loading,
    err,
    result: enrichment,
    run,
  } = useRecipeAsync("/api/claude/enrich-lead", "enrichment");

  const submit = () =>
    run({ customer_number: number, customer_name: name, context, industry_hint: industryHint });

  const confidenceAccent =
    enrichment?.research_confidence === "high"
      ? BRAND.colors.primary
      : enrichment?.research_confidence === "medium"
        ? BRAND.colors.outlineVariant
        : BRAND.colors.primary;

  return (
    <FormShell>
      <p className="text-[length:var(--wireline-typography-overline-size)] text-foreground/65 leading-relaxed">
        Wireline AI runs up to 5 web searches to identify who's calling and where they work. Use the
        Account Holder context to narrow the search — names + companies on a phone are usually too
        generic alone.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Customer Name" hint="Optional but big lift in match quality.">
          <TextInput value={name} onChange={setName} placeholder="Jordan Pike" />
        </Field>
        <Field label="Phone Number" hint="Used for region/area-code context.">
          <TextInput value={number} onChange={setNumber} placeholder="+1 415 555 0142" />
        </Field>
      </div>
      <Field
        label="Account Holder Context"
        hint="What do you already know? Source of the lead, the company they mentioned, etc."
      >
        <TextArea
          value={context}
          onChange={setContext}
          placeholder="Filled out demo form. Mentioned 'we use Salesforce' in the comments."
          rows={3}
        />
      </Field>
      <Field label="Industry Hint" hint="Optional. Speeds Wireline AI up by narrowing the search.">
        <TextInput
          value={industryHint}
          onChange={setIndustryHint}
          placeholder="B2B SaaS · Healthcare · Real estate"
        />
      </Field>
      <RunButton
        onClick={submit}
        loading={loading}
        disabled={disabled || !number}
        label="Research Lead"
      />

      {err && <ErrCard error={err} />}
      {enrichment && (
        <div className="space-y-4 pt-3">
          <div className="rounded-md wl-panel-elevated border border-white/12 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center medallion-accent-face"
                  data-accent={confidenceAccent}
                >
                  <Building2 className="w-4 h-4 text-paper" />
                </div>
                <div>
                  <div
                    className="wl-label wl-confidence-text"
                    data-confidence-color={confidenceAccent}
                  >
                    {enrichment.research_confidence} confidence
                  </div>
                  <div className="text-sm text-foreground/85 mt-0.5">
                    {enrichment.identity_summary}
                  </div>
                </div>
              </div>
            </div>
            {(enrichment.company_name ||
              enrichment.role ||
              enrichment.industry ||
              enrichment.company_size) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-white/8">
                {enrichment.company_name && (
                  <Stat label="Company" value={enrichment.company_name} />
                )}
                {enrichment.role && <Stat label="Role" value={enrichment.role} />}
                {enrichment.industry && <Stat label="Industry" value={enrichment.industry} />}
                {enrichment.company_size && <Stat label="Size" value={enrichment.company_size} />}
              </div>
            )}
          </div>

          {enrichment.recent_signals?.length > 0 && (
            <ResultCard title="Recent Signals">
              <ul className="list-disc list-inside space-y-1">
                {enrichment.recent_signals.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </ResultCard>
          )}

          <ResultCard title="Conversation Hooks">
            <ul className="list-disc list-inside space-y-1">
              {enrichment.conversation_hooks.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </ResultCard>

          {enrichment.likely_objections?.length > 0 && (
            <ResultCard title="Likely Objections">
              <ul className="space-y-1.5 text-rose-500/90">
                {enrichment.likely_objections.map((s: string, i: number) => (
                  <li key={i}>"{s}"</li>
                ))}
              </ul>
            </ResultCard>
          )}

          {enrichment.sources?.length > 0 && (
            <div className="rounded-md wl-panel border border-white/10 p-4">
              <div className="app-section-title mb-2">Sources</div>
              <ul className="space-y-1 text-xs">
                {enrichment.sources.map((s: string, i: number) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 text-foreground/70 hover:text-brand transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <a
                      href={s}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-mono"
                    >
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </FormShell>
  );
}
