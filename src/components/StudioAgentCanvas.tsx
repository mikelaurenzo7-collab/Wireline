import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import { authFetch } from "../lib/api";
import {
  AGENT_TOOL_CATALOG,
  BUSINESS_TOOL_NAMES,
  type AgentToolName,
} from "../lib/agent-capabilities";
import { formatAgentRoleLabel } from "../lib/product-copy";

type AgentConfig = {
  role: string | null;
  archetype: string | null;
  enabledTools: AgentToolName[];
  voice: { voiceId: string | null; provider: string | null };
  personality: string;
  directives: Array<{ id: string | number; content: string; priority?: number }>;
  knowledge: Array<{ id: string | number; content: string }>;
  runtime: { provider: string | null; model: string | null; temperature: number | null };
  isBusinessAgent?: boolean;
};

type StudioAgentCanvasProps = {
  agentId: string;
  agentName: string;
  isBusinessAgent?: boolean;
  onEditSection: (section: string) => void;
  className?: string;
};

const MONO_LABEL =
  "font-[var(--wireline-font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--wireline-color-text-tertiary)]";

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
      className={`wl-canvas-card group flex w-full flex-col rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-5 text-left transition-all hover:border-[var(--wireline-color-action-primary-default)] hover:shadow-[0_2px_12px_rgba(43,85,72,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wireline-color-action-primary-default)] ${className}`}
    >
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <span className={MONO_LABEL}>{label}</span>
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
    <div className="flex h-5 items-center justify-center" aria-hidden="true">
      <div className="h-5 border-l border-dashed border-[var(--wireline-color-border-strong)]" />
    </div>
  );
}

