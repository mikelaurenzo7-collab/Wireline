import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";

export type IntegrationHealthPayload = {
  reconnect_google_calendar: boolean;
  reconnect_microsoft_calendar: boolean;
  calendar_scope_unknown_google: boolean;
  calendar_scope_unknown_microsoft: boolean;
  reasons: string[];
};

type Props = {
  health: IntegrationHealthPayload | null;
  onOpenIntegrations?: () => void;
};

export default function IntegrationHealthBanner({ health, onOpenIntegrations }: Props) {
  if (!health) return null;

  const needsAttention =
    health.reconnect_google_calendar ||
    health.reconnect_microsoft_calendar ||
    health.reasons.length > 0;
  if (!needsAttention) return null;

  return (
    <div
      className={cn(
        "mb-4 rounded-2xl border px-4 py-3.5 flex items-start gap-3",
        "border-amber-500/35 bg-amber-500/10",
      )}
      role="status"
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-amber-500/30 bg-amber-500/15">
        <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-200/90">
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
          {health.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
