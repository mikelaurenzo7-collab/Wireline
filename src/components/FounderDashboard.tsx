import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import {
  Users2,
  MessageSquare,
  Phone,
  ArrowUpRight,
  Headphones,
  Sparkles,
  Wrench,
  Rocket,
  HeartHandshake,
  Loader2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import DirectorWorkspace from "./DirectorWorkspace";
import ClientRouteViewport from "./layout/ClientRouteViewport";
import ClientToolbar from "./layout/ClientToolbar";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { WL_APP_CLASSES } from "../lib/wireline-director-design";
import { OPS_FOUNDER, WL_FLEET_CLASSES } from "../lib/wireline-ops-design";
import { MetricStatTile } from "./ui/MetricStatTile";
import FounderOperatorConsole from "./admin/FounderOperatorConsole";
import FounderOperatingCockpit from "./FounderOperatingCockpit";

/**
 * Founder's Dashboard — Mike's command surface for his staff of 6
 * Wireline AI agents (the dogfood team that answers Wireline's own
 * lines). Mirrors the server-side WIRELINE_PERSONAS roster.
 */

type StaffRole = "reception" | "sales" | "support" | "technical" | "onboarding" | "success";

interface FounderStats {
  ok: boolean;
  generated_at: string;
  users: { total: number; paying: number; trialing: number; new_last_7d: number };
  activation?: {
    activated_total: number;
    activated_last_7d: number;
    activation_rate_pct: number;
    median_time_to_activation_seconds: number | null;
  };
  agents: { total: number };
  calls: { total: number; today: number; last_7d: number };
  health: { errors_24h: number; warnings_24h: number };
}

interface StaffMember {
  role: StaffRole;
  agentId: string;
  name: string;
  title: string;
  blurb: string;
  icon: typeof Users2;
}

const STAFF: StaffMember[] = [
  {
    role: "reception",
    agentId: "wireline-reception",
    name: "Mira",
    title: "Reception",
    blurb: "First voice callers hear. Greets, identifies intent, routes to the right teammate.",
    icon: Headphones,
  },
  {
    role: "sales",
    agentId: "wireline-sales",
    name: "Casey",
    title: "Sales",
    blurb: "Pricing, plan fit, demos, objection handling. Can offer up to 10% off + book demos.",
    icon: Sparkles,
  },
  {
    role: "support",
    agentId: "wireline-support",
    name: "Alex",
    title: "Support",
    blurb: "Account help, billing, troubleshooting. Auto-issues refunds up to $50.",
    icon: MessageSquare,
  },
  {
    role: "technical",
    agentId: "wireline-technical",
    name: "Tyler",
    title: "Technical",
    blurb: "Integrations, webhooks, API, voice quality, CRM sync — the developer-mindset calls.",
    icon: Wrench,
  },
  {
    role: "onboarding",
    agentId: "wireline-onboarding",
    name: "Maya",
    title: "Onboarding",
    blurb: "Gets new customers to their first working agent fast. Books white-glove sessions.",
    icon: Rocket,
  },
  {
    role: "success",
    agentId: "wireline-success",
    name: "Priya",
    title: "Customer Success",
    blurb: "Usage reviews, best-practice coaching, expansion, churn saves for existing accounts.",
    icon: HeartHandshake,
  },
];

function StaffRow({
  member,
  exists,
  onSelect,
}: {
  member: StaffMember;
  exists: boolean;
  onSelect: () => void;
}) {
  const Icon = member.icon;
  return (
    <ShadButton
      type="button"
      variant="ghost"
      disableAnimations
      onClick={() => exists && onSelect()}
      disabled={!exists}
      className={cn(
        WL_FLEET_CLASSES.agentRow,
        WL_FLEET_CLASSES.agentRowList,
        "group h-auto whitespace-normal justify-start px-3 py-3 hover:bg-transparent wl-row-hover",
        !exists && "opacity-50 cursor-not-allowed",
      )}
    >
      <div
        className={cn(
          WL_FLEET_CLASSES.agentAvatar,
          exists && "group-hover:border-brand/25 group-hover:bg-brand/5",
        )}
      >
        <Icon className="w-4 h-4" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="font-display italic text-base text-ink leading-tight truncate">
          {member.name}
        </div>
        <div className="wl-label-muted mt-0.5 truncate">{member.title}</div>
        <p className={cn(WL_APP_CLASSES.bodyCaption, "mt-1.5 line-clamp-2")}>{member.blurb}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1 self-start pt-0.5">
        <span className="wl-label text-brand inline-flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          {exists ? "Chat" : "Missing"}
        </span>
        {exists && <ArrowUpRight className="w-3.5 h-3.5 text-brand/70" />}
      </div>
    </ShadButton>
  );
}

export default function FounderDashboard() {
  const { error: toastError, success: toastSuccess } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [provisionedIds, setProvisionedIds] = useState<Set<string> | null>(null);
  const [broadcast, setBroadcast] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [stats, setStats] = useState<FounderStats | null>(null);

  useEffect(() => {
    if (!user?.is_owner) return;
    authFetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        const ids = new Set<string>((d.agents || []).map((a: { id: string }) => a.id));
        setProvisionedIds(ids);
      })
      .catch(() => setProvisionedIds(new Set()));
    authFetch("/api/admin/founder-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok) setStats(d as FounderStats);
      })
      .catch(() => {
        /* stats are best-effort */
      });
  }, [user?.is_owner]);

  const allProvisioned =
    provisionedIds !== null && STAFF.every((s) => provisionedIds.has(s.agentId));

  const sendBroadcast = async () => {
    const text = broadcast.trim();
    if (!text || broadcasting) return;
    setBroadcasting(true);
    let ok = 0;
    for (const s of STAFF) {
      try {
        const r = await authFetch(
          `/api/agents/${encodeURIComponent(s.agentId)}/workspace/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: `[Team directive from the founder] ${text}` }),
          },
        );
        if (r.ok) ok++;
      } catch {
        /* count only successes */
      }
    }
    setBroadcasting(false);
    if (ok === STAFF.length) {
      toastSuccess("Directive sent", `All ${ok} staff received your message.`);
      setBroadcast("");
    } else {
      toastError("Partial send", `${ok} of ${STAFF.length} staff received it. Retry the rest.`);
    }
  };

  if (authLoading) {
    return (
      <ClientRouteViewport>
        <div
          className="flex flex-1 min-h-[40vh] items-center justify-center text-muted"
          role="status"
          aria-live="polite"
          aria-label="Loading"
        >
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      </ClientRouteViewport>
    );
  }

  if (!user?.is_owner) {
    return <Navigate to="/agents" replace />;
  }

  if (selected) {
    return (
      <ClientRouteViewport>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div
            className={cn(
              "shrink-0 px-4 md:px-6 py-3 flex items-center gap-3 border-b border-border",
              WL_APP_CLASSES.mobileContextBar,
              WL_APP_CLASSES.mobileContextAccent,
            )}
          >
            <ShadButton
              onClick={() => setSelected(null)}
              variant="ghost"
              className="wl-label-muted hover:text-ink normal-case tracking-normal touch-press"
            >
              ← All staff
            </ShadButton>
            <span className="font-display italic text-sm text-ink truncate">
              {selected.name}
              <span className={cn(WL_APP_CLASSES.bodyCaption, "not-italic font-sans ml-1.5")}>
                · {selected.title}
              </span>
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <DirectorWorkspace
              focusAgentId={selected.agentId}
              onFocusAgentChange={() => undefined}
            />
          </div>
        </div>
      </ClientRouteViewport>
    );
  }

  const provisionedCount =
    provisionedIds === null
      ? STAFF.length
      : STAFF.filter((s) => provisionedIds.has(s.agentId)).length;

  return (
    <ClientRouteViewport scroll>
      <ClientToolbar
        left={
          <span className="app-toolbar-stat">
            {provisionedIds === null ? OPS_FOUNDER.loading : OPS_FOUNDER.stat(provisionedCount)}
          </span>
        }
      />
      <div className="max-w-[900px] mx-auto w-full px-4 md:px-6 py-4 pb-8">
        <div className="mb-5">
          <p className="app-section-title mb-1">Founder · Command</p>
          <p className="text-[13px] text-muted/80 max-w-xl leading-relaxed">
            Six AI agents run Wireline's own phone lines. Open any staff chat — they remember every
            conversation — or broadcast a directive to the whole team.
          </p>
        </div>

        <FounderOperatingCockpit />

        {stats && (
          <div className="mb-5">
            <p className="app-section-title mb-2">Platform · live</p>
            <div className="flex flex-wrap gap-2.5 stagger-children">
              <MetricStatTile label="Paying" value={stats.users.paying} tone="brand" />
              <MetricStatTile label="Trialing" value={stats.users.trialing} tone="brand" />
              <MetricStatTile label="Total users" value={stats.users.total} tone="ink" />
              <MetricStatTile label="New (7d)" value={stats.users.new_last_7d} tone="brand" />
              {stats.activation ? (
                <>
                  <MetricStatTile
                    label="Activated"
                    value={stats.activation.activated_total}
                    tone="brand"
                  />
                  <MetricStatTile
                    label="Activation %"
                    value={stats.activation.activation_rate_pct}
                    tone="ink"
                  />
                  <MetricStatTile
                    label="Median TTV (min)"
                    value={
                      stats.activation.median_time_to_activation_seconds != null
                        ? Math.round(stats.activation.median_time_to_activation_seconds / 60)
                        : 0
                    }
                    tone="muted"
                  />
                </>
              ) : null}
              <MetricStatTile label="Calls today" value={stats.calls.today} tone="ink" />
              <MetricStatTile
                label="Errors (24h)"
                value={stats.health.errors_24h}
                tone={stats.health.errors_24h > 0 ? "rose" : "muted"}
              />
              <MetricStatTile
                label="Warnings (24h)"
                value={stats.health.warnings_24h}
                tone={stats.health.warnings_24h > 0 ? "brand" : "muted"}
              />
            </div>
            <p className="mt-2 chrome-subtle text-pretty">
              {stats.calls.total.toLocaleString()} calls all-time ·{" "}
              {stats.calls.last_7d.toLocaleString()} in the last 7 days ·{" "}
              {stats.agents.total.toLocaleString()} agents across all tenants
            </p>
          </div>
        )}

        <FounderOperatorConsole />

        {provisionedIds !== null && !allProvisioned && (
          <div className="mb-5 rounded-md border border-brand/30 bg-brand/5 p-3 text-[12px] text-ink/80">
            Some staff agents aren't provisioned yet. Run
            <code className="font-mono mx-1 text-[11px] bg-black/10 px-1.5 py-0.5 rounded">
              POST /api/admin/provision-wireline-agents
            </code>
            (with your X-Migration-Token) to create all 6.
          </div>
        )}

        <div className={cn(WL_APP_CLASSES.settingsPanel, "mt-0 mb-5")}>
          <div className="flex items-center gap-2 mb-2.5">
            <Users2 className="w-4 h-4 text-brand" />
            <span className="app-section-title">Team broadcast</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={broadcast}
              onChange={(e) => setBroadcast(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendBroadcast()}
              placeholder={OPS_FOUNDER.broadcastPlaceholder}
              className="flex-1 bg-black/5 dark:bg-white/5 border border-border rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-brand/40 transition-colors placeholder:text-muted/70"
            />
            <ShadButton
              onClick={sendBroadcast}
              disabled={!broadcast.trim() || broadcasting}
              variant="default"
              className="px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] font-medium shrink-0"
            >
              {broadcasting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {OPS_FOUNDER.broadcastSend}
            </ShadButton>
          </div>
          <p className="chrome-subtle mt-2 text-pretty">
            Lands in every staff member's chat memory — they'll factor it into future calls.
          </p>
        </div>

        <div className="wl-panel border border-input rounded-md overflow-hidden divide-y divide-border stagger-children">
          {STAFF.map((s) => {
            const exists = provisionedIds === null || provisionedIds.has(s.agentId);
            return (
              <StaffRow key={s.role} member={s} exists={exists} onSelect={() => setSelected(s)} />
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-2 stagger-children">
          {[
            { label: "Call logs + analytics", href: "/phone", icon: Phone },
            { label: "Live Ops floor", href: "/ops?tab=floor", icon: Headphones },
            { label: "Agent chat + training", href: "/chat", icon: Sparkles },
          ].map((l) => (
            <Link
              key={l.href}
              to={l.href}
              className="touch-press wl-card-lift inline-flex items-center gap-2 px-3 py-2 rounded-md wl-panel border border-border text-[11px] text-ink hover:border-brand/30 transition-colors min-h-10"
            >
              <l.icon className="w-3.5 h-3.5 text-brand" />
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </ClientRouteViewport>
  );
}
