import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";
import { ShadButton } from "./ui/shadcn/ShadButton";

export type IntegrationHealthPayload = {
  reconnect_google_calendar?: boolean;
  reconnect_microsoft_calendar?: boolean;
  calendar_scope_unknown_google?: boolean;
  calendar_scope_unknown_microsoft?: boolean;
  reconnect_hubspot?: boolean;
  reconnect_salesforce?: boolean;
  reconnect_google_sheets?: boolean;
  reconnect_microsoft_mailbox?: boolean;
  reasons?: string[] | null;
};

type Props = {
  health: IntegrationHealthPayload | null;
  onOpenIntegrations?: () => void;
};

export default function IntegrationHealthBanner({ health, onOpenIntegrations }: Props) {
  if (!health) return null;

  // Defensively coerce — the payload comes from an external API endpoint
  // (`/api/oauth/integration-health`), so fields may legitimately be missing
  // on older deployments or partial responses.
  const reasons = Array.isArray(health.reasons) ? health.reasons : [];
  const needsAttention =
    Boolean(health.reconnect_google_calendar) ||
    Boolean(health.reconnect_microsoft_calendar) ||
    Boolean(health.reconnect_hubspot) ||
    Boolean(health.reconnect_salesforce) ||
    Boolean(health.reconnect_google_sheets) ||
    Boolean(health.reconnect_microsoft_mailbox) ||
    reasons.length > 0;
  if (!needsAttention) return null;

  return (
    <div
      className={cn(
        "mb-4 rounded-md border px-4 py-3.5 flex items-start gap-3",
        "border-amber-500/35 bg-amber-500/10",
      )}
      role="status"
    >
      <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 border border-amber-500/30 bg-amber-500/15">
        <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-200/90">
            Reconnect mail or calendar
          </p>
          {onOpenIntegrations && (
            <ShadButton
              type="button"
              disableAnimations
              variant="link"
              size="sm"
              onClick={onOpenIntegrations}
              className="h-auto p-0 wl-label text-brand"
            >
              Open integrations
            </ShadButton>
          )}
        </div>
        <ul className="list-disc pl-4 space-y-1 wl-micro-meta--muted leading-relaxed">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