export default function StudioAgentCanvas({
  agentId,
  agentName,
  isBusinessAgent,
  onEditSection,
  className = "",
}: StudioAgentCanvasProps) {
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

  const workflows = useMemo(() => {
    const pool = AGENT_TOOL_CATALOG.filter((tool) =>
      business ? true : !BUSINESS_TOOL_NAMES.has(tool.name),
    );
    return pool
      .slice()
      .sort((a, b) => Number(enabled.has(b.name)) - Number(enabled.has(a.name)))
      .slice(0, 8);
  }, [business, enabled]);

  const activeCount = workflows.filter((tool) => enabled.has(tool.name)).length;
  const initial = (agentName || "A").trim().charAt(0).toUpperCase();
  const roleLabel = formatAgentRoleLabel(config?.role ?? null);
  const voiceName = config?.voice?.voiceId
    ? config.voice.voiceId.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
    : "Aria";
  const personality =
    config?.personality?.trim() ||
    "Concise, warm, and practical. Handles booking, identification, and FAQ responses.";
  const docCount = config?.knowledge?.length ?? 0;
  const directives = config?.directives ?? [];
  const fallbackSituations = [
    "Booking request - check calendar and confirm",
    "Help request - route to the right person",
    "Pricing question - use the rate sheet",
  ];

  if (loading) {
    return (
      <div
        className={`flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--wireline-color-canvas-default)] p-7 ${className}`}
        aria-busy="true"
        aria-label="Loading agent canvas"
      >
        <div className="h-3 w-28 animate-pulse rounded bg-[var(--wireline-color-surface-subtle)]" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-44 animate-pulse rounded-[14px] bg-[var(--wireline-color-surface-subtle)]" />
          <div className="h-44 animate-pulse rounded-[14px] bg-[var(--wireline-color-surface-subtle)]" />
        </div>
        <div className="h-40 animate-pulse rounded-[14px] bg-[var(--wireline-color-surface-subtle)]" />
      </div>
    );
  }

  return (
    <div
      className={`h-full min-h-0 overflow-y-auto bg-[var(--wireline-color-canvas-default)] p-7 ${className}`}
    >
      <div className="mb-6">
        <div className={MONO_LABEL}>Agent Canvas</div>
        <p className="mt-1.5 text-[13px] text-[var(--wireline-color-text-tertiary)]">
          Click any card to edit. Changes save automatically.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <CardShell label="Identity" action="Edit" delay={80} onActivate={() => onEditSection("identity")} className="min-h-[250px]">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-[12px] bg-[var(--wireline-color-action-primary-default)] font-[var(--wireline-font-mono)] text-base font-bold text-[var(--wireline-color-text-onAction)]">{initial}</div>
              <div>
                <div className="font-[var(--wireline-font-display)] text-[22px] tracking-[-0.01em]">{agentName || "Untitled assistant"}</div>
                <div className="text-xs text-[var(--wireline-color-text-tertiary)]">{roleLabel}</div>
              </div>
            </div>
            <div className="rounded-lg bg-[var(--wireline-color-surface-subtle)] px-3 py-3 text-xs leading-relaxed text-[var(--wireline-color-text-secondary)] line-clamp-4">Response style: {personality}</div>
          </CardShell>

          <CardShell label="Voice" action="Preview" delay={120} onActivate={() => onEditSection("voice")} className="min-h-[250px]">
            <div className="font-[var(--wireline-font-display)] text-[22px] tracking-[-0.01em]">{voiceName}</div>
            <div className="mt-1 text-xs text-[var(--wireline-color-text-secondary)]">Warm and confident - Wireline Voice</div>
            <div className="mt-3.5 flex h-8 items-end gap-0.5" aria-hidden="true">
              {[40, 80, 100, 55, 70, 90, 45, 65, 78, 52].map((height, index) => (
                <div key={index} className="w-[3px] rounded-sm" style={{ height: `${height}%`, background: index % 3 === 2 ? "var(--wireline-color-action-primary-default)" : "var(--wireline-color-action-primary-container)" }} />
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {[
                { name: voiceName, detail: "Warm - Confident", selected: true },
                { name: "Marcus", detail: "Calm - Deep", selected: false },
                { name: "Nova", detail: "Bright - Upbeat", selected: false },
                { name: "Taylor", detail: "Neutral - Pro", selected: false },
              ].map((voice) => (
                <div key={voice.name} className={voice.selected ? "flex items-center justify-between rounded-lg border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-3 py-2 text-[11px]" : "flex items-center justify-between rounded-lg border border-[var(--wireline-color-border-subtle)] px-3 py-2 text-[11px] text-[var(--wireline-color-text-tertiary)]"}>
                  <span className="font-semibold">{voice.selected ? "on " : "off "}{voice.name}</span>
                  <span>{voice.detail}</span>
                </div>
              ))}
            </div>
          </CardShell>
        </div>

        <Connector />

        <CardShell label="Workflows & Capabilities" action={`${activeCount} of ${workflows.length} active`} delay={160} onActivate={() => onEditSection("workflows")} className="min-h-[155px]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {workflows.map((tool) => {
              const on = enabled.has(tool.name);
              return (
                <div key={tool.name} className={on ? "rounded-lg border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] p-2.5" : "rounded-lg border border-[var(--wireline-color-border-default)] p-2.5"}>
                  <div className={on ? "text-[11px] font-semibold text-[var(--wireline-color-action-primary-pressed)]" : "text-[11px] font-medium text-[var(--wireline-color-text-tertiary)]"}>{on ? "on " : "off "}{tool.label}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--wireline-color-text-tertiary)] line-clamp-1">{tool.description}</div>
                </div>
              );
            })}
          </div>
        </CardShell>

        <Connector />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <CardShell label="Knowledge Base" action="Manage" delay={200} onActivate={() => onEditSection("knowledge")} className="min-h-[190px]">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: docCount, label: "Docs" },
                { value: directives.length, label: "FAQs" },
                { value: enabled.size, label: "Scripts" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-[var(--wireline-color-surface-subtle)] p-3 text-center">
                  <div className="font-[var(--wireline-font-display)] text-2xl text-[var(--wireline-color-action-primary-default)]">{stat.value}</div>
                  <div className="mt-0.5 font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em] text-[var(--wireline-color-text-tertiary)]">{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-dashed border-[var(--wireline-color-border-strong)] py-2 text-center text-xs text-[var(--wireline-color-text-tertiary)]">+ Add knowledge</div>
          </CardShell>

          <CardShell label="Situations" action="Compose" delay={240} onActivate={() => onEditSection("situations")} className="min-h-[190px]">
            <div className="flex flex-col gap-2">
              {(directives.length ? directives.slice(0, 3).map((directive) => directive.content) : fallbackSituations).map((content, index) => (
                <div key={`${content}-${index}`} className="rounded-lg border border-[var(--wireline-color-border-subtle)] px-3 py-2 text-xs leading-snug text-[var(--wireline-color-text-secondary)] line-clamp-2">
                  <span className="font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.1em] text-[var(--wireline-color-action-primary-default)]">When</span>{" "}{content}
                </div>
              ))}
              <div className="rounded-lg border border-dashed border-[var(--wireline-color-border-strong)] py-2 text-center text-xs text-[var(--wireline-color-text-tertiary)]">+ Add situation</div>
            </div>
          </CardShell>
        </div>
      </div>
    </div>
  );
}
