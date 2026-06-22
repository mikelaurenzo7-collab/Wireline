/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
// AgentBusinessProfile — Account Holder-facing editor for the business-context
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
  Briefcase,
  User,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { Input } from "./ui/shadcn/Input";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { ShadButton } from "./ui/shadcn/ShadButton";

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
  /**
   * Where this agent's `escalate_to_human` tool routes. Overrides the
   * tenant-wide `twilio_manager_alert_number`. Both optional — if
   * neither is set the handler falls back to tenant defaults.
   *   - escalation_phone : E.164 SMS destination
   *   - escalation_email : Address to email on non-instant escalations
   */
  escalation_phone?: string;
  escalation_email?: string;
  /**
   * Warm-transfer toggle. When true AND escalation_phone is set, the
   * `escalate_to_human` tool transfers the LIVE caller to the configured
   * phone in real time (via Vapi destination) instead of just queueing
   * an async alert. Opt-in: the Account Holder must explicitly enable.
   */
  escalation_handoff_enabled?: boolean;
  business_variables?: Record<string, string | number>;
  out_of_hours_message?: string | null;
  kpi_focus?: KpiFocus;
  is_business_agent?: boolean;
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
  { value: "general", label: "General", hint: "No specific outcome focus — balanced assistant" },
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

