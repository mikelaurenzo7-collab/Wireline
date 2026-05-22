import { useEffect, useState } from "react";
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
import AgentWorkspace from "./AgentWorkspace";

/**
 * Founder's Dashboard — Mike's command surface for his staff of 6
 * Wireline AI agents (the dogfood team that answers Wireline's own
 * lines). Mirrors the server-side WIRELINE_PERSONAS roster.
 *
 * What it does today:
 *   - Roster of the 6 staff with role + voice + what they handle
 *   - Per-employee chat WITH MEMORY (reuses the agent-workspace
 *     thread API — every message persists, the agent remembers)
 *   - Team broadcast: send one directive to all 6 staff threads
 *   - One-click provisioning if the staff agents don't exist yet
 *
 * The 6 staff agent IDs are stable (wireline-<role>) — created by
 * POST /api/admin/provision-wireline-agents.
 */

type StaffRole = "reception" | "sales" | "support" | "technical" | "onboarding" | "success";

interface FounderStats {
  ok: boolean;
  generated_at: string;
  users: { total: number; paying: number; trialing: number; new_last_7d: number };
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
  accent: string;
}

const STAFF: StaffMember[] = [
  {
    role: "reception",
    agentId: "wireline-reception",
    name: "Mira",
    title: "Reception",
    blurb: "First voice callers hear. Greets, identifies intent, routes to the right teammate.",
    icon: Headphones,
    accent: "from-rose-500/15 to-brand/10",
  },
  {
    role: "sales",
    agentId: "wireline-sales",
    name: "Casey",
    title: "Sales",
    blurb: "Pricing, plan fit, demos, objection handling. Can offer up to 10% off + book demos.",
    icon: Sparkles,
    accent: "from-brand/15 to-emerald-500/10",
  },
  {
    role: "support",
    agentId: "wireline-support",
    name: "Alex",
    title: "Support",
    blurb: "Account help, billing, troubleshooting. Auto-issues refunds up to $50.",
    icon: MessageSquare,
    accent: "from-sky-500/15 to-brand/10",
  },
  {
    role: "technical",
    agentId: "wireline-technical",
    name: "Tyler",
    title: "Technical",
    blurb: "Integrations, webhooks, API, voice quality, CRM sync — the developer-mindset calls.",
    icon: Wrench,
    accent: "from-violet-500/15 to-brand/10",
  },
  {
    role: "onboarding",
    agentId: "wireline-onboarding",
    name: "Maya",
    title: "Onboarding",
    blurb: "Gets new customers to their first working agent fast. Books white-glove sessions.",
    icon: Rocket,
    accent: "from-amber-500/15 to-brand/10",
  },
  {
    role: "success",
    agentId: "wireline-success",
    name: "Priya",
    title: "Customer Success",
    blurb: "Usage reviews, best-practice coaching, expansion, churn saves for existing accounts.",
    icon: HeartHandshake,
    accent: "from-pink-500/15 to-brand/10",
  },
];

const STAT_TONES: Record<string, string> = {
  brand: "text-brand",
  ink: "text-ink",
  emerald: "text-emerald-500",
  rose: "text-rose-500",
  amber: "text-amber-500",
};

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof STAT_TONES;
}) {
  return (
    <div className="rounded-xl glass border border-white/10 px-3 py-2.5">
      <div className={cn("text-xl font-display tabular-nums leading-none", STAT_TONES[tone])}>
        {value.toLocaleString()}
      </div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-muted/70 mt-1.5">{label}</div>
    </div>
  );
}

