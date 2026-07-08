import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import { type AgentToolName } from "../lib/agent-capabilities";
import { formatAgentRoleLabel } from "../lib/product-copy";
import { providerLabel, resolveVoiceLabel } from "../lib/voice-catalog";
import { useAgents } from "../contexts/AgentsContext";
import AgentPresenceSlot, { AgentPresenceMeta } from "./AgentPresenceSlot";
import AgentLaunchReadinessCard from "./AgentLaunchReadinessCard";
import AgentPresenceCatalogThumb from "./AgentPresenceCatalogThumb";
import { WiredEyebrow } from "./ui/WiredEyebrow";
import { PresenterPstnVoiceNotice } from "./voice/PresenterPstnVoiceNotice";
import type { AgentVideoPresenterConfig } from "../lib/video-presenter/types";

/**
 * StudioAgentCanvas — the spatial Agent Canvas from the handoff bundle.
 *
 * The top of this surface intentionally mirrors the supplied Studio screenshot:
 * Identity + Voice, Workflows, then Knowledge + Situations. Below the first
 * fold we migrate the rest of the ZIP's business structure into production:
 * Call Model, Business Profile, Connections, Guardrails, and Setup Health.
 */

type AgentConfig = {
  role: string | null;
  archetype: string | null;
  enabledTools: AgentToolName[];
  voice: {
    voiceId: string | null;
    provider: string | null;
    phoneVoiceId?: string | null;
    phoneVoiceProvider?: string | null;
  };
  personality: string;
  directives: Array<{ id: string | number; content: string; priority?: number }>;
  knowledge: Array<{ id: string | number; content: string }>;
  runtime: { provider: string | null; model: string | null; temperature: number | null };
  businessHours?: unknown;
  complianceMode?: string | null;
  businessVariables?: Record<string, unknown> | null;
  escalationPhone?: string | null;
  escalationEmail?: string | null;
  escalationHandoffEnabled?: boolean | null;
  isBusinessAgent?: boolean;
  identity?: AgentVideoPresenterConfig | null;
};

type StudioAgentCanvasProps = {
  agentId: string;
  agentName: string;
  isBusinessAgent?: boolean;
  onEditSection: (section: string) => void;
  className?: string;
};

const VOICES = [
  { name: "Aria", tone: "Warm · Confident" },
  { name: "Marcus", tone: "Calm · Deep" },
  { name: "Nova", tone: "Bright · Upbeat" },
  { name: "Taylor", tone: "Neutral · Pro" },
] as const;

const CONNECTION_CATALOG: Array<{ tool: AgentToolName; label: string }> = [
  { tool: "book_appointment", label: "Google Calendar" },
  { tool: "send_text_message", label: "SMS / Text Messages" },
  { tool: "crm_log_call", label: "CRM Notes" },
  { tool: "send_email", label: "Email" },
  { tool: "shopify_lookup_order", label: "Shopify" },
  { tool: "square_create_payment_link", label: "Stripe Billing" },
];

const CANVAS_WORKFLOWS: Array<{ name: AgentToolName; label: string; detail: string }> = [
  { name: "view_recent_interactions", label: "Answer calls", detail: "24/7 coverage" },
  { name: "book_appointment", label: "Book appts", detail: "Calendar-aware" },
  { name: "lookup_phone_number", label: "Identify callers", detail: "Smart routing" },
  { name: "send_text_message", label: "SMS follow-up", detail: "Auto confirm" },
  { name: "crm_log_call", label: "CRM note", detail: "Structured log" },
  { name: "update_lead_status", label: "Lead qualify", detail: "Off" },
  { name: "escalate_to_human", label: "Escalate billing", detail: "Off" },
];

const DEFAULT_SITUATIONS = [
  "caller asks to book → Check calendar & confirm",
  "caller is upset → Escalate to human",
  "caller asks pricing → Recite rate sheet",
] as const;

