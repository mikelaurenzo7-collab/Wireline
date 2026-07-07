import { CheckCircle2, FlaskConical, Layers3, ShieldCheck } from "lucide-react";

import {
  WORKSPACE_INTEGRATION_CATALOG,
  type WorkspaceIntegration,
  type WorkspaceIntegrationReadiness,
} from "../../lib/workspace-integration-catalog";
import { cn } from "../../lib/utils";
import { getIntegrationLogo } from "../layout/IntegrationLogos";

const READINESS_COPY: Record<
  WorkspaceIntegrationReadiness,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  live: {
    label: "Live",
    className:
      "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-action-primary-pressed)]",
    Icon: CheckCircle2,
  },
  beta: {
    label: "Beta",
    className: "border-brand/35 bg-brand/8 text-brand",
    Icon: FlaskConical,
  },
  planned: {
    label: "In setup",
    className:
      "border-[var(--wireline-color-status-warning)]/35 bg-[var(--wireline-color-status-warning)]/10 text-[var(--wireline-color-status-warning)]",
    Icon: Layers3,
  },
  platform: {
    label: "Platform",
    className: "border-border bg-[var(--wireline-color-surface-subtle)] text-foreground/80",
    Icon: ShieldCheck,
  },
};

const readinessOrder: WorkspaceIntegrationReadiness[] = ["live", "platform", "beta", "planned"];

export default function IntegrationOperatingMap() {
  const readinessCounts = readinessOrder.map((status) => ({
    status,
    count: WORKSPACE_INTEGRATION_CATALOG.filter((entry) => entry.readiness === status).length,
  }));

  return (
    <section className="rounded-md wl-panel border border-border px-3 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="wl-label text-muted/80">Integration map</h2>
        <div className="grid grid-cols-4 gap-2 md:min-w-[24rem]">
          {readinessCounts.map(({ status, count }) => {
            const meta = READINESS_COPY[status];
            const Icon = meta.Icon;
            return (
              <div key={status} className={cn("rounded-md border px-2 py-1.5", meta.className)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{meta.label}</span>
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                </div>
                <div className="text-base font-semibold tabular-nums">{count}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 divide-y divide-border rounded-md border border-border">
        <div className="hidden grid-cols-[13rem_8rem_minmax(17rem,1fr)_9rem] gap-3 bg-[var(--wireline-color-surface-subtle)] px-3 py-2 text-xs font-semibold text-muted/80 lg:grid">
          <div>Vendor</div>
          <div>Type</div>
          <div>Capabilities</div>
          <div>Status</div>
        </div>
        {WORKSPACE_INTEGRATION_CATALOG.map((entry) => (
          <IntegrationRow key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function IntegrationRow({ entry }: { entry: WorkspaceIntegration }) {
  const readiness = READINESS_COPY[entry.readiness];
  const Icon = readiness.Icon;
  const logo = getIntegrationLogo(entry.id);

  return (
    <div className="grid gap-3 px-3 py-3 text-sm lg:grid-cols-[13rem_8rem_minmax(17rem,1fr)_9rem] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background text-muted/80">
            {logo ?? <span className="text-xs font-semibold">{entry.label.slice(0, 2)}</span>}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{entry.label}</p>
            <p className="truncate text-xs text-muted/70">{entry.family}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs capitalize text-muted/80">
          {entry.connection}
        </span>
        {entry.toolIntegrations?.map((integration) => (
          <span
            key={integration}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-muted/80"
          >
            {integration.replace(/_/g, " ")}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {entry.capabilities.map((capability) => (
          <span
            key={capability}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-muted/80"
          >
            {capability}
          </span>
        ))}
      </div>
      <div
        className={cn(
          "inline-flex w-max items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
          readiness.className,
        )}
      >
        <Icon className="size-3" aria-hidden="true" />
        {readiness.label}
      </div>
    </div>
  );
}
