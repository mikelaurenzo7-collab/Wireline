import type { ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BarChart3,
  Bell,
  Check,
  Database,
  LogOut,
  Phone,
  Plug,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  Briefcase,
  CreditCard,
  Globe,
  History,
  Cpu,
  Crown,
  Eye,
} from "lucide-react";
import { useAuth } from "./contexts/AuthContext";
import { AssistantComposer } from "./components/AssistantComposer";

type BusinessPage =
  | "assistant"
  | "live"
  | "fleet"
  | "training"
  | "analytics"
  | "team"
  | "integrations"
  | "settings";
type Tone = "default" | "brand" | "warn" | "muted";

const nav: Array<[BusinessPage, string, string]> = [
  ["assistant", "Assistant", "/app/business"],
  ["live", "Live Ops", "/app/business/live"],
  ["fleet", "Fleet", "/app/business/fleet"],
  ["training", "Training", "/app/business/training"],
  ["analytics", "Analytics", "/app/business/analytics"],
  ["team", "Team", "/app/business/team"],
  ["integrations", "Integrations", "/app/business/integrations"],
  ["settings", "Settings", "/app/business/settings"],
];

const agents = [
  {
    name: "Sarah",
    role: "Front desk + appointments",
    model: "Grok 4.3",
    status: "Live",
    calls: "142",
    score: "96%",
    next: "Refund policy drill",
  },
  {
    name: "Liam",
    role: "Inbound sales + demos",
    model: "Gemini Flash",
    status: "Live",
    calls: "88",
    score: "94%",
    next: "Billing language",
  },
  {
    name: "Tyler",
    role: "Technical triage",
    model: "Claude Sonnet",
    status: "Training",
    calls: "34",
    score: "91%",
    next: "Webhook simulations",
  },
];

const liveCalls = [
  ["Refund request", "Sarah", "Billing approval needed", "02:10", "Approve"],
  ["Demo request", "Liam", "Qualified lead — wants Friday", "03:11", "Review"],
  ["Webhook timeout", "Tyler", "Technical triage, low confidence", "04:12", "Coach"],
  ["Appointment change", "Sarah", "Rescheduled Thursday", "05:13", "Done"],
];

const connectors = [
  ["Google Workspace", "Available", "Shared inbox, calendars, and Workspace context"],
  ["Microsoft 365", "Available", "Outlook, 365 calendars, and identity"],
  ["Stripe", "Review", "Billing and plan-state verification before launch"],
  ["Twilio", "Review", "Phone numbers, SMS, and routing readiness"],
  ["Vapi", "Review", "Voice agent runtime and test-call readiness"],
  ["HubSpot", "Planned", "Lead capture and deal notes"],
  ["Slack", "Planned", "Escalations and daily call summaries"],
  ["Webhook API", "Planned", "Custom launch integrations"],
];

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

function pageFromPath(path: string): BusinessPage {
  if (path.includes("/live")) return "live";
  if (path.includes("/fleet")) return "fleet";
  if (path.includes("/training")) return "training";
  if (path.includes("/analytics")) return "analytics";
  if (path.includes("/team")) return "team";
  if (path.includes("/integrations")) return "integrations";
  if (path.includes("/settings")) return "settings";
  return "assistant";
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        "wl-glass-card hover-glow rounded-[28px] p-5 sm:p-6 lg:p-8 transition-all duration-300",
        className,
      )}
    >
      {children}
    </section>
  );
}

function Pill({ children, tone = "default" }: { children: ReactNode; tone?: Tone }) {
  const styles =
    tone === "brand"
      ? "border-brand/35 bg-brand/15 text-brand-bright shadow-[0_0_15px_rgba(139,92,246,0.15)]"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
        : tone === "muted"
          ? "border-white/5 bg-white/[.02] text-white/55"
          : "border-white/10 bg-white/[.04] text-white/70";
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.15em] transition-all duration-300",
        styles,
      )}
    >
      {children}
    </span>
  );
}

