import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { authFetch } from "../lib/api";
import { type AgentToolName } from "../lib/agent-capabilities";
import { formatAgentRoleLabel } from "../lib/product-copy";

type AgentConfig = {
  role: string | null;
  enabledTools: AgentToolName[];
  voice: { voiceId: string | null; provider: string | null };
  personality: string;
  directives: Array<{ id: string | number; content: string }>;
  knowledge: Array<{ id: string | number; content: string }>;
  runtime: { provider: string | null; model: string | null; temperature: number | null };
  complianceMode?: string | null;
  escalationPhone?: string | null;
  escalationEmail?: string | null;
  escalationHandoffEnabled?: boolean | null;
  isBusinessAgent?: boolean;
};

type StudioAgentCanvasProps = {
  agentId: string;
  agentName: string;
  isBusinessAgent?: boolean;
  onEditSection: (section: string) => void;
  className?: string;
};

const MODEL_OPTIONS = [
  { label: "Auto route", aliases: ["managed default", "auto", "auto route", "managed"] },
  { label: "Grok 4.3", aliases: ["grok 4.3", "grok-4.3"] },
  { label: "Claude Sonnet", aliases: ["claude sonnet", "claude-sonnet", "sonnet"] },
  { label: "GPT-5.5", aliases: ["gpt-5.5", "gpt 5.5"] },
] as const;

const CANVAS_WORKFLOWS: Array<{ name: AgentToolName; label: string; detail: string }> = [
  { name: "view_recent_interactions", label: "Answer calls", detail: "24/7 coverage" },
  { name: "book_appointment", label: "Book appts", detail: "Calendar-aware" },
  { name: "lookup_phone_number", label: "Identify callers", detail: "Smart routing" },
  { name: "send_text_message", label: "SMS follow-up", detail: "Auto confirm" },
  { name: "crm_log_call", label: "CRM note", detail: "Structured log" },
  { name: "update_lead_status", label: "Lead qualify", detail: "Off" },
  { name: "escalate_to_human", label: "Escalation", detail: "Off" },
];

function CardShell({ label, action, onActivate, children, className = "" }: { label: string; action: string; onActivate: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`wl-canvas-card group flex w-full flex-col rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-5 text-left transition-all hover:border-[var(--wireline-color-action-primary-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-action-primary-default)] ${className}`}
    >
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <span className="wl-eyebrow">{label}</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--wireline-color-action-primary-default)]">
          {action}
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      {children}
    </button>
  );
}