function situationParts(text: string): { trigger: string; action: string | null } {
  const arrow = text.indexOf("→");
  if (arrow > 0) {
    return {
      trigger: text.slice(0, arrow).trim(),
      action: text.slice(arrow + 1).trim() || null,
    };
  }
  const colon = text.indexOf(":");
  if (colon > 0 && colon < 48) {
    return {
      trigger: text.slice(0, colon).trim(),
      action: text.slice(colon + 1).trim() || null,
    };
  }
  return { trigger: text, action: null };
}

function CardShell({
  label,
  action,
  onActivate,
  children,
  delay = 0,
  className = "",
}: {
  label: string;
  action: string;
  onActivate: () => void;
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      style={{ animationDelay: `${delay}ms` }}
      className={`wl-canvas-card wl-paper wl-paper-elevated wl-canvas-card--letterpress group flex w-full flex-col rounded-[14px] p-5 text-left transition-all hover:border-[var(--wireline-color-action-primary-default)] hover:shadow-[0_2px_12px_var(--wireline-color-glow-primarySoft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-action-primary-default)] ${className}`}
    >
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <span className={cn(WL_APP_CLASSES.wiredEyebrow, "wl-eyebrow")}>{label}</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--wireline-color-action-primary-default)]">
          {action}
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      {children}
    </button>
  );
}

function Connector() {
  return (
    <div className="flex h-4 items-center justify-center" aria-hidden="true">
      <div className="h-4 w-px bg-[var(--wireline-color-border-subtle)] opacity-80" />
    </div>
  );
}

function displayVoiceName(raw?: string | null) {
  return resolveVoiceLabel(raw);
}

function weekdayStrip() {
  return ["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
    <span
      key={`${day}-${index}`}
      className={`grid size-7 place-items-center rounded-md text-[10px] font-semibold ${index < 5 ? "bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-action-primary-pressed)]" : "bg-[var(--wireline-color-surface-subtle)] text-[var(--wireline-color-text-tertiary)]"}`}
    >
      {day}
    </span>
  ));
}

