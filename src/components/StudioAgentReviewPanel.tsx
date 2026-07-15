import { useEffect, useState } from "react";
import { CheckCircle2, MessageCircle, PhoneCall, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button, Skeleton } from "./atoms";
import { StatusNotice } from "./molecules";
import { authFetch } from "../lib/api";
import { formatAgentRoleLabel } from "../lib/product-copy";
import { resolveVoiceLabel } from "../lib/voice-catalog";

const GREETING_PREFIX = "Opening greeting:";

type AgentConfigResponse = {
  role?: string | null;
  personality?: string | null;
  directives?: Array<{ content?: string | null }>;
  voice?: {
    voiceId?: string | null;
    provider?: string | null;
  };
};

type StudioAgentReviewPanelProps = {
  agentId: string;
  agentName: string;
  agentRole?: string | null;
  phoneNumber?: string | null;
  onEdit: () => void;
  onTest: () => void;
  className?: string;
};

function openingGreeting(directives: AgentConfigResponse["directives"]) {
  const match = directives?.find((directive) => directive.content?.startsWith(GREETING_PREFIX));
  return match?.content?.slice(GREETING_PREFIX.length).trim() || "Uses the standard greeting";
}

function toneLabel(personality?: string | null) {
  const value = personality?.trim();
  if (!value) return "Clear and professional";
  return value.split(/[.\n]/)[0]?.trim() || "Clear and professional";
}

export default function StudioAgentReviewPanel({
  agentId,
  agentName,
  agentRole,
  phoneNumber,
  onEdit,
  onTest,
  className = "",
}: StudioAgentReviewPanelProps) {
  const [config, setConfig] = useState<AgentConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Setup summary could not be loaded.");
        return (await response.json()) as AgentConfigResponse;
      })
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Setup summary could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const voiceName = resolveVoiceLabel(config?.voice?.voiceId);
  const role = formatAgentRoleLabel(config?.role ?? agentRole ?? null);
  const hasPhone = Boolean(phoneNumber);

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto bg-background ${className}`}>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <header>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            Review
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Is {agentName} ready for customers?
          </h2>
        </header>

        {error ? (
          <StatusNotice tone="warning" title="Summary unavailable">
            {error} Your saved setup is unchanged.
          </StatusNotice>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="Launch summary">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="rounded-xl border border-border bg-background p-4">
                  <Skeleton shape="text" className="h-3 w-20" />
                  <Skeleton shape="text" className="mt-3 h-5 w-40 max-w-full" />
                </div>
              ))}
            </div>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Customer-facing job", value: role },
                { label: "Tone", value: toneLabel(config?.personality) },
                { label: "Opening greeting", value: openingGreeting(config?.directives) },
                { label: "Managed phone voice", value: voiceName },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-border bg-background p-4">
                  <dt className="text-xs font-semibold text-muted-foreground">{item.label}</dt>
                  <dd className="mt-2 text-sm font-semibold leading-5 text-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <StatusNotice
          tone={hasPhone ? "success" : "warning"}
          title={hasPhone ? "Live customer line connected" : "Browser-ready; live line not connected"}
        >
          {hasPhone
            ? `${agentName} is live at ${phoneNumber}. Place one inbound test before sharing the number.`
            : "Test in the browser, then connect a phone line when the greeting and handoff are ready."}
        </StatusNotice>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="Next actions">
          <h3 className="text-base font-semibold text-foreground">Next action</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Button type="button" variant="secondary" onClick={onEdit} className="justify-center">
              <Settings2 className="size-4" aria-hidden="true" />
              Edit setup
            </Button>
            <Button type="button" variant="secondary" onClick={onTest} className="justify-center">
              <MessageCircle className="size-4" aria-hidden="true" />
              Test conversation
            </Button>
            <Button asChild className="justify-center">
              <Link to={hasPhone ? "/phone?tab=logs" : "/connections"}>
                {hasPhone ? (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                ) : (
                  <PhoneCall className="size-4" aria-hidden="true" />
                )}
                {hasPhone ? "Review outcomes" : "Connect phone"}
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