function statusTone(status: string): Tone {
  if (["Live", "Done", "Available"].includes(status)) return "brand";
  if (["Review", "Approve", "Coach"].includes(status)) return "warn";
  if (["Planned", "Training"].includes(status)) return "muted";
  return "default";
}

function MiniMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="wl-glass-card hover-glow rounded-[18px] p-4 sm:p-5">
      <p className="font-display text-3xl sm:text-4xl text-white font-semibold tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[.14em] text-white/55 font-mono">
        {label}
      </p>
    </div>
  );
}

function RequireBusiness({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-background text-foreground">
        <Sparkles className="h-5 w-5 animate-pulse text-brand-bright" />
      </div>
    );
  if (!user)
    return <Navigate to={`/signin?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function BusinessShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const active = pageFromPath(location.pathname);
  const activeLabel = nav.find(([id]) => id === active)?.[1] ?? "Business";
  return (
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background text-foreground wl-overhaul-surface wl-grain">
      <aside className="wl-glass-panel hidden w-64 shrink-0 flex-col p-4 2xl:flex">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 px-2 pt-2 transition-opacity hover:opacity-80"
        >
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-white font-bold shadow-[0_0_15px_rgba(139,92,246,0.4)]">
            W
          </span>
          <span className="font-display text-[20px] font-semibold text-white">Wireline</span>
        </Link>
        <div className="px-2 mb-6">
          <Pill>Business workspace</Pill>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(([id, label, path]) => (
            <Link
              key={id}
              to={path}
              className={cx(
                "rounded-[14px] px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                active === id
                  ? "bg-brand text-white shadow-[0_0_20px_rgba(139,92,246,0.45)] hover:brightness-110"
                  : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 pt-4 text-xs text-white/50">
          <div className="truncate">{user?.email ?? "Owner"}</div>
          <button
            onClick={() => {
              void signOut();
              navigate("/");
            }}
            className="mt-3 inline-flex items-center gap-2 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md p-1 -mx-1"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-background/60 backdrop-blur-2xl">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Link to="/" className="2xl:hidden transition-opacity hover:opacity-80">
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-white font-bold">
                  W
                </span>
              </Link>
              <Pill tone="brand">
                <Radio size={12} /> {activeLabel}
              </Pill>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-[14px] border border-white/10 px-3 py-2 md:flex cursor-text transition-colors hover:border-white/20">
                <Search size={14} className="text-white/55" />
                <span className="text-xs text-white/55">Search calls, agents, contacts…</span>
              </div>
              <button className="rounded-full p-1.5 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <Bell size={17} className="text-white/60" />
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs text-white font-semibold transition-all hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                {user?.email?.[0]?.toUpperCase() ?? "W"}
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2 2xl:hidden">
            {nav.map(([id, label, path]) => (
              <Link
                key={id}
                to={path}
                className={cx(
                  "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  active === id
                    ? "bg-brand text-white shadow-[0_0_15px_rgba(139,92,246,0.45)]"
                    : "text-white/50 hover:text-white hover:bg-white/5",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-10 xl:px-12 lg:py-12 xl:py-16">
          {children}
        </main>
      </div>
    </div>
  );
}

function Title({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-brand-bright">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-display text-4xl font-medium leading-[1.03] tracking-[-.05em] text-white sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function AssistantPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-6">
        <Title
          eyebrow="Wireline Assistant"
          title="Ask what to improve, route, or train next."
          text="This is the owner/operator command center. It explains what changed, what needs approval, and which agents need training."
        />
        <Card className="min-h-[420px] flex flex-col justify-between">
          <div className="rounded-[20px] border border-white/5 bg-[#030303]/90 p-5 text-sm leading-7 text-slate-300 shadow-inner">
            I reviewed the last 24 hours. Sarah is strong on scheduling. Liam needs billing
            escalation language. Tyler needs webhook timeout simulations. Recommended next step:
            update refund policy, then run five billing scenarios in Training.
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {["Audit my fleet", "Fix billing calls", "Train Sarah", "Show escalations"].map((x) => (
              <button
                key={x}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-all duration-200 hover:border-white/25 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-95"
              >
                {x}
              </button>
            ))}
          </div>
          <div className="mt-5">
            <AssistantComposer tone="dark" placeholder="Ask Wireline…" sendLabel="Ask" />
          </div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card className="border-brand/30 bg-[#0d091c]/30 shadow-[0_0_20px_rgba(139,92,246,0.1)]">
          <Pill tone="warn">Needs approval</Pill>
          <h2 className="mt-4 font-display text-2xl text-white">Refund call</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Sarah needs a human approval rule before promising refund timing.
          </p>
        </Card>
        <Card className="border-cyan-500/25 bg-[#08121a]/30 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
          <Pill tone="brand">Training win</Pill>
          <h2 className="mt-4 font-display text-2xl text-white">12 improved calls</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Updated objection handling reduced repeated escalations.
          </p>
        </Card>
        <Card>
          <Pill>Next action</Pill>
          <h2 className="mt-4 font-display text-2xl text-white">Run simulations</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Five billing scenarios should be tested before expanding permissions.
          </p>
        </Card>
      </div>
    </div>
  );
}

function LiveOpsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <Title
          eyebrow="Live Operations"
          title="The cockpit for calls in motion."
          text="Track active calls, coaching moments, escalations, and quality pulse without crowding Studio."
        />
        <button className="rounded-[14px] bg-brand px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          Start outbound
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MiniMetric value="281" label="Calls today" />
        <MiniMetric value="3m 41s" label="Avg handle" />
        <MiniMetric value="8" label="Open escalations" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="font-display text-2xl text-white">Calls in progress</h2>
          <div className="mt-5 divide-y divide-white/10 rounded-[22px] border border-white/5 overflow-hidden bg-[#030303]/40">
            <div className="hidden lg:grid grid-cols-[1fr_140px_1fr_96px_100px] gap-3 bg-white/[0.02] p-4 text-[10px] font-bold uppercase tracking-[.15em] text-white/55 font-mono">
              <div>Topic</div>
              <div>Agent</div>
              <div>Detail</div>
              <div>Duration</div>
              <div>Action</div>
            </div>
            {liveCalls.map(([topic, agent, detail, time, action]) => (
              <div
                key={topic}
                className="grid gap-3 p-4 text-sm transition-colors hover:bg-white/5 lg:grid-cols-[1fr_140px_1fr_96px_100px]"
              >
                <div className="font-semibold text-white">{topic}</div>
                <div className="text-white/60">{agent}</div>
                <div className="text-white/50">{detail}</div>
                <div className="font-mono text-cyan-400">{time}</div>
                <Pill tone={statusTone(action)}>{action}</Pill>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="font-display text-2xl text-white">Quality pulse</h2>
          <div className="mt-5 space-y-4">
            {[
              ["Billing objection", "92%"],
              ["Refund approval", "85%"],
              ["Appointment routing", "78%"],
            ].map(([name, value]) => (
              <div key={name}>
                <div className="flex justify-between text-sm text-slate-300">
                  <span>{name}</span>
                  <span className="text-cyan-400 font-semibold font-mono">{value}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-brand shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                    style={{ width: value }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function FleetPage() {
  return (
    <div className="space-y-6">
      <Title
        eyebrow="Agent Fleet"
        title="Every agent, status, and improvement loop."
        text="Fleet is the roster. Studio edits setup. Training improves behavior. Live Ops monitors performance."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.name}>
            <div className="flex items-center justify-between">
              <Pill tone={statusTone(agent.status)}>{agent.status}</Pill>
              <span className="text-xs text-white/60 font-mono">{agent.model}</span>
            </div>
            <h3 className="mt-5 font-display text-3xl text-white">{agent.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{agent.role}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <MiniMetric value={agent.calls} label="Calls" />
              <MiniMetric value={agent.score} label="Score" />
            </div>
            <div className="mt-4 rounded-[16px] border border-white/5 bg-[#030303]/40 p-3 text-sm text-slate-300 shadow-inner">
              <span className="text-white/55 font-mono text-xs">Next training:</span> {agent.next}
            </div>
            <div className="mt-5 flex gap-2">
              <Link
                to="/app/business/studio"
                className="flex-1 rounded-[14px] bg-brand px-3 py-2 text-center text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-95 shadow-sm"
              >
                Edit setup
              </Link>
              <Link
                to="/app/business/training"
                className="flex-1 rounded-[14px] border border-white/10 bg-white/[0.02] px-3 py-2 text-center text-sm font-semibold text-white transition-all duration-200 hover:bg-white/[0.05] hover:border-brand/40 active:scale-95"
              >
                Train
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TrainingPage() {
  const items = [
    [
      Database,
      "Knowledge",
      "Policies, pricing, hours, FAQs, allowed claims, and document sources.",
    ],
    [
      Workflow,
      "Workflows",
      "Bookings, refunds, escalations, routing, SMS follow-ups, and approvals.",
    ],
    [Phone, "Voice", "Tone, pronunciation, brevity, response length, and banned phrases."],
    [BarChart3, "Simulator", "Run difficult scenarios before customers experience the agent."],
  ] as const;
  return (
    <div className="space-y-6">
      <Title
        eyebrow="Training"
        title="Teach once. Improve forever."
        text="Training is now the deep work surface. Studio stays simple because scripts, docs, scenarios, and simulations live here."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {items.map(([Icon, title, text]) => (
          <Card key={title}>
            <Icon className="text-brand-bright" />
            <h3 className="mt-4 font-display text-2xl text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <h3 className="font-display text-2xl text-white">Launch checklist</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {["Upload policies", "Run 5 simulations", "Approve escalation rules"].map((x, i) => (
              <button
                key={x}
                className="flex flex-col text-left rounded-[18px] border border-white/5 bg-[#030303]/40 p-4 text-sm text-white/60 transition-all duration-200 hover:bg-white/5 hover:border-brand/30 active:scale-95"
              >
                <Check
                  className={cx(
                    "mb-3 h-4 w-4",
                    i < 2
                      ? "text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]"
                      : "text-white/20",
                  )}
                />
                {x}
              </button>
            ))}
          </div>
        </Card>
        <Card className="border-brand/30 bg-[#0d091c]/30">
          <Pill tone="warn">Next before launch</Pill>
          <h3 className="mt-4 font-display text-2xl text-white">Billing scenario pack</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Refund timing, failed payment, discount request, disputed charge, and manager callback.
          </p>
        </Card>
      </div>
    </div>
  );
}

function AnalyticsPage() {
  const rows = [
    ["Calls", "1,842", "+18%"],
    ["Booked", "214", "+12%"],
    ["Containment", "83%", "+6%"],
    ["Revenue assisted", "$48k", "+22%"],
  ];
  return (
    <div className="space-y-6">
      <Title
        eyebrow="Analytics"
        title="What is working, what needs training."
        text="Analytics should guide training, staffing, and model choice — not just show vanity metrics."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {rows.map(([k, v, c]) => (
          <Card key={k}>
            <p className="text-xs text-white/55 font-mono uppercase tracking-wider">{k}</p>
            <p className="mt-2 font-display text-4xl text-white font-semibold tracking-tight">
              {v}
            </p>
            <p className="mt-2 text-xs text-cyan-400 font-semibold font-mono">{c}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="font-display text-2xl text-white">Training opportunities</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {["Billing objections", "Refund approvals", "Webhook timeouts"].map((x) => (
            <div
              key={x}
              className="rounded-[18px] border border-white/5 bg-[#030303]/40 p-4 text-sm text-slate-300 font-semibold text-center hover:border-brand/30 transition-all duration-300"
            >
              {x}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TeamPage() {
  const roles = [
    { role: "Owner", Icon: Crown, text: "Billing, settings, models, all approvals" },
    { role: "Manager", Icon: Briefcase, text: "Training, routing, escalation rules" },
    { role: "Reviewer", Icon: Eye, text: "Call review, QA notes, scenario approval" },
  ];
  return (
    <div className="space-y-6">
      <Title
        eyebrow="Team & Roles"
        title="Give people the right controls."
        text="Owners, managers, reviewers, and operators should not have the same permissions."
      />
      <div className="grid gap-5 md:grid-cols-3">
        {roles.map(({ role, Icon, text }) => (
          <Card key={role}>
            <Icon className="text-brand-bright" />
            <h3 className="mt-4 font-display text-2xl text-white">{role}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
            <button className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/70 transition-all duration-200 hover:bg-white/5 hover:text-white hover:border-brand/30 active:scale-95">
              Configure role
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <Title
        eyebrow="Integrations"
        title="Connect the systems agents actually use."
        text="Business connectors stay separate from personal context. Each integration needs clear scope, status, and action state."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {connectors.map(([name, status, detail]) => (
          <Card key={name} className="flex flex-col justify-between">
            <div>
              <Plug className="text-brand-bright" />
              <div className="mt-4 flex items-center justify-between gap-3">
                <h3 className="font-display text-xl text-white">{name}</h3>
                <Pill tone={statusTone(status)}>{status}</Pill>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{detail}</p>
            </div>
            <button className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/70 transition-all duration-200 hover:bg-white/5 hover:text-white hover:border-brand/30 active:scale-95">
              {status === "Review" ? "Verify" : status === "Available" ? "Connect" : "View plan"}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SettingsPage() {
  const settings = [
    { title: "Workspace", Icon: Briefcase, text: "Configured for a launch-ready workspace." },
    { title: "Billing", Icon: CreditCard, text: "Configured for a launch-ready workspace." },
    { title: "Security", Icon: ShieldCheck, text: "Configured for a launch-ready workspace." },
    { title: "Data boundaries", Icon: Globe, text: "Configured for a launch-ready workspace." },
    { title: "Audit logs", Icon: History, text: "Configured for a launch-ready workspace." },
    { title: "Model defaults", Icon: Cpu, text: "Configured for a launch-ready workspace." },
    { title: "Phone numbers", Icon: Phone, text: "Configured for a launch-ready workspace." },
    { title: "Approval rules", Icon: Check, text: "Configured for a launch-ready workspace." },
  ];
  return (
    <div className="space-y-6">
      <Title
        eyebrow="Settings"
        title="Workspace controls and data boundaries."
        text="Settings should make launch constraints explicit: billing, security, audit logs, models, routing, and approval rules."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {settings.map(({ title, Icon, text }) => (
          <Card
            key={title}
            className="cursor-pointer group hover:border-brand/30 transition-all duration-300"
          >
            <Icon className="text-brand-bright transition-transform duration-300 group-hover:scale-110" />
            <h3 className="mt-4 font-display text-xl transition-colors duration-200 text-white group-hover:text-brand-bright">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300 transition-colors duration-200">
              {text}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CurrentPage() {
  const page = pageFromPath(useLocation().pathname);
  if (page === "live") return <LiveOpsPage />;
  if (page === "fleet") return <FleetPage />;
  if (page === "training") return <TrainingPage />;
  if (page === "analytics") return <AnalyticsPage />;
  if (page === "team") return <TeamPage />;
  if (page === "integrations") return <IntegrationsPage />;
  if (page === "settings") return <SettingsPage />;
  return <AssistantPage />;
}

export default function BusinessWorkspace() {
  return (
    <BrowserRouter>
      <RequireBusiness>
        <BusinessShell>
          <Routes>
            <Route path="/app/business/*" element={<CurrentPage />} />
            <Route path="/business" element={<Navigate to="/app/business/live" replace />} />
            <Route path="/ops" element={<Navigate to="/app/business/live" replace />} />
            <Route
              path="/integrations"
              element={<Navigate to="/app/business/integrations" replace />}
            />
            <Route path="/analytics" element={<Navigate to="/app/business/analytics" replace />} />
            <Route path="/phone" element={<Navigate to="/app/business/live" replace />} />
            <Route path="/email" element={<Navigate to="/app/business/integrations" replace />} />
            <Route path="/sms" element={<Navigate to="/app/business/integrations" replace />} />
            <Route path="/admin" element={<Navigate to="/app/business/settings" replace />} />
          </Routes>
        </BusinessShell>
      </RequireBusiness>
    </BrowserRouter>
  );
}