export default function StudioAgentCanvas({
  agentId,
  agentName,
  isBusinessAgent,
  onEditSection,
  className = "",
}: StudioAgentCanvasProps) {
  const { agents } = useAgents();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (configRes) => {
        const data = configRes.ok ? ((await configRes.json()) as AgentConfig | null) : null;
        if (!cancelled) {
          setConfig(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfig(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const selectedAgent = useMemo(() => {
    const summary = agents.find((agent) => agent.id === agentId);
    if (!summary) return null;
    return {
      ...summary,
      voice_id: config?.voice?.voiceId ?? null,
      website_url: null,
      transfer_phone: null,
    };
  }, [agents, agentId, config?.voice?.voiceId]);

  const business = isBusinessAgent ?? config?.isBusinessAgent ?? false;
  const enabled = useMemo(() => new Set(config?.enabledTools ?? []), [config?.enabledTools]);
  const workflowRows = CANVAS_WORKFLOWS.filter(
    (tool) => business || tool.name !== "update_lead_status",
  );
  const activeCount = workflowRows.filter((tool) => enabled.has(tool.name)).length;
  const roleLabel = formatAgentRoleLabel(config?.role ?? null);
  const voiceName = displayVoiceName(config?.voice?.voiceId);
  const isPresenterVoice = config?.voice?.provider === "presenter";
  const hasPhoneVoice = Boolean(config?.voice?.phoneVoiceId && config?.voice?.phoneVoiceProvider);
  const hasLiveLine = Boolean(selectedAgent?.phone_number);
  const personality = config?.personality?.trim() || "Not set";
  const docCount = config?.knowledge?.length ?? 0;
  const directives = config?.directives ?? [];
  const modelLabel = config?.runtime?.model || "Managed Default";
  const temperature = config?.runtime?.temperature ?? 0.5;
  const temperaturePct = Math.round(Math.min(1, Math.max(0, temperature)) * 100);
  const situationRows = directives.length
    ? directives.slice(0, 3).map((item) => item.content)
    : DEFAULT_SITUATIONS;
  const connectionRows = CONNECTION_CATALOG.map((item) => ({
    ...item,
    active: enabled.has(item.tool),
  }));
  const businessVars = config?.businessVariables ?? {};
  const businessName =
    typeof businessVars.business_name === "string" ? businessVars.business_name : null;
  const businessWebsite = typeof businessVars.website === "string" ? businessVars.website : null;
  const supportEmail =
    typeof businessVars.support_email === "string" ? businessVars.support_email : null;
  const profileLine = [businessName, businessWebsite, supportEmail].filter(Boolean).join(" · ");

  if (loading) {
    return (
      <div
        className={`flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--wireline-color-canvas-default)] p-4 sm:p-6 lg:p-7 ${className}`}
        aria-busy="true"
        aria-label="Loading agent canvas"
      >
        <div className="h-3 w-28 animate-pulse rounded bg-[var(--wireline-color-surface-subtle)]" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-72 animate-pulse rounded-[14px] bg-[var(--wireline-color-surface-subtle)]" />
          <div className="h-72 animate-pulse rounded-[14px] bg-[var(--wireline-color-surface-subtle)]" />
        </div>
        <div className="h-40 animate-pulse rounded-[14px] bg-[var(--wireline-color-surface-subtle)]" />
      </div>
    );
  }

  return (
    <div
      className={`h-full min-h-0 overflow-y-auto bg-[var(--wireline-color-canvas-default)] p-4 sm:p-6 lg:p-7 ${className}`}
    >
      <div className="mb-6">
        <WiredEyebrow>Agent Canvas</WiredEyebrow>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardShell
            label="Identity"
            action="Presence"
            delay={80}
            onActivate={() => onEditSection("presence")}
            className="min-h-[300px]"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="relative shrink-0">
                <AgentPresenceSlot
                  name={agentName}
                  agentId={agentId}
                  role={config?.role}
                  isBusinessAgent={business}
                  variant="inline"
                />
                {config?.identity?.chosenAvatarId ? (
                  <AgentPresenceCatalogThumb
                    avatarId={config.identity.chosenAvatarId}
                    className="absolute -bottom-1 -right-1"
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="font-[var(--wireline-font-display)] text-[22px] tracking-[-0.01em]">
                  {agentName || "Untitled agent"}
                </div>
                <div className="text-xs text-[var(--wireline-color-text-tertiary)]">
                  {roleLabel}
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-[var(--wireline-color-surface-subtle)] px-3 py-3 text-xs leading-relaxed text-[var(--wireline-color-text-secondary)]">
              {personality}
            </div>
            <AgentPresenceMeta
              name={agentName}
              agentId={agentId}
              role={config?.role}
              isBusinessAgent={business}
              presenter={config?.identity ?? undefined}
              className="mt-3"
            />
            {business ? (
              <button
                type="button"
                onClick={() => onEditSection("presence")}
                className="mt-2 text-xs font-semibold text-[var(--wireline-color-action-primary-default)] hover:underline"
              >
                Customize agent presence
              </button>
            ) : null}
          </CardShell>

          <CardShell
            label="Voice"
            action="Preview"
            delay={120}
            onActivate={() => onEditSection("voice")}
            className="min-h-[300px]"
          >
            <div className="font-[var(--wireline-font-display)] text-[22px] tracking-[-0.01em]">
              {voiceName}
            </div>
            <div className="mt-1 text-xs text-[var(--wireline-color-text-secondary)]">
              {providerLabel(config?.voice?.provider)}
            </div>
            {isPresenterVoice ? (
              <PresenterPstnVoiceNotice
                hasLiveLine={hasLiveLine}
                phoneVoiceConfigured={hasPhoneVoice}
                voiceEditHref={`/training?agent=${encodeURIComponent(agentId)}`}
                className="mt-4"
              />
            ) : null}
            <div className="mt-4 flex h-8 items-end gap-0.5" aria-hidden="true">
              {[40, 80, 100, 55, 70, 90, 45, 65, 78, 52].map((height, index) => (
                <div
                  key={index}
                  className="w-[3px] rounded-sm"
                  style={{
                    height: `${height}%`,
                    background:
                      index % 3 === 2
                        ? "var(--wireline-color-action-primary-default)"
                        : "var(--wireline-color-action-primary-container)",
                  }}
                />
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              {VOICES.map((voice) => {
                const selected =
                  voice.name === voiceName ||
                  (voice.name === "Aria" && voiceName === "Managed Voice");
                return (
                  <div
                    key={voice.name}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                      selected
                        ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-action-primary-pressed)]"
                        : "border-[var(--wireline-color-border-subtle)] text-[var(--wireline-color-text-tertiary)]"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`grid size-4 place-items-center rounded ${selected ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
                      >
                        {selected ? "✓" : ""}
                      </span>
                      {voice.name}
                    </span>
                    <span className="text-[10px]">{voice.tone}</span>
                  </div>
                );
              })}
            </div>
          </CardShell>
        </div>

        <Connector />

        <CardShell
          label="Workflows & Capabilities"
          action={`${activeCount} of ${workflowRows.length + 1} active`}
          delay={160}
          onActivate={() => onEditSection("workflows")}
          className="min-h-[170px]"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {workflowRows.map((tool) => {
              const on = enabled.has(tool.name);
              return (
                <div
                  key={tool.name}
                  className={
                    on
                      ? "rounded-lg border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] p-2.5"
                      : "rounded-lg border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-2.5"
                  }
                >
                  <div
                    className={
                      on
                        ? "text-[11px] font-semibold text-[var(--wireline-color-action-primary-pressed)]"
                        : "text-[11px] font-medium text-[var(--wireline-color-text-tertiary)]"
                    }
                  >
                    {on ? "✓ " : "○ "}
                    {tool.label}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--wireline-color-text-tertiary)]">
                    {on ? tool.detail : "Off"}
                  </div>
                </div>
              );
            })}
            <div className="grid min-h-[54px] place-items-center rounded-lg border border-dashed border-[var(--wireline-color-border-strong)] p-2.5 text-[11px] text-[var(--wireline-color-text-tertiary)]">
              + Add workflow
            </div>
          </div>
        </CardShell>

        <Connector />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardShell
            label="Knowledge Base"
            action="Manage"
            delay={200}
            onActivate={() => onEditSection("knowledge")}
            className="min-h-[205px]"
          >
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: docCount, label: "Docs" },
                { value: directives.length, label: "Rules" },
                { value: activeCount, label: "Workflows" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg bg-[var(--wireline-color-surface-subtle)] p-3 text-center"
                >
                  <div className="font-[var(--wireline-font-display)] text-2xl text-[var(--wireline-color-action-primary-default)]">
                    {stat.value}
                  </div>
                  <div className="mt-1 font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em] text-[var(--wireline-color-text-tertiary)]">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-[var(--wireline-color-border-strong)] py-2 text-center text-xs text-[var(--wireline-color-text-tertiary)]">
              + Add knowledge
            </div>
          </CardShell>

          <CardShell
            label="Situations"
            action="Compose"
            delay={240}
            onActivate={() => onEditSection("situations")}
            className="min-h-[205px]"
          >
            <div className="flex flex-col gap-2">
              {situationRows.map((situation, index) => {
                const { trigger, action } = situationParts(situation);
                return (
                  <div
                    key={`${situation}-${index}`}
                    className="rounded-lg border border-[var(--wireline-color-border-subtle)] px-3 py-2.5"
                  >
                    <p className="text-sm font-medium leading-snug text-[var(--wireline-color-text-primary)]">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--wireline-color-action-primary-default)]">
                        When
                      </span>{" "}
                      {trigger}
                    </p>
                    {action ? (
                      <p className="mt-1 text-xs leading-relaxed text-[var(--wireline-color-text-secondary)] line-clamp-2">
                        {action}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              <div className="rounded-lg border border-dashed border-[var(--wireline-color-border-strong)] py-2 text-center text-xs text-[var(--wireline-color-text-tertiary)]">
                + Add situation
              </div>
            </div>
          </CardShell>
        </div>

        <Connector />

        <CardShell
          label="Call Model"
          action="Configure"
          delay={280}
          onActivate={() => onEditSection("model")}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(260px,1fr)] lg:items-start">
            <div>
              <div className="font-[var(--wireline-font-display)] text-xl tracking-[-0.01em]">
                {modelLabel}
              </div>
              <div className="mt-1 text-xs text-[var(--wireline-color-text-secondary)]">
                {config?.runtime?.provider
                  ? `${config.runtime.provider} · auto-routes per task`
                  : "Auto-routes to best model per task"}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {["Auto route", "Wireline Live", "Wireline Pro", "Wireline Deep"].map(
                (model, index) => (
                  <span
                    key={model}
                    className={`rounded-lg border px-2 py-2 ${index === 0 ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-primary" : "border-border text-muted-foreground"}`}
                  >
                    {model}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-[var(--wireline-color-surface-subtle)]">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${temperaturePct}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
            <span>Focused</span>
            <span>Temperature {temperature.toFixed(2)}</span>
            <span>Expressive</span>
          </div>
        </CardShell>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardShell
            label={business ? "Business Profile" : "Line Profile"}
            action="Edit"
            delay={320}
            onActivate={() => onEditSection("business")}
          >
            <div className="grid gap-3 text-xs text-[var(--wireline-color-text-secondary)]">
              <div className="flex items-center justify-between rounded-lg bg-[var(--wireline-color-surface-subtle)] px-3 py-2">
                <span>◷ Hours</span>
                <span className="font-semibold text-foreground">
                  {config?.businessHours ? "Configured" : "Not set"}
                </span>
              </div>
              <div className="flex gap-1">{weekdayStrip()}</div>
              <div className="grid grid-cols-2 gap-2">
                <span className="rounded-lg border border-border px-3 py-2">
                  ◈ {config?.complianceMode || "Standard"}
                </span>
                <span className="rounded-lg border border-border px-3 py-2">
                  ◎ {config?.runtime?.provider || "General"}
                </span>
              </div>
              <div className="rounded-lg border border-border px-3 py-2 font-mono text-[10px]">
                {profileLine || "Add business name, website, and support email"}
              </div>
            </div>
          </CardShell>

          <CardShell
            label="Connections"
            action="Manage"
            delay={360}
            onActivate={() => onEditSection("connections")}
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              {connectionRows.map((connection) => (
                <div
                  key={connection.label}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[var(--wireline-color-text-secondary)]"
                >
                  <CheckCircle2
                    className={
                      connection.active ? "size-3 text-primary" : "size-3 text-muted-foreground/45"
                    }
                  />
                  <span>{connection.label}</span>
                </div>
              ))}
            </div>
          </CardShell>
        </div>

        <CardShell
          label="Escalation & Guardrails"
          action="Edit"
          delay={400}
          onActivate={() => onEditSection("guardrails")}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg bg-[var(--wireline-color-surface-subtle)] p-3">
              <p className="text-xs font-semibold text-foreground">Escalation routing</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Phone: {config?.escalationPhone || "Not set"}
              </p>
              <p className="text-xs text-muted-foreground">
                Email: {config?.escalationEmail || "Not set"}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--wireline-color-surface-subtle)] p-3">
              <p className="text-xs font-semibold text-foreground">Warm-transfer</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {config?.escalationHandoffEnabled ? "Enabled" : "Ready to enable"}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--wireline-color-surface-subtle)] p-3">
              <p className="text-xs font-semibold text-foreground">Instant triggers</p>
              <p className="mt-1 text-xs text-muted-foreground">
                lawsuit · cancel account · manager
              </p>
            </div>
          </div>
        </CardShell>

        {selectedAgent ? <AgentLaunchReadinessCard agent={selectedAgent} config={config} /> : null}
      </div>
    </div>
  );
}
