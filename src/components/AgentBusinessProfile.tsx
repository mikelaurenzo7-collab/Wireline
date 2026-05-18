// AgentBusinessProfile — operator-facing editor for the business-context
// fields that gate every call: hours, compliance mode, guardrails,
// variables, KPI focus. Pure presentation; the parent owns persistence.
//
// Shape mirrors AgentBusinessProfileSchema (src/lib/form-validators.ts).
// Validation re-runs server-side on save, so we keep the client UI
// permissive (don't surface every error inline) — it's a workspace, not
// a gate.

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  ShieldCheck,
  MessageSquareWarning,
  AlertOctagon,
  Type,
  Target,
  Plus,
  X,
  ChevronDown,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

// ── Types (kept in lockstep with src/lib/agent-runtime.ts) ─────────────

type ComplianceMode = "none" | "hipaa" | "pci" | "gdpr" | "financial" | "legal";
type KpiFocus = "general" | "conversions" | "qualifications" | "resolutions" | "satisfaction";
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}
type BusinessHours = Partial<Record<DayKey, DayHours>>;

export interface BusinessProfile {
  business_hours?: BusinessHours;
  timezone?: string;
  compliance_mode?: ComplianceMode;
  disallowed_topics?: string[];
  escalation_keywords?: string[];
  business_variables?: Record<string, string | number>;
  out_of_hours_message?: string | null;
  kpi_focus?: KpiFocus;
}

interface Props {
  value: BusinessProfile;
  onChange: (next: BusinessProfile) => void;
}

// ── Static catalog ─────────────────────────────────────────────────────

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const COMPLIANCE_OPTIONS: { value: ComplianceMode; label: string; hint: string }[] = [
  { value: "none", label: "None", hint: "Default — no extra disclosures" },
  {
    value: "hipaa",
    label: "HIPAA",
    hint: "Healthcare — PHI handling rules + identity verification",
  },
  {
    value: "pci",
    label: "PCI DSS",
    hint: "Payments — never repeat card data; route to secure IVR",
  },
  { value: "gdpr", label: "GDPR", hint: "EU — recording disclosure + data-subject rights" },
  {
    value: "financial",
    label: "Financial Services",
    hint: "No tax/investment advice; quote only stored figures",
  },
  {
    value: "legal",
    label: "Legal Services",
    hint: "No legal advice; clarifies attorney-client relationship",
  },
];

const KPI_OPTIONS: { value: KpiFocus; label: string; hint: string }[] = [
  { value: "general", label: "General", hint: "No specific outcome focus — balanced agent" },
  {
    value: "conversions",
    label: "Conversions",
    hint: "Optimize for booked appointments / signed agreements / paid orders",
  },
  {
    value: "qualifications",
    label: "Qualifications",
    hint: "Optimize for clean BANT/MEDDIC qualification records",
  },
  {
    value: "resolutions",
    label: "Resolutions",
    hint: "Optimize for first-contact issue resolution",
  },
  { value: "satisfaction", label: "Satisfaction", hint: "Optimize for caller experience and CSAT" },
];

// Common timezones — the most-likely-needed subset. Operators with
// unusual zones can paste any IANA string into the input.
const COMMON_TZS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Athens",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "UTC",
];

// ── Component ──────────────────────────────────────────────────────────