// Common timezones — the most-likely-needed subset. Account Holders with
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

  const isBusiness = !!value.is_business_agent;

  const hours = value.business_hours ?? {};
  const variables = useMemo(() => value.business_variables ?? {}, [value.business_variables]);

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

  // "+ Variable" gives the Account Holder an empty row to fill in. We track
  // it as a draft pair so an empty key doesn't pollute the saved object
  // until the Account Holder types something.
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
      {/* ── Context Switcher (Personal vs Business) ───────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border border-[#C9C4D7] bg-[#FFFFFF] shadow-sm">
        <div className="min-w-0">
          <h3 className="font-display italic text-base text-[#0B1C30] leading-tight">
            Assistant Posture
          </h3>
          <p className="text-[11px] text-[#484554] leading-relaxed mt-0.5">
            Configure this assistant as a personal helper or a professional business representative.
          </p>
        </div>

        <div className="flex p-0.5 rounded-lg border border-[#C9C4D7]/60 bg-[#EFF4FF] self-start sm:self-center">
          <ShadButton
            type="button"
            variant="ghost"
            disableAnimations
            onClick={() => setField("is_business_agent", false)}
            className={cn(
              "h-7 px-3.5 rounded-md flex items-center gap-1.5 text-[10.5px] font-semibold transition-all touch-press",
              !isBusiness
                ? "bg-[#E6DEFF] text-[#0B1C30] border border-[#C9C4D7]/50 shadow-sm"
                : "text-[#484554] hover:bg-[#E5EEFF]",
            )}
          >
            <User className="w-3.5 h-3.5 text-[#5D3FD3]" />
            Personal
          </ShadButton>
          <ShadButton
            type="button"
            variant="ghost"
            disableAnimations
            onClick={() => setField("is_business_agent", true)}
            className={cn(
              "h-7 px-3.5 rounded-md flex items-center gap-1.5 text-[10.5px] font-semibold transition-all touch-press",
              isBusiness
                ? "bg-[#E6DEFF] text-[#0B1C30] border border-[#C9C4D7]/50 shadow-sm"
                : "text-[#484554] hover:bg-[#E5EEFF]",
            )}
          >
            <Briefcase className="w-3.5 h-3.5 text-[#5D3FD3]" />
            Business
          </ShadButton>
        </div>
      </div>

      {!isBusiness ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-[#C9C4D7] bg-[#FFFFFF] p-8 text-center space-y-6 max-w-2xl mx-auto my-4 shadow-sm relative overflow-hidden"
        >
          {/* Subtle top indicator using Ametrine Purple */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#5D3FD3]" />

          <div className="mx-auto w-14 h-14 rounded-full bg-[#E6DEFF] border border-[#C9C4D7]/80 flex items-center justify-center text-[#5D3FD3]">
            <User className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="font-display italic text-xl text-[#0B1C30] tracking-tight">
              Personal Assistant Mode
            </h2>
            <p className="text-[12px] text-[#484554] max-w-md mx-auto leading-relaxed">
              This assistant is dedicated to managing your daily personal tasks, scheduling, and
              communication directly from your device.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-lg mx-auto">
            <div className="p-3.5 rounded-lg border border-[#C9C4D7]/40 bg-[#F8F9FF] space-y-1">
              <span className="text-[11.5px] font-semibold text-[#0B1C30] block">
                Your Day & Schedule
              </span>
              <span className="text-[10.5px] text-[#484554] leading-normal block">
                Coordinates appointments, dentist bookings, reservations, and personal errands.
              </span>
            </div>

            <div className="p-3.5 rounded-lg border border-[#C9C4D7]/40 bg-[#F8F9FF] space-y-1">
              <span className="text-[11.5px] font-semibold text-[#0B1C30] block">
                Smart Hold & Support
              </span>
              <span className="text-[10.5px] text-[#484554] leading-normal block">
                Navigates automated support systems, waits on hold, and rings when a human is ready.
              </span>
            </div>

            <div className="p-3.5 rounded-lg border border-[#C9C4D7]/40 bg-[#F8F9FF] space-y-1">
              <span className="text-[11.5px] font-semibold text-[#0B1C30] block">
                Knowledge & Reminders
              </span>
              <span className="text-[10.5px] text-[#484554] leading-normal block">
                Keeps track of important details like family preferences, school info, and
                pharmacies.
              </span>
            </div>

            <div className="p-3.5 rounded-lg border border-[#C9C4D7]/40 bg-[#F8F9FF] space-y-1">
              <span className="text-[11.5px] font-semibold text-[#0B1C30] block">
                Recaps & Alerts
              </span>
              <span className="text-[10.5px] text-[#484554] leading-normal block">
                Sends high-fidelity call summaries, transcribed insights, and instant phone
                follow-ups.
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-[#C9C4D7]/40 max-w-md mx-auto space-y-3">
            <p className="text-[11px] text-[#484554] leading-normal">
              Need advanced routing, custom variables, HIPAA/GDPR compliance, operational hours, or
              immediate phone escalation for a store or business?
            </p>
            <ShadButton
              type="button"
              variant="outline"
              onClick={() => setField("is_business_agent", true)}
              className="h-8 px-4 rounded-md inline-flex items-center gap-2 bg-[#E6DEFF] border-[#C9C4D7] text-[#0B1C30] text-[11px] font-semibold hover:bg-[#5D3FD3] hover:text-[#FFFFFF] transition-all touch-press hover:scale-[1.02]"
            >
              <Briefcase className="w-3.5 h-3.5 text-[#5D3FD3] group-hover:text-[#FFFFFF]" />
              Configure as Business Assistant
            </ShadButton>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* ── Hours ──────────────────────────────────────────────────── */}
          <Section
            icon={Clock}
            title="Business hours"
            hint="When this assistant should engage. Outbound dials outside these hours are refused; inbound calls hear the out-of-hours message."
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
                    className="grid grid-cols-[5.5rem,_auto,_1fr] sm:grid-cols-[6rem,_auto,_1fr,_1fr] items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/3 transition-colors"
                  >
                    <label className="text-[11px] text-foreground/80 truncate">{d.label}</label>
                    <ShadButton
                      type="button"
                      variant={closed ? "destructive" : "outline"}
                      size="sm"
                      disableAnimations
                      onClick={() =>
                        setDay(d.key, closed ? { open: "09:00", close: "17:00" } : { closed: true })
                      }
                      aria-pressed={!closed}
                      className={cn(
                        "h-7 px-2.5 rounded-full wl-label touch-press hover:scale-[1.05]",
                        closed
                          ? "border-rose-500/30 text-rose-500 bg-rose-500/8 shadow-none"
                          : "border-brand/30 text-brand bg-brand/8",
                      )}
                    >
                      {closed ? "Closed" : "Open"}
                    </ShadButton>
                    <Input
                      type="time"
                      value={cfg.open ?? ""}
                      disabled={closed}
                      onChange={(e) =>
                        setDay(d.key, { ...cfg, closed: false, open: e.target.value })
                      }
                      className="input-time"
                      aria-label={`${d.label} open time`}
                    />
                    <Input
                      type="time"
                      value={cfg.close ?? ""}
                      disabled={closed}
                      onChange={(e) =>
                        setDay(d.key, { ...cfg, closed: false, close: e.target.value })
                      }
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
            hint="Auto-injects required disclosures into the assistant's system prompt. Pick the regime your business is regulated under."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {COMPLIANCE_OPTIONS.map((opt) => {
                const active = (value.compliance_mode ?? "none") === opt.value;
                return (
                  <ShadButton
                    key={opt.value}
                    type="button"
                    variant="ghost"
                    disableAnimations
                    onClick={() => setField("compliance_mode", opt.value)}
                    className={cn(
                      "h-auto w-full justify-start text-left rounded-md border px-3 py-2.5",
                      active
                        ? "border-brand/40 bg-brand/8"
                        : "border-border hover:border-brand/25 hover:bg-black/[0.02]",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground text-[12px]">{opt.label}</span>
                      {active && <span className="wl-label text-brand">Active</span>}
                    </div>
                    <p className="wl-micro-meta--muted leading-relaxed mt-1">{opt.hint}</p>
                  </ShadButton>
                );
              })}
            </div>
          </Section>

          {/* ── KPI focus ──────────────────────────────────────────────── */}
          <Section
            icon={Target}
            title="Optimization target"
            hint="Subtle nudge to bias the assistant toward the outcome that matters for this surface."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {KPI_OPTIONS.map((opt) => {
                const active = (value.kpi_focus ?? "general") === opt.value;
                return (
                  <ShadButton
                    key={opt.value}
                    type="button"
                    variant="ghost"
                    disableAnimations
                    onClick={() => setField("kpi_focus", opt.value)}
                    className={cn(
                      "h-auto w-full justify-start text-left rounded-md border px-3 py-2.5",
                      active
                        ? "border-brand/40 bg-brand/8"
                        : "border-border hover:border-brand/25 hover:bg-black/[0.02]",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground text-[12px]">{opt.label}</span>
                      {active && <span className="wl-label text-brand">Active</span>}
                    </div>
                    <p className="wl-micro-meta--muted leading-relaxed mt-1">{opt.hint}</p>
                  </ShadButton>
                );
              })}
            </div>
          </Section>

          {/* ── Disallowed topics ──────────────────────────────────────── */}
          <Section
            icon={MessageSquareWarning}
            title="Do-not-discuss topics"
            hint="The assistant refuses or redirects when these come up. Up to 24."
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
            hint="Phrases that force a human handoff regardless of normal escalation logic. Up to 24."
          >
            <ChipList
              chips={value.escalation_keywords ?? []}
              onRemove={removeKeyword}
              tone="brand"
            />
            <ChipDraftInput
              value={keywordDraft}
              onChange={setKeywordDraft}
              onCommit={addKeyword}
              placeholder="e.g. lawsuit, cancel my account, speak to a manager"
              disabled={(value.escalation_keywords ?? []).length >= 24}
            />

            {/* ── Escalation routing — per-agent override ──────────────────
                When this assistant fires the escalate_to_human tool, where does
                the alert go? Both fields are optional. If empty, the handler
                falls back to the tenant-wide Manager Alert Number set in
                Settings → Carrier. Setting these lets one tenant route a
                sales assistant's escalations to the sales manager and a support
                assistant's to the support lead. */}
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-eyebrow/65 font-semibold mb-1">
                Route alerts to (this assistant only)
              </p>
              <p className="wl-micro-meta mb-3 leading-relaxed">
                Both optional. Leave blank to use the tenant-wide Manager Alert Number from{" "}
                <a href="/admin?tab=carrier" className="text-brand hover:underline">
                  Settings → Carrier
                </a>
                .
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="wl-label text-foreground/55 font-semibold block mb-1">
                    Escalation phone (SMS)
                  </span>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    value={value.escalation_phone ?? ""}
                    onChange={(e) =>
                      onChange({ ...value, escalation_phone: e.target.value.trim() || undefined })
                    }
                    placeholder="+1 555 123 4567"
                    aria-label="Per-agent escalation phone number"
                    className="w-full h-9 px-3 rounded-md border border-border bg-card text-[12px] focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/12 transition-all"
                    data-testid="escalation-phone-input"
                  />
                </label>
                <label className="block">
                  <span className="wl-label text-foreground/55 font-semibold block mb-1">
                    Escalation email
                  </span>
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    value={value.escalation_email ?? ""}
                    onChange={(e) =>
                      onChange({ ...value, escalation_email: e.target.value.trim() || undefined })
                    }
                    placeholder="lead@yourcompany.com"
                    aria-label="Per-agent escalation email"
                    className="w-full h-9 px-3 rounded-md border border-border bg-card text-[12px] focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/12 transition-all"
                    data-testid="escalation-email-input"
                  />
                </label>
              </div>

              {/* ── Warm-transfer toggle ─────────────────────────────────
                  When ON + an escalation_phone is set, the assistant's
                  escalate_to_human tool will TRANSFER the live caller to
                  that number mid-call. Off (default) = async alert only.
                  This is the product-defining "AI receptionist that warm-
                  transfers to a human" capability — gated behind explicit
                  opt-in because a misconfigured transfer is worse than
                  no transfer (dead air → angry caller). */}
              <label
                className={
                  "mt-3 flex items-start gap-3 p-3 rounded-md border transition-all cursor-pointer " +
                  (value.escalation_handoff_enabled && value.escalation_phone
                    ? "border-brand/30 bg-brand/[0.04]"
                    : "border-border bg-card hover:border-brand/20")
                }
              >
                <Checkbox
                  checked={value.escalation_handoff_enabled === true}
                  disabled={!value.escalation_phone}
                  onChange={(e) =>
                    onChange({ ...value, escalation_handoff_enabled: e.target.checked })
                  }
                  className="mt-0.5 w-4 h-4 accent-brand shrink-0"
                  aria-label="Warm-transfer live caller to escalation phone"
                  data-testid="escalation-handoff-toggle"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-foreground leading-tight">
                    Warm-transfer the live caller
                  </p>
                  <p className="text-[10.5px] text-foreground/55 leading-relaxed mt-0.5">
                    {value.escalation_phone
                      ? "When this assistant escalates, the live call transfers to the phone above instead of just sending an alert. The assistant will say a brief handoff line before transferring."
                      : "Set an escalation phone above to enable warm-transfer. Without one, the caller has nowhere to be routed."}
                  </p>
                  {value.escalation_handoff_enabled && value.escalation_phone && (
                    <p className="mt-1.5 text-[9.5px] uppercase tracking-[0.22em] text-brand font-semibold">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand mr-1 align-middle" />
                      Live transfer enabled
                    </p>
                  )}
                </div>
              </label>
            </div>
          </Section>

          {/* ── Variables ───────────────────────────────────────────────── */}
          <Section
            icon={Type}
            title="Business variables"
            hint="Reusable {placeholders} for personality / directives / knowledge / messages. Set once, reference anywhere."
          >
            <div className="space-y-1.5">
              {variableEntries.length === 0 && (
                <div className="text-[11px] text-foreground/55 italic px-1 py-2">
                  No variables yet. Add ones like{" "}
                  <code className="text-foreground/80">business_name</code>,{" "}
                  <code className="text-foreground/80">website</code>,{" "}
                  <code className="text-foreground/80">support_email</code>, then reference them as{" "}
                  <code className="text-foreground/80">{"{business_name}"}</code> in your
                  assistant's content.
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
                  <Input
                    type="text"
                    value={v}
                    onChange={(e) => setVariable(k, e.target.value)}
                    maxLength={500}
                    className="input-base flex-1"
                    aria-label={`Value for ${k}`}
                  />
                  <ShadButton
                    type="button"
                    variant="ghost"
                    size="icon"
                    disableAnimations
                    onClick={() => removeVariable(k)}
                    aria-label={`Remove ${k}`}
                    className="w-9 h-9 rounded-md text-foreground/55 hover:text-rose-500 hover:bg-rose-500/8 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </ShadButton>
                </div>
              ))}
            </div>

            <div className="flex items-stretch gap-2 mt-2 pt-2 border-t border-border">
              <Input
                type="text"
                value={draftVarKey}
                onChange={(e) => setDraftVarKey(e.target.value)}
                placeholder="key"
                maxLength={41}
                className="input-base w-32 font-mono"
                aria-label="New variable key"
              />
              <Input
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
              <ShadButton
                type="button"
                variant="outline"
                size="sm"
                disableAnimations
                onClick={commitDraftVar}
                disabled={!draftVarKey.trim() || !/^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/.test(draftVarKey)}
                className="h-9 px-3 rounded-md bg-brand/15 border-brand/35 text-brand wl-label hover:bg-brand/25 touch-press hover:scale-[1.02]"
              >
                <Plus className="w-3 h-3" /> Add
              </ShadButton>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: any;
  title: string;
  hint?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-md wl-panel-elevated border border-border p-4 overflow-hidden"
    >
      <header className="relative flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-md wl-panel border border-brand/25 flex items-center justify-center shrink-0 text-brand">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display italic text-lg text-foreground leading-tight">{title}</h3>
          {hint && <p className="wl-micro-meta--muted leading-relaxed mt-0.5">{hint}</p>}
        </div>
      </header>
      <div className="relative">{children}</div>
    </motion.section>
  );
}

function PresetButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <ShadButton
      type="button"
      variant="outline"
      size="sm"
      disableAnimations
      onClick={onClick}
      className="h-7 px-2.5 rounded-full wl-label-muted opacity-80 touch-press hover:scale-[1.02]"
    >
      {label}
    </ShadButton>
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
      <label className="wl-micro-meta">{label}</label>
      {children}
      {hint && <p className="wl-micro-meta leading-snug">{hint}</p>}
    </div>
  );
}

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const tone = len > max * 0.9 ? "text-brand" : "text-foreground/55";
  return (
    <p className={cn("wl-micro-badge tabular-nums text-right", tone)}>
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
  tone: "rose" | "brand";
}) {
  if (chips.length === 0) {
    return <p className="text-[11px] text-foreground/55 italic px-1 py-1">None yet.</p>;
  }
  const toneClass =
    tone === "rose"
      ? "bg-rose-500/8 border-rose-500/25 text-rose-600"
      : "bg-brand/8 border-brand/30 text-brand";
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
          <ShadButton
            type="button"
            variant="ghost"
            size="icon"
            disableAnimations
            onClick={() => onRemove(i)}
            aria-label={`Remove ${c}`}
            className="w-4 h-4 rounded-full hover:bg-black/5"
          >
            <X className="w-2.5 h-2.5" />
          </ShadButton>
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
      <Input
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
      <ShadButton
        type="button"
        variant="outline"
        size="sm"
        disableAnimations
        disabled={disabled || !value.trim()}
        onClick={() => onCommit(value)}
        className="h-9 px-3 rounded-md wl-label text-muted"
      >
        <Plus className="w-3 h-3" /> Add
      </ShadButton>
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
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="IANA time zone (e.g. Pacific/Auckland)"
          className="input-base flex-1 font-mono"
          aria-label="Custom timezone"
        />
        <ShadButton
          type="button"
          variant="outline"
          size="sm"
          disableAnimations
          onClick={() => {
            setCustom(false);
            onChange("America/New_York");
          }}
          className="h-9 px-3 rounded-md wl-label text-muted"
        >
          Common
        </ShadButton>
      </div>
    );
  }
  return (
    <div className="flex items-stretch gap-2">
      <div className="relative flex-1">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger aria-label="Timezone" className="input-base w-full font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_TZS.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ShadButton
        type="button"
        variant="outline"
        size="sm"
        disableAnimations
        onClick={() => setCustom(true)}
        className="h-9 px-3 rounded-md wl-label text-muted"
      >
        Custom
      </ShadButton>
    </div>
  );
}