export default function FounderDashboard() {
  const { error: toastError, success: toastSuccess } = useToast();
  const { user } = useAuth();
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [provisionedIds, setProvisionedIds] = useState<Set<string> | null>(null);
  const [broadcast, setBroadcast] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [stats, setStats] = useState<FounderStats | null>(null);

  // Resolve which of the 6 staff agents actually exist in the DB,
  // and pull the platform-wide stats. Both no-op for non-owners
  // (the page itself is owner-gated below).
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
        /* stats are best-effort — the roster still works without them */
      });
  }, [user?.is_owner]);

  const allProvisioned =
    provisionedIds !== null && STAFF.every((s) => provisionedIds.has(s.agentId));

  // Send one directive to every staff member's chat thread at once —
  // "team meeting" broadcast. Each message lands in that agent's
  // memory thread, so the next time you open their chat it's there.
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

  // Owner-only surface. Non-owners (team members, customers who somehow
  // land on /founder) get a clean access wall — never the staff roster
  // or the platform stats.
  if (user && user.is_owner !== true) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-2xl glass border border-white/10 flex items-center justify-center text-brand mx-auto mb-4">
            <Users2 className="w-5 h-5" />
          </div>
          <h2 className="font-display italic text-2xl text-ink mb-2">Owner only</h2>
          <p className="text-[13px] text-muted/80 leading-relaxed">
            The Founder's Dashboard is restricted to the Wireline platform owner.
          </p>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-4 md:px-6 py-3 border-b border-white/8 flex items-center gap-3">
          <button
            onClick={() => setSelected(null)}
            className="text-[11px] uppercase tracking-[0.2em] text-muted hover:text-ink transition-colors"
          >
            ← All staff
          </button>
          <span className="text-ink font-medium">
            {selected.name} · {selected.title}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <AgentWorkspace agentId={selected.agentId} agentName={selected.name} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1100px] mx-auto w-full px-4 md:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.45em] text-brand/80 mb-1">
            Founder · Command
          </div>
          <h1 className="font-display italic lowercase text-3xl md:text-4xl text-ink leading-none">
            <span className="text-aurora">your wireline staff</span>
          </h1>
          <p className="text-[13px] text-muted/80 mt-2 max-w-xl leading-relaxed">
            Six AI agents run Wireline's own phone lines. Chat with any of them — they remember
            every conversation — or send the whole team a directive at once.
          </p>
        </div>

        {/* Platform stats */}
        {stats && (
          <div className="mb-6">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mb-2">
              Platform · live
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              <StatTile label="Paying" value={stats.users.paying} tone="brand" />
              <StatTile label="Trialing" value={stats.users.trialing} tone="brand" />
              <StatTile label="Total users" value={stats.users.total} tone="ink" />
              <StatTile label="New (7d)" value={stats.users.new_last_7d} tone="emerald" />
              <StatTile label="Calls today" value={stats.calls.today} tone="ink" />
              <StatTile
                label="Errors (24h)"
                value={stats.health.errors_24h}
                tone={stats.health.errors_24h > 0 ? "rose" : "emerald"}
              />
              <StatTile
                label="Warnings (24h)"
                value={stats.health.warnings_24h}
                tone={stats.health.warnings_24h > 0 ? "amber" : "emerald"}
              />
            </div>
            <div className="mt-2 text-[10px] text-muted/55">
              {stats.calls.total.toLocaleString()} calls all-time ·{" "}
              {stats.calls.last_7d.toLocaleString()} in the last 7 days ·{" "}
              {stats.agents.total.toLocaleString()} agents across all tenants
            </div>
          </div>
        )}

        {/* Provisioning banner */}
        {provisionedIds !== null && !allProvisioned && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 text-[12px] text-ink/80">
            Some staff agents aren't provisioned yet. Run
            <code className="font-mono mx-1 text-[11px] bg-black/10 px-1.5 py-0.5 rounded">
              POST /api/admin/provision-wireline-agents
            </code>
            (with your X-Migration-Token) to create all 6.
          </div>
        )}

        {/* Team broadcast */}
        <div className="mb-6 rounded-2xl glass border border-white/10 p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Users2 className="w-4 h-4 text-brand" />
            <span className="text-[11px] uppercase tracking-[0.25em] text-ink font-medium">
              Team meeting — broadcast a directive
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={broadcast}
              onChange={(e) => setBroadcast(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendBroadcast()}
              placeholder="e.g. From today, always confirm the caller's email by spelling it back."
              className="flex-1 bg-black/5 border border-black/10 rounded-lg px-3 py-2.5 text-sm text-ink outline-none focus:border-brand/40 transition-colors placeholder:text-muted/50"
            />
            <button
              onClick={sendBroadcast}
              disabled={!broadcast.trim() || broadcasting}
              className="px-4 py-2.5 rounded-lg bg-brand text-on-brand text-[11px] uppercase tracking-[0.2em] font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-2 shrink-0"
            >
              {broadcasting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Send to all 6
            </button>
          </div>
          <p className="text-[10px] text-muted/60 mt-2">
            Lands in every staff member's chat memory — they'll factor it into future calls.
          </p>
        </div>

        {/* Staff roster */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {STAFF.map((s) => {
            const exists = provisionedIds === null || provisionedIds.has(s.agentId);
            return (
              <button
                key={s.role}
                onClick={() => exists && setSelected(s)}
                disabled={!exists}
                className={cn(
                  "text-left rounded-2xl border p-4 transition-all bg-gradient-to-br",
                  s.accent,
                  exists
                    ? "border-black/8 hover:border-brand/30 hover:shadow-md cursor-pointer"
                    : "border-black/8 opacity-50 cursor-not-allowed",
                )}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-paper flex items-center justify-center text-brand shrink-0">
                    <s.icon className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="text-[14px] font-medium text-ink leading-tight">{s.name}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted/70">
                      {s.title}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-ink/65 leading-relaxed mb-3">{s.blurb}</p>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-brand">
                  <MessageSquare className="w-3 h-3" />
                  {exists ? "Open chat" : "Not provisioned"}
                  {exists && <ArrowUpRight className="w-3 h-3" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick links */}
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { label: "Call logs + analytics", href: "/logs", icon: Phone },
            { label: "Live call monitor", href: "/live", icon: Headphones },
            { label: "Agent training", href: "/train", icon: Sparkles },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg glass border border-white/10 text-[11px] text-ink hover:border-brand/30 transition-colors"
            >
              <l.icon className="w-3.5 h-3.5 text-brand" />
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