export default function AgentBusinessProfile({ value, onChange }: Props) {
  // Local mirrors so chip inputs / variable rows can have transient
  // state without forcing a re-render of the parent on every keystroke.
  const [topicDraft, setTopicDraft] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");

  const hours = value.business_hours ?? {};
  const variables = value.business_variables ?? {};

  const setField = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) => {
    onChange({ ...value, [k]: v });
  };

  const setDay = (day: DayKey, patch: DayHours | null) => {
    const next = { ...hours };
    if (patch == null) delete next[day];
    else next[day] = patch;
    setField("business_hours", next);
  };

  const addTopic = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const list = value.disallowed_topics ?? [];
    if (list.includes(t)) return;
    setField("disallowed_topics", [...list, t].slice(0, 24));
    setTopicDraft("");
  };

  const removeTopic = (i: number) => {
    const list = (value.disallowed_topics ?? []).slice();
    list.splice(i, 1);
    setField("disallowed_topics", list);
  };

  const addKeyword = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const list = value.escalation_keywords ?? [];
    if (list.includes(t)) return;
    setField("escalation_keywords", [...list, t].slice(0, 24));
    setKeywordDraft("");
  };

  const removeKeyword = (i: number) => {
    const list = (value.escalation_keywords ?? []).slice();
    list.splice(i, 1);
    setField("escalation_keywords", list);
  };

  const setVariable = (key: string, v: string) => {
    const next = { ...variables, [key]: v };
    setField("business_variables", next);
  };
  const removeVariable = (key: string) => {
    const next = { ...variables };
    delete next[key];
    setField("business_variables", next);
  };

  const variableEntries = useMemo(
    () => Object.entries(variables).map(([k, v]) => [k, String(v)] as [string, string]),
    [variables],
  );

  // "+ Variable" gives the operator an empty row to fill in. We track
  // it as a draft pair so an empty key doesn't pollute the saved object
  // until the operator types something.
  const [draftVarKey, setDraftVarKey] = useState("");
  const [draftVarVal, setDraftVarVal] = useState("");
  const commitDraftVar = () => {
    const k = draftVarKey.trim();
    if (!k) return;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/.test(k)) return;
    setVariable(k, draftVarVal);
    setDraftVarKey("");
    setDraftVarVal("");
  };

  const presetCopy = (preset: "mf-9-5" | "always" | "business" | "closed") => {
    let next: BusinessHours = {};
    if (preset === "mf-9-5") {
      next = {
        mon: { open: "09:00", close: "17:00" },
        tue: { open: "09:00", close: "17:00" },
        wed: { open: "09:00", close: "17:00" },
        thu: { open: "09:00", close: "17:00" },
        fri: { open: "09:00", close: "17:00" },
        sat: { closed: true },
        sun: { closed: true },
      };
    } else if (preset === "business") {
      next = {
        mon: { open: "08:00", close: "18:00" },
        tue: { open: "08:00", close: "18:00" },
        wed: { open: "08:00", close: "18:00" },
        thu: { open: "08:00", close: "18:00" },
        fri: { open: "08:00", close: "18:00" },
        sat: { open: "10:00", close: "14:00" },
        sun: { closed: true },
      };
    } else if (preset === "closed") {
      next = {
        mon: { closed: true },
        tue: { closed: true },
        wed: { closed: true },
        thu: { closed: true },
        fri: { closed: true },
        sat: { closed: true },
        sun: { closed: true },
      };
    } else {
      next = {}; // 'always'
    }
    setField("business_hours", next);
  };

  return (
    <div className="space-y-5">
      {/* ── Hours ──────────────────────────────────────────────────── */}
      <Section
        icon={Clock}
        title="Business hours"
        accent="#0AC8D4"
        hint="When this agent should engage. Outbound dials outside these hours are refused; inbound calls hear the out-of-hours message."
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <PresetButton onClick={() => presetCopy("mf-9-5")} label="Mon–Fri 9–5" />
          <PresetButton onClick={() => presetCopy("business")} label="Mon–Sat 8–6 / 10–2" />
          <PresetButton onClick={() => presetCopy("always")} label="24/7" />
          <PresetButton onClick={() => presetCopy("closed")} label="All closed" />
        </div>

        <div className="space-y-1">
          {DAYS.map((d) => {
            const cfg = hours[d.key] ?? {};
            const closed = !!cfg.closed;
            return (
              <div
                key={d.key}
                className="grid grid-cols-[5.5rem,_auto,_1fr] sm:grid-cols-[6rem,_auto,_1fr,_1fr] items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/3 transition-colors"
              >
                <label className="text-[11px] text-ink/80 truncate">{d.label}</label>
                <button
                  type="button"
                  onClick={() =>
                    setDay(d.key, closed ? { open: "09:00", close: "17:00" } : { closed: true })
                  }
                  aria-pressed={!closed}
                  className={cn(
                    "h-7 px-2.5 rounded-full text-[9px] uppercase tracking-[0.25em] transition-colors border",
                    closed
                      ? "border-rose-500/30 text-rose-500 bg-rose-500/8"
                      : "border-emerald-500/30 text-emerald-600 bg-emerald-500/8",
                  )}
                >
                  {closed ? "Closed" : "Open"}
                </button>
                <input
                  type="time"
                  value={cfg.open ?? ""}
                  disabled={closed}
                  onChange={(e) => setDay(d.key, { ...cfg, closed: false, open: e.target.value })}
                  className="input-time"
                  aria-label={`${d.label} open time`}
                />
                <input
                  type="time"
                  value={cfg.close ?? ""}
                  disabled={closed}
                  onChange={(e) => setDay(d.key, { ...cfg, closed: false, close: e.target.value })}
                  className="input-time"
                  aria-label={`${d.label} close time`}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-3">
          <Field label="Time zone">
            <TzSelect
              value={value.timezone ?? "America/New_York"}
              onChange={(v) => setField("timezone", v)}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Field
            label="Out-of-hours message"
            hint="Played to inbound callers outside business hours. Supports {variables}."
          >
            <textarea
              value={value.out_of_hours_message ?? ""}
              onChange={(e) => setField("out_of_hours_message", e.target.value || null)}
              maxLength={500}
              rows={2}
              placeholder="Thanks for calling {business_name} — we're closed right now and will be back at 9 AM."
              className="textarea-base"
            />
            <CharCount value={value.out_of_hours_message ?? ""} max={500} />
          </Field>
        </div>
      </Section>

      {/* ── Compliance ─────────────────────────────────────────────── */}
      <Section
        icon={ShieldCheck}
        title="Compliance preset"
        accent="#0AC8D4"
        hint="Auto-injects required disclosures into the agent's system prompt. Pick the regime your business is regulated under."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {COMPLIANCE_OPTIONS.map((opt) => {
            const active = (value.compliance_mode ?? "none") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setField("compliance_mode", opt.value)}
                className={cn(
                  "text-left rounded-xl border px-3 py-2.5 transition-all",
                  active
                    ? "border-brand-2/40 bg-brand-2/8"
                    : "border-white/8 bg-white/0 hover:border-white/18 hover:bg-white/3",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink text-[12px]">{opt.label}</span>
                  {active && (
                    <span className="text-[8px] uppercase tracking-[0.3em] text-brand-2">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted/80 leading-relaxed mt-1">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── KPI focus ──────────────────────────────────────────────── */}
      <Section
        icon={Target}
        title="Optimization target"
        accent="#0AC8D4"
        hint="Subtle nudge to bias the agent toward the outcome that matters for this surface."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {KPI_OPTIONS.map((opt) => {
            const active = (value.kpi_focus ?? "general") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setField("kpi_focus", opt.value)}
                className={cn(
                  "text-left rounded-xl border px-3 py-2.5 transition-all",
                  active
                    ? "border-brand-3/40 bg-brand-3/8"
                    : "border-white/8 hover:border-white/18 hover:bg-white/3",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink text-[12px]">{opt.label}</span>
                  {active && (
                    <span className="text-[8px] uppercase tracking-[0.3em] text-brand-3">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted/80 leading-relaxed mt-1">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Disallowed topics ──────────────────────────────────────── */}
      <Section
        icon={MessageSquareWarning}
        title="Do-not-discuss topics"
        accent="#FF6B6B"
        hint="The agent refuses or redirects when these come up. Up to 24."
      >
        <ChipList chips={value.disallowed_topics ?? []} onRemove={removeTopic} tone="rose" />
        <ChipDraftInput
          value={topicDraft}
          onChange={setTopicDraft}
          onCommit={addTopic}
          placeholder="e.g. medical advice, legal opinions, competitor pricing"
          disabled={(value.disallowed_topics ?? []).length >= 24}
        />
      </Section>

      {/* ── Escalation keywords ─────────────────────────────────────── */}
      <Section
        icon={AlertOctagon}
        title="Immediate-escalation triggers"
        accent="#FFC07D"
        hint="Phrases that force a human handoff regardless of normal escalation logic. Up to 24."
      >
        <ChipList chips={value.escalation_keywords ?? []} onRemove={removeKeyword} tone="amber" />
        <ChipDraftInput
          value={keywordDraft}
          onChange={setKeywordDraft}
          onCommit={addKeyword}
          placeholder="e.g. lawsuit, cancel my account, speak to a manager"
          disabled={(value.escalation_keywords ?? []).length >= 24}
        />
      </Section>

      {/* ── Variables ───────────────────────────────────────────────── */}
      <Section
        icon={Type}
        title="Business variables"
        accent="#10B981"
        hint="Reusable {placeholders} for personality / directives / knowledge / messages. Set once, reference anywhere."
      >
        <div className="space-y-1.5">
          {variableEntries.length === 0 && (
            <div className="text-[11px] text-muted/60 italic px-1 py-2">
              No variables yet. Add ones like <code className="text-ink/80">business_name</code>,{" "}
              <code className="text-ink/80">website</code>,{" "}
              <code className="text-ink/80">support_email</code>, then reference them as{" "}
              <code className="text-ink/80">{"{business_name}"}</code> in your agent's content.
            </div>
          )}
          {variableEntries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <code
                className="text-[11px] text-brand bg-brand/8 border border-brand/20 rounded-md px-2 py-1.5 font-mono shrink-0 truncate max-w-[12rem]"
                title={k}
              >
                {`{${k}}`}
              </code>
              <input
                type="text"
                value={v}
                onChange={(e) => setVariable(k, e.target.value)}
                maxLength={500}
                className="input-base flex-1"
                aria-label={`Value for ${k}`}
              />
              <button
                type="button"
                onClick={() => removeVariable(k)}
                aria-label={`Remove ${k}`}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-muted/60 hover:text-rose-500 hover:bg-rose-500/8 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-stretch gap-2 mt-2 pt-2 border-t border-black/8">
          <input
            type="text"
            value={draftVarKey}
            onChange={(e) => setDraftVarKey(e.target.value)}
            placeholder="key"
            maxLength={41}
            className="input-base w-32 font-mono"
            aria-label="New variable key"
          />
          <input
            type="text"
            value={draftVarVal}
            onChange={(e) => setDraftVarVal(e.target.value)}
            placeholder="value"
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraftVar();
              }
            }}
            className="input-base flex-1"
            aria-label="New variable value"
          />
          <button
            type="button"
            onClick={commitDraftVar}
            disabled={!draftVarKey.trim() || !/^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/.test(draftVarKey)}
            className="h-9 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-600 text-[10px] uppercase tracking-[0.25em] hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </Section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  hint,
  accent,
  children,
}: {
  icon: any;
  title: string;
  hint?: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl glass border border-white/8 p-4 overflow-hidden"
    >
      <div
        className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accent}, transparent)` }}
      />
      <header className="relative flex items-start gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/10"
          style={{
            background: `linear-gradient(135deg, ${accent}25, ${accent}06)`,
            color: accent,
          }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display italic text-lg text-ink leading-tight">{title}</h3>
          {hint && <p className="text-[10px] text-muted/80 leading-relaxed mt-0.5">{hint}</p>}
        </div>
      </header>
      <div className="relative">{children}</div>
    </motion.section>
  );
}

function PresetButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 px-2.5 rounded-full glass border border-white/10 text-[9px] uppercase tracking-[0.25em] text-muted/80 hover:text-ink hover:border-white/30 transition-all"
    >
      {label}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] uppercase tracking-[0.32em] text-muted/70">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted/60 leading-snug">{hint}</p>}
    </div>
  );
}

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const tone = len > max * 0.9 ? "text-amber-600" : "text-muted/50";
  return (
    <p className={cn("text-[9px] tabular-nums text-right", tone)}>
      {len}/{max}
    </p>
  );
}

function ChipList({
  chips,
  onRemove,
  tone,
}: {
  chips: string[];
  onRemove: (i: number) => void;
  tone: "rose" | "amber";
}) {
  if (chips.length === 0) {
    return <p className="text-[11px] text-muted/60 italic px-1 py-1">None yet.</p>;
  }
  const toneClass =
    tone === "rose"
      ? "bg-rose-500/8 border-rose-500/25 text-rose-600"
      : "bg-amber-500/8 border-amber-500/30 text-amber-600";
  return (
    <ul className="flex flex-wrap gap-1.5 mb-2">
      {chips.map((c, i) => (
        <li
          key={`${c}-${i}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none",
            toneClass,
          )}
        >
          <span className="truncate max-w-[14rem]" title={c}>
            {c}
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${c}`}
            className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChipDraftInput({
  value,
  onChange,
  onCommit,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && value.trim()) {
            e.preventDefault();
            onCommit(value);
          }
        }}
        placeholder={disabled ? "Limit reached (24)" : placeholder}
        disabled={disabled}
        maxLength={120}
        className="input-base flex-1 disabled:opacity-50"
      />
      <button
        type="button"
        disabled={disabled || !value.trim()}
        onClick={() => onCommit(value)}
        className="h-9 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
      >
        <Plus className="w-3 h-3" /> Add
      </button>
    </div>
  );
}

function TzSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(!COMMON_TZS.includes(value));
  // Sync if parent updates the value to one of the common zones.
  useEffect(() => {
    setCustom(!COMMON_TZS.includes(value));
  }, [value]);

  if (custom) {
    return (
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="IANA time zone (e.g. Pacific/Auckland)"
          className="input-base flex-1 font-mono"
          aria-label="Custom timezone"
        />
        <button
          type="button"
          onClick={() => {
            setCustom(false);
            onChange("America/New_York");
          }}
          className="h-9 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink transition-colors"
        >
          Common
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-stretch gap-2">
      <div className="relative flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-base w-full appearance-none pr-9 font-mono"
          aria-label="Timezone"
        >
          {COMMON_TZS.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
      </div>
      <button
        type="button"
        onClick={() => setCustom(true)}
        className="h-9 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink transition-colors"
      >
        Custom
      </button>
    </div>
  );
}
