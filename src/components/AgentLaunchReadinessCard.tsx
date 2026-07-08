import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import type { AgentToolName } from "../lib/agent-capabilities";

type AgentSummary = {
  id: string;
  name?: string | null;
  role?: string | null;
  phone_number?: string | null;
  channel?: string | null;
};

type AgentConfig = {
  role?: string | null;
  enabledTools?: AgentToolName[];
  voice?: {
    voiceId?: string | null;
    phoneVoiceId?: string | null;
    phoneVoiceProvider?: string | null;
  };
  personality?: string | null;
  directives?: Array<{ content?: string | null }>;
  knowledge?: Array<{ content?: string | null }>;
  complianceMode?: string | null;
  businessVariables?: Record<string, unknown> | null;
  escalationPhone?: string | null;
  escalationEmail?: string | null;
  escalationHandoffEnabled?: boolean | null;
};

type CallRecord = {
  agentId?: string;
  agent_id?: string;
  outcomeTag?: string;
  tag?: string;
  status?: string;
};

type ReadinessItem = {
  id: string;
  label: string;
  complete: boolean;
  detail: string;
  href: string;
  cta: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truthyBusinessVar(vars: Record<string, unknown> | null | undefined, keys: string[]) {
  return keys.some((key) => {
    const value = vars?.[key];
    return typeof value === "boolean" ? value : text(value).length > 0;
  });
}

function isOutboundEnabled(config: AgentConfig | null) {
  const tools = new Set(config?.enabledTools ?? []);
  return (
    tools.has("search_leads") ||
    tools.has("update_lead_status") ||
    tools.has("leave_voicemail") ||
    tools.has("schedule_callback") ||
    truthyBusinessVar(config?.businessVariables, [
      "outbound_enabled",
      "dialing_enabled",
      "call_direction",
    ])
  );
}

function passedTestCall(calls: CallRecord[], agentId: string) {
  return calls.some((call) => {
    if ((call.agentId || call.agent_id) !== agentId) return false;
    const marker = `${call.outcomeTag || ""} ${call.tag || ""} ${call.status || ""}`.toLowerCase();
    return /completed|scheduled|qualified|resolved|success|passed/.test(marker);
  });
}

export function buildAgentLaunchReadiness({
  agent,
  config,
  balanceUsd,
  calls,
}: {
  agent: AgentSummary;
  config: AgentConfig | null;
  balanceUsd: number | null;
  calls: CallRecord[];
}): ReadinessItem[] {
  const vars = config?.businessVariables ?? null;
  const name = text(agent.name);
  const role = text(config?.role) || text(agent.role);
  const purpose =
    truthyBusinessVar(vars, ["purpose", "agent_purpose", "business_goal", "call_goal"]) ||
    (config?.directives ?? []).some((item) => text(item.content).length >= 24) ||
    text(config?.personality).length >= 24;
  const training = (config?.knowledge?.length ?? 0) > 0 || (config?.directives?.length ?? 0) > 0;
  const handoff = Boolean(
    config?.escalationHandoffEnabled ||
    text(config?.escalationPhone) ||
    text(config?.escalationEmail),
  );
  const outboundEnabled = isOutboundEnabled(config);
  const consentKnown =
    !outboundEnabled ||
    Boolean(
      config?.complianceMode ||
      truthyBusinessVar(vars, ["outbound_consent", "consent_posture", "tcpa_basis", "dnc_policy"]),
    );
  const wired = Boolean(
    agent.phone_number ||
    agent.channel === "email" ||
    (config?.voice?.phoneVoiceId && config?.voice?.phoneVoiceProvider),
  );
  const funded = balanceUsd === null ? true : balanceUsd > 0;
  const tested = passedTestCall(calls, agent.id);

  return [
    {
      id: "identity-purpose",
      label: "Name, role, purpose",
      complete: Boolean(name && role && purpose),
      detail:
        name && role && purpose
          ? "Agent identity is clear."
          : "Add a name, role, and plain-English job purpose.",
      href: `/studio?agent=${encodeURIComponent(agent.id)}&view=workspace`,
      cta: "Open Studio",
    },
    {
      id: "training-material",
      label: "Training material",
      complete: training,
      detail: training
        ? "Training instructions or source facts exist."
        : "Add instructions, FAQs, documents, or source material.",
      href: `/knowledge?agent=${encodeURIComponent(agent.id)}&tab=knowledge`,
      cta: "Train",
    },
    {
      id: "handoff-policy",
      label: "Escalation / handoff",
      complete: handoff,
      detail: handoff
        ? "Human handoff is configured."
        : "Set who takes over and when the agent must escalate.",
      href: `/knowledge?agent=${encodeURIComponent(agent.id)}&tab=flows`,
      cta: "Set handoff",
    },
    {
      id: "outbound-consent",
      label: "Outbound consent posture",
      complete: consentKnown,
      detail: consentKnown
        ? outboundEnabled
          ? "Outbound consent posture is recorded."
          : "Outbound dialing is not enabled."
        : "Record consent basis, opt-out, and DNC posture before dialing.",
      href: `/phone?tab=outbound&agent=${encodeURIComponent(agent.id)}`,
      cta: "Review outbound",
    },
    {
      id: "channel-wiring",
      label: "Phone / channel wiring",
      complete: wired,
      detail: wired
        ? "A live phone or channel path is wired."
        : "Assign a number, phone voice, email, or channel route.",
      href: `/connections?agent=${encodeURIComponent(agent.id)}`,
      cta: "Wire channel",
    },
    {
      id: "usage-entitlement",
      label: "Usage entitlement",
      complete: funded,
      detail: funded
        ? "Plan or Conversation Balance can support launch usage."
        : "Add Conversation Balance or review plan capacity before live usage.",
      href: "/settings/billing",
      cta: "Billing",
    },
    {
      id: "test-passed",
      label: "Test call / simulation",
      complete: tested,
      detail: tested
        ? "A recent test or live run completed successfully."
        : "Run a simulator or test call before first customer traffic.",
      href: `/knowledge?agent=${encodeURIComponent(agent.id)}&tab=simulator`,
      cta: "Run test",
    },
  ];
}

export default function AgentLaunchReadinessCard({
  agent,
  config: providedConfig,
  compact = false,
  className,
}: {
  agent: AgentSummary;
  config?: AgentConfig | null;
  compact?: boolean;
  className?: string;
}) {
  const [config, setConfig] = useState<AgentConfig | null>(providedConfig ?? null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);

  useEffect(() => {
    if (providedConfig !== undefined) setConfig(providedConfig);
  }, [providedConfig]);

  useEffect(() => {
    let cancelled = false;
    const requests: Promise<void>[] = [];
    if (providedConfig === undefined) {
      requests.push(
        authFetch(`/api/agent-config/${encodeURIComponent(agent.id)}`)
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => {
            if (!cancelled) setConfig(payload as AgentConfig | null);
          })
          .catch(() => {
            if (!cancelled) setConfig(null);
          }),
      );
    }
    requests.push(
      authFetch("/api/conversation-balance")
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!cancelled && payload && typeof payload.balance_usd === "number")
            setBalanceUsd(payload.balance_usd);
        })
        .catch(() => {}),
      authFetch("/api/calls?limit=20")
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!cancelled) setCalls(Array.isArray(payload?.calls) ? payload.calls : []);
        })
        .catch(() => {}),
    );
    void Promise.all(requests);
    return () => {
      cancelled = true;
    };
  }, [agent.id, providedConfig]);

  const items = useMemo(
    () => buildAgentLaunchReadiness({ agent, config, balanceUsd, calls }),
    [agent, balanceUsd, calls, config],
  );
  const complete = items.filter((item) => item.complete).length;
  const nextItems = items.filter((item) => !item.complete);

  return (
    <section
      aria-label="Launch readiness"
      className={cn("wl-paper wl-paper-elevated rounded-[14px] p-5", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            Launch readiness
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">
            {complete}/{items.length} checks complete
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Resolve every item before live customer traffic. Each incomplete check links to the
            exact setup flow.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            complete === items.length
              ? "bg-primary/10 text-primary"
              : "bg-amber-500/10 text-amber-700",
          )}
        >
          {complete === items.length ? "Ready" : "Needs work"}
        </span>
      </div>
      <div
        className={cn("mt-4 grid gap-2", compact ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3")}
      >
        {(compact ? items.slice(0, 4) : items).map((item) => (
          <Link
            key={item.id}
            to={item.href}
            className="group rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-muted/40"
          >
            <div className="flex items-start gap-2">
              {item.complete ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                {!item.complete ? (
                  <p className="mt-2 text-xs font-semibold text-primary">{item.cta} →</p>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {compact && nextItems.length > 4 ? (
        <Link
          to={`/studio?agent=${encodeURIComponent(agent.id)}`}
          className="mt-3 inline-flex text-xs font-semibold text-primary"
        >
          View all launch checks →
        </Link>
      ) : null}
    </section>
  );
}
