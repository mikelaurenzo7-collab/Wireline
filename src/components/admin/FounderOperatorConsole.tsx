/* eslint-disable @typescript-eslint/no-explicit-any -- operator telemetry payloads are loosely typed. */
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { useEffect, useState } from "react";
import { Activity, CreditCard, ShieldCheck } from "lucide-react";
import { authFetch } from "../../lib/api";
import { SystemPanel } from "./SystemPanel";
import { OwnerBillingSimulator } from "./OwnerBillingSimulator";
import { cn } from "../../lib/utils";

import LaunchReadinessPanel from "./LaunchReadinessPanel";

/**
 * Platform-operator tools — env integration matrix, SLO telemetry, and
 * billing simulators. Rendered on the Founder dashboard only, never in
 * customer Settings.
 */
export default function FounderOperatorConsole() {
  const [claudeStatus, setClaudeStatus] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any[] | null>(null);
  const [operationalSlos, setOperationalSlos] = useState<Record<string, unknown> | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [claudeRes, intRes, sloRes, settingsRes, agentsRes] = await Promise.all([
          authFetch("/api/claude/status").then((r) => (r.ok ? r.json() : null)),
          authFetch("/api/health/integrations").then((r) => (r.ok ? r.json() : null)),
          authFetch("/api/health/slos").then((r) => (r.ok ? r.json() : null)),
          authFetch("/api/settings").then((r) => r.json()),
          authFetch("/api/agents").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setClaudeStatus(claudeRes);
        setIntegrations(intRes?.integrations ?? null);
        setOperationalSlos(sloRes);
        setSettings(settingsRes);
        setAgents(agentsRes?.agents ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className={cn(WL_APP_CLASSES.settingsPanel, "animate-pulse h-24 rounded-md mb-5")} />
    );
  }

  return (
    <div className="mb-8 space-y-6">
      <LaunchReadinessPanel />
      <div>
        <p className="app-section-title mb-1 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-brand" />
          Platform · operator
        </p>
        <p className="text-[12px] text-muted/80 max-w-2xl leading-relaxed mb-4">
          Internal health, integration env matrix, and billing simulators — not shown to customer
          accounts.
        </p>
        <SystemPanel
          claudeStatus={claudeStatus}
          integrations={integrations}
          operationalSlos={operationalSlos}
        />
      </div>

      {settings && (
        <div>
          <p className="app-section-title mb-3 flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5 text-brand" />
            Billing · simulator
          </p>
          <OwnerBillingSimulator
            settings={settings}
            agents={agents}
            onSettingsChange={setSettings}
          />
        </div>
      )}

      <p className="chrome-subtle flex items-center gap-1.5 text-pretty">
        <Activity className="w-3 h-3" />
        Tenant-facing billing lives under Settings → Billing (usage + Stripe portal only).
      </p>
    </div>
  );
}
