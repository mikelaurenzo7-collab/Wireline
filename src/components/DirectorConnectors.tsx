/**
 * DirectorConnectors — the "Connectors" tab inside the Director workspace.
 *
 * Where a single agent's Connectors tab wires THAT agent to the world, the
 * Director's view is account-level: it shows the channels the WHOLE fleet acts
 * through (email, calendar, CRM, SMS, phone) with their live connection state
 * and a one-tap jump to the place that manages each. The Director is the boss,
 * so it watches the shared plumbing rather than per-agent toggles.
 */
import { useNavigate } from "react-router-dom";
import {
  Plug,
  Mail,
  CalendarCheck,
  Database,
  MessageCircle,
  PhoneCall,
  Loader2,
  Check,
  ArrowUpRight,
} from "lucide-react";
import type { DirectorConnectorsData } from "./DirectorWorkspace";
import { cn } from "../lib/utils";

interface Props {
  connectors: DirectorConnectorsData | null;
  loading: boolean;
}

export default function DirectorConnectors({ connectors, loading }: Props) {
  const navigate = useNavigate();

  if (loading || !connectors) {
    return (
      <div className="flex items-center justify-center py-16 text-muted">
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <span className="text-[12px]">Couldn&apos;t load connectors.</span>
        )}
      </div>
    );
  }

  const rows: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    connected: boolean;
    detail: string;
    manage: { label: string; to: string };
  }[] = [
    {
      icon: Mail,
      label: "Email",
      connected: connectors.email.connected,
      detail: connectors.email.connected
        ? `${connectors.email.count} mailbox${connectors.email.count === 1 ? "" : "es"} connected`
        : "No mailbox connected — agents can't send or read email yet",
      manage: { label: "Manage email", to: "/integrations" },
    },
    {
      icon: CalendarCheck,
      label: "Calendar",
      connected: connectors.calendar.connected,
      detail: connectors.calendar.connected
        ? "Connected — agents can book & check availability"
        : "Not connected — agents can't schedule into your calendar",
      manage: { label: "Connect calendar", to: "/integrations" },
    },
    {
      icon: Database,
      label: "CRM",
      connected: connectors.crm.connected,
      detail: connectors.crm.connected
        ? `${connectors.crm.type ?? "CRM"} connected — leads & contacts sync`
        : "No CRM connected — leads stay inside Wireline",
      manage: { label: "Connect CRM", to: "/integrations" },
    },
    {
      icon: MessageCircle,
      label: "SMS & messaging",
      connected: connectors.sms.connected,
      detail: connectors.sms.connected
        ? "Texting enabled — agents can send & receive SMS"
        : "Not set up — agents can't text customers",
      manage: { label: "Set up messaging", to: "/admin?tab=carrier" },
    },
    {
      icon: PhoneCall,
      label: "Phone",
      connected: connectors.phone.connected,
      detail: connectors.phone.connected
        ? "A phone number is live for inbound & outbound calls"
        : "No number provisioned — calls aren't live yet",
      manage: { label: "Set up phone", to: "/admin?tab=carrier" },
    },
  ];

  const connectedCount = rows.filter((r) => r.connected).length;

  return (
    <div className="p-4 space-y-4">
      {/* Hero */}
      <section className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #10B981, transparent)" }}
        />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl glass border border-emerald-500/30 text-emerald-600 flex items-center justify-center shrink-0">
              <Plug className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display italic lowercase text-xl text-ink leading-tight">
                fleet connectors
              </h3>
              <p className="text-[10px] uppercase tracking-[0.28em] text-muted/70">
                Channels every agent shares
              </p>
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-mono text-muted/80 tabular-nums">
            {connectedCount}/{rows.length} live
          </span>
        </div>
      </section>

      {/* Connector rows */}
      <section className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cn(
              "rounded-2xl border p-4 flex items-start gap-3 transition-colors",
              r.connected ? "border-emerald-500/25 bg-emerald-500/[0.03]" : "border-black/10 glass",
            )}
          >
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
                r.connected
                  ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                  : "border-black/12 text-muted bg-black/[0.03]",
              )}
            >
              <r.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-ink">{r.label}</p>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-[0.16em] border",
                    r.connected
                      ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10"
                      : "border-black/12 text-muted/70 bg-black/[0.03]",
                  )}
                >
                  {r.connected && <Check className="w-2.5 h-2.5" />}
                  {r.connected ? "Connected" : "Off"}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-muted leading-relaxed">{r.detail}</p>
              <button
                onClick={() => navigate(r.manage.to)}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-brand hover:text-brand/80 transition-colors"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                {r.manage.label}
              </button>
            </div>
          </div>
        ))}
      </section>

      <p className="text-[10px] text-muted/70 leading-relaxed text-center px-4">
        Connectors are shared across your whole fleet. Wire them once here and every agent can use
        them — route a specific mailbox to a specific agent from{" "}
        <button onClick={() => navigate("/integrations")} className="text-brand hover:underline">
          Integrations
        </button>
        .
      </p>
    </div>
  );
}
