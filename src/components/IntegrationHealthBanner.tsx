import { AlertTriangle } from "lucide-react";

export type IntegrationHealthPayload = {
  reconnect_google_calendar?: boolean;
  reconnect_microsoft_calendar?: boolean;
  calendar_scope_unknown_google?: boolean;
  calendar_scope_unknown_microsoft?: boolean;
  reasons?: string[] | null;
};

type Props = {
  health: IntegrationHealthPayload | null;
  onOpenIntegrations?: () => void;
};

export default function IntegrationHealthBanner({ health, onOpenIntegrations }: Props) {
  if (!health) return null;

  // Defensively coerce — the payload comes from an external API endpoint
  // (`/api/integrations/health`), so fields may legitimately be missing
  // on older deployments or partial responses.
  const reasons = Array.isArray(health.reasons) ? health.reasons : [];
  const needsAttention =
    Boolean(health.reconnect_google_calendar) ||
    Boolean(health.reconnect_microsoft_calendar) ||
    reasons.length > 0;
  if (!needsAttention) return null;

  return (
    <div
      className="mb-4 border px-4 py-3.5 flex items-start gap-3"
      style={{ borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)" }}
      role="status"
    >
      <div
        className="w-8 h-8 flex items-center justify-center shrink-0 border"
        style={{ borderColor: "rgba(245,158,11,0.30)", background: "rgba(245,158,11,0.14)" }}
      >
        <AlertTriangle className="w-4 h-4" style={{ color: "#d97706" }} aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "#92400e" }}>
            Reconnect mail or calendar
          </p>
          {onOpenIntegrations && (
            <button
              type="button"
              onClick={onOpenIntegrations}
              className="text-[10px] uppercase tracking-[0.18em] text-brand hover:underline"
            >
              System → integrations
            </button>
          )}
        </div>
        <ul className="list-disc pl-4 space-y-1 text-[10px] text-muted leading-relaxed">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
