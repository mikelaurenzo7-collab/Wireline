import { useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";

import CrmConnectionCard from "../components/CrmConnectionCard";
import IntegrationOperatingMap from "../components/integrations/IntegrationOperatingMap";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch } from "../lib/api";

type ComplianceAction = {
  label: string;
  description: string;
  href?: string;
};

type ComplianceStatus = {
  marketing_sales_outbound_enabled: boolean;
  federal_dnc_configured: boolean;
  tenant_dnc_checks_apply: boolean;
  express_written_consent_required: boolean;
  enforcement_owner: "server";
  recovery_actions: ComplianceAction[];
};

const fallbackCompliance: ComplianceStatus = {
  marketing_sales_outbound_enabled: false,
  federal_dnc_configured: false,
  tenant_dnc_checks_apply: true,
  express_written_consent_required: true,
  enforcement_owner: "server",
  recovery_actions: [
    {
      label: "Load compliance status",
      description: "Refresh this page to re-check server-owned outbound compliance readiness.",
    },
  ],
};

function StatusPill({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        ok
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

function OutboundComplianceCard() {
  const [status, setStatus] = useState<ComplianceStatus>(fallbackCompliance);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/outbound/compliance-status")
      .then(async (response) => {
        const body = (await response.json()) as { compliance?: ComplianceStatus };
        if (!cancelled && response.ok && body.compliance) setStatus(body.compliance);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="wl-eyebrow wl-eyebrow--muted wl-eyebrow--no-rule">Phone compliance</p>
          <h2 className="mt-2 font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-0.03em] text-foreground">
            Outbound readiness
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The server owns DNC and TCPA enforcement. This panel only displays the current status,
            blocked-call recovery paths, and the next action to take before marketing or sales
            calls.
          </p>
        </div>
        <StatusPill ok={status.marketing_sales_outbound_enabled}>
          {status.marketing_sales_outbound_enabled
            ? "Marketing/sales outbound enabled"
            : "Marketing/sales outbound paused"}
        </StatusPill>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <StatusPill ok={status.federal_dnc_configured}>
            {status.federal_dnc_configured ? "Federal DNC configured" : "Federal DNC missing"}
          </StatusPill>
          <p className="mt-3 text-sm text-muted-foreground">
            Marketing and sales dials require a configured federal scrub vendor before dispatch.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <StatusPill ok={status.tenant_dnc_checks_apply}>Tenant DNC checks apply</StatusPill>
          <p className="mt-3 text-sm text-muted-foreground">
            Tenant do-not-call entries are checked server-side for every outbound dial attempt.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <StatusPill ok={status.express_written_consent_required}>
            Express written consent required
          </StatusPill>
          <p className="mt-3 text-sm text-muted-foreground">
            Marketing or sales calls must carry an explicit consent attestation and audit source.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Blocked call guidance {loaded ? "" : "(checking…)"}
        </div>
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {status.recovery_actions.map((action) => (
            <li key={action.label} className="rounded-xl bg-background/70 p-3 text-sm">
              <div className="font-medium text-foreground">{action.label}</div>
              <p className="mt-1 text-muted-foreground">{action.description}</p>
              {action.href ? (
                <a
                  className="mt-2 inline-block text-brand underline-offset-2 hover:underline"
                  href={action.href}
                >
                  Take action
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function ConnectionsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame className="max-w-[1080px] gap-4">
        <OutboundComplianceCard />
        <IntegrationOperatingMap />
        <CrmConnectionCard />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