function displayVoiceName(raw?: string | null) {
  if (!raw) return "Aria";
  if (/^[A-Za-z0-9_-]{12,}$/.test(raw)) return "Aria";
  return raw.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeModel(raw?: string | null) {
  return (raw || "").trim().toLowerCase().replace(/[_]+/g, " ");
}

function modelSelected(option: (typeof MODEL_OPTIONS)[number], raw?: string | null) {
  const normalized = normalizeModel(raw);
  if (!normalized) return option.label === "Auto route";
  return option.aliases.some((alias) => normalized === alias || normalized.includes(alias));
}

export default function StudioAgentCanvas({ agentId, agentName, isBusinessAgent, onEditSection, className = "" }: StudioAgentCanvasProps) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AgentConfig | null) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const business = isBusinessAgent ?? config?.isBusinessAgent ?? false;
  const enabled = useMemo(() => new Set(config?.enabledTools ?? []), [config?.enabledTools]);
  const workflowRows = CANVAS_WORKFLOWS.filter((tool) => business || tool.name !== "update_lead_status");
  const activeCount = workflowRows.filter((tool) => enabled.has(tool.name)).length;
  const roleLabel = formatAgentRoleLabel(config?.role ?? null);
  const voiceName = displayVoiceName(config?.voice?.voiceId);
  const personality = config?.personality?.trim() || "Concise, warm, and reliable.";
  const modelLabel = config?.runtime?.model || "Managed Default";
  const temperature = config?.runtime?.temperature ?? 0.5;
  const situations = config?.directives?.length
    ? config.directives.slice(0, 3).map((item) => item.content)
    : ["Booking", "Support", "Follow-up"];

  if (loading) {
    return (
      <div className={`flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--wireline-color-canvas-default)] p-4 sm:p-6 lg:p-7 ${className}`} aria-busy="true" aria-label="Loading agent canvas">
        <div className="h-3 w-28 animate-pulse rounded bg-[var(--wireline-color-surface-subtle)]" />
        <div className="h-72 animate-pulse rounded-[14px] bg-[var(--wireline-color-surface-subtle)]" />
      </div>
    );
  }

  return (
    <div className={`h-full min-h-0 overflow-y-auto bg-[var(--wireline-color-canvas-default)] p-4 sm:p-6 lg:p-7 ${className}`}>
      <div className="mb-6">
        <div className="wl-eyebrow">Agent Canvas</div>
        <p className="mt-1.5 text-[13px] text-[var(--wireline-color-text-tertiary)]">Click any card to edit. Changes save automatically.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardShell label="Identity" action="Edit" onActivate={() => onEditSection("identity")} className="min-h-[260px]">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-[12px] bg-[var(--wireline-color-action-primary-default)] font-[var(--wireline-font-mono)] text-base font-bold text-[var(--wireline-color-text-onAction)]">{(agentName || "A").trim().charAt(0).toUpperCase()}</div>
              <div>
                <div className="font-[var(--wireline-font-display)] text-[22px] tracking-[-0.01em]">{agentName || "Untitled agent"}</div>
                <div className="text-xs text-[var(--wireline-color-text-tertiary)]">{roleLabel}</div>
              </div>
            </div>
            <div className="line-clamp-4 rounded-lg bg-[var(--wireline-color-surface-subtle)] px-3 py-3 text-xs leading-relaxed text-[var(--wireline-color-text-secondary)]">{personality}</div>
          </CardShell>

          <CardShell label="Voice" action="Preview" onActivate={() => onEditSection("voice")} className="min-h-[260px]">
            <div className="font-[var(--wireline-font-display)] text-[22px] tracking-[-0.01em]">{voiceName}</div>
            <div className="mt-1 text-xs text-[var(--wireline-color-text-secondary)]">Warm & Confident · Wireline Voice</div>
            <div className="mt-4 text-xs text-[var(--wireline-color-text-tertiary)]">Provider: {config?.voice?.provider || "Managed"}</div>
          </CardShell>
        </div>

        <CardShell label="Workflows & Capabilities" action={`${activeCount} of ${workflowRows.length} active`} onActivate={() => onEditSection("workflows")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {workflowRows.map((tool) => {
              const on = enabled.has(tool.name);
              return (
                <div key={tool.name} className={on ? "rounded-lg border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] p-2.5" : "rounded-lg border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-2.5"}>
                  <div className="flex items-center gap-1.5 text-xs font-semibold">{on ? <CheckCircle2 className="size-3.5 text-primary" /> : null}{tool.label}</div>
                  <div className="mt-1 text-[10px] text-[var(--wireline-color-text-tertiary)]">{tool.detail}</div>
                </div>
              );
            })}
          </div>
        </CardShell>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardShell label="Knowledge" action="Open" onActivate={() => onEditSection("knowledge")}>
            <div className="font-[var(--wireline-font-display)] text-xl tracking-[-0.01em]">{config?.knowledge?.length || 0} sources</div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--wireline-color-text-secondary)]">Scripts, FAQs, policies, and local context.</p>
          </CardShell>
          <CardShell label="Situations" action="Compose" onActivate={() => onEditSection("situations")}>
            <div className="flex flex-col gap-2">
              {situations.map((situation, index) => (
                <div key={`${situation}-${index}`} className="rounded-lg border border-[var(--wireline-color-border-subtle)] px-3 py-2 text-xs leading-snug text-[var(--wireline-color-text-secondary)]">{situation}</div>
              ))}
            </div>
          </CardShell>
        </div>

        <CardShell label="Call Model" action="Configure" onActivate={() => onEditSection("model")}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(260px,1fr)] lg:items-start">
            <div>
              <div className="font-[var(--wireline-font-display)] text-xl tracking-[-0.01em]">{modelLabel}</div>
              <div className="mt-1 text-xs text-[var(--wireline-color-text-secondary)]">{config?.runtime?.provider ? `${config.runtime.provider} · auto-routes per task` : "Auto-routes to best model per task"}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" aria-label="Runtime model">
              {MODEL_OPTIONS.map((model) => {
                const selected = modelSelected(model, config?.runtime?.model);
                return <span key={model.label} aria-current={selected ? "true" : undefined} className={`rounded-lg border px-2 py-2 ${selected ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-primary" : "border-border text-muted-foreground"}`}>{model.label}</span>;
              })}
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-[var(--wireline-color-surface-subtle)]"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(1, temperature)) * 100}%` }} /></div>
          <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground"><span>Focused</span><span>Temperature {temperature.toFixed(2)}</span><span>Expressive</span></div>
        </CardShell>
      </div>
    </div>
  );
}
