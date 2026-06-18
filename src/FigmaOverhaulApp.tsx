import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Building2,
  Calendar,
  Check,
  Command,
  Database,
  FileText,
  Headphones,
  Key,
  LayoutGrid,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Mic,
  Phone,
  PhoneCall,
  Plug,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  User,
  Webhook,
  X,
} from "lucide-react";

type Mode = "personal" | "business";
type ConsoleTab =
  | "assistant"
  | "liveops"
  | "fleet"
  | "studio"
  | "training"
  | "analytics"
  | "integrations"
  | "settings";

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

const agents = [
  { id: "sarah", name: "Sarah", role: "Reception", calls: 142, csat: "97%", status: "Live" },
  { id: "tyler", name: "Tyler", role: "Support", calls: 88, csat: "94%", status: "Review" },
  { id: "maria", name: "Maria", role: "Sales", calls: 51, csat: "98%", status: "Live" },
];

const liveCalls = [
  {
    id: "c1",
    caller: "Evan Brooks",
    agent: "Sarah",
    topic: "New estimate request",
    duration: "04:18",
  },
  { id: "c2", caller: "Monica Ray", agent: "Tyler", topic: "Billing question", duration: "02:44" },
  {
    id: "c3",
    caller: "Unknown",
    agent: "Maria",
    topic: "After-hours lead qualification",
    duration: "01:29",
  },
];

const personalCalls = [
  { who: "Dr. Allen's office", result: "Rescheduled to Thursday at 2pm", tag: "Appointment" },
  { who: "Unknown caller", result: "Declined politely and blocked", tag: "Spam guard" },
  { who: "Pharmacy", result: "Prescription ready before 6pm", tag: "Errand" },
];

const metrics = [
  { k: "281", l: "Calls today", d: "+12%" },
  { k: "96%", l: "CSAT", d: "+1.4" },
  { k: "3m 41s", l: "Avg handle", d: "-8s" },
  { k: "98.2%", l: "Resolution", d: "+0.6" },
];

function Button({
  children,
  to,
  className,
  variant = "primary",
  onClick,
}: {
  children: ReactNode;
  to?: string;
  className?: string;
  variant?: "primary" | "outline" | "ghost";
  onClick?: () => void;
}) {
  const base = cn(
    "inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-medium transition-all touch-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    variant === "primary" && "bg-brand text-paper hover:bg-brand-deep",
    variant === "outline" &&
      "border border-border bg-transparent text-ink hover:border-brand hover:bg-card",
    variant === "ghost" && "text-muted-foreground hover:text-ink",
    className,
  );
  if (to)
    return (
      <Link to={to} className={base}>
        {children}
      </Link>
    );
  return (
    <button onClick={onClick} className={base}>
      {children}
    </button>
  );
}

function Chip({
  children,
  active,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em]",
        active ? "border-brand bg-brand/8 text-brand" : "border-border text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-xl tracking-tight",
        light ? "text-paper" : "text-ink",
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center bg-brand text-[12px] text-paper">
        W
      </span>
      Wireline
    </span>
  );
}

function LiveDot({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-brand shadow-[0_0_0_4px_rgba(79,30,123,.12)]" />
      {label}
    </span>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  light,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  light?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl 2xl:max-w-3xl text-center">
      <Chip active className={light ? "border-paper/20 bg-paper/5 text-paper/70" : undefined}>
        {eyebrow}
      </Chip>
      <h2
        className={cn(
          "mt-5 font-display text-4xl leading-tight md:text-6xl",
          light ? "text-paper" : "text-ink",
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "mx-auto mt-4 max-w-xl 2xl:max-w-2xl text-[15px] leading-relaxed",
            light ? "text-paper/65" : "text-muted-foreground",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}

function MarketingLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const nav = useMemo(
    () => [
      ["Features", "/features"],
      ["Pricing", "/pricing"],
      ["Compare", "/compare"],
      ["Showcase", "/showcase"],
      ["Developers", "/developers"],
    ],
    [],
  );
  return (
    <div className="min-h-screen bg-background text-foreground wl-overhaul-surface">
      <header className="sticky top-0 z-50 border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {nav.map(([label, path]) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  cn(
                    "text-sm text-muted-foreground transition-colors hover:text-ink",
                    isActive && "text-brand",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button to="/auth" variant="ghost">
              Sign in
            </Button>
            <Button to="/get-started">
              Get started <ArrowRight size={15} />
            </Button>
          </div>
          <button className="md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="border-t border-border px-6 py-4 md:hidden">
            <div className="flex flex-col gap-3">
              {nav.map(([label, path]) => (
                <Link key={path} to={path} className="py-2 text-muted-foreground">
                  {label}
                </Link>
              ))}
              <Button to="/get-started" className="mt-2">
                Get started
              </Button>
            </div>
          </div>
        )}
      </header>
      <Outlet />
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <Logo />
          <p className="text-sm text-muted-foreground">
            AI phone agents for personal life and business operations.
          </p>
          <div className="flex gap-5 text-sm text-muted-foreground">
            <Link to="/about">About</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/auth">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Landing() {
  const [heroTab, setHeroTab] = useState<Mode>("personal");
  const moments =
    heroTab === "personal"
      ? [
          ["40s", "pharmacy hold handled"],
          ["Thu 2pm", "doctor rescheduled"],
          ["41", "spam calls blocked"],
        ]
      : [
          ["142", "calls Sarah handled"],
          ["$189", "refunded in 12s"],
          ["4 demos", "booked from inbound"],
        ];
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute right-[-18rem] top-[-18rem] h-[36rem] w-[36rem] rounded-full bg-brand/10 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.1fr_.9fr] lg:py-36 xl:py-40">
          <div className="flex flex-col justify-center gap-7">
            <Chip active>
              <Sparkles size={11} /> Hundreds of models — no lock-in
            </Chip>
            <h1 className="font-display text-5xl leading-[1.02] tracking-tight text-ink md:text-7xl">
              Your phone, finally <span className="italic text-brand">working for you.</span>
            </h1>
            <p className="max-w-xl 2xl:max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
              Wireline handles your personal calls so you never miss what matters — and runs a fleet
              of AI agents that answer your business floor around the clock. Human-fast. Never
              off-script.
            </p>
            <div className="flex gap-2">
              {(["personal", "business"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setHeroTab(m)}
                  className={cn(
                    "px-3 py-1.5 text-xs capitalize transition-colors",
                    heroTab === m
                      ? "bg-brand text-paper"
                      : "border border-border text-muted-foreground hover:text-ink",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-px border border-border bg-border">
              {moments.map(([k, l]) => (
                <div key={l} className="bg-background p-4">
                  <div className="font-display text-2xl text-brand">{k}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[.18em] text-muted-foreground">
                    {l}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button to="/get-started">
                Get started free <ArrowRight size={16} />
              </Button>
              <Button to="/showcase" variant="outline">
                <Phone size={15} /> Hear a live demo
              </Button>
            </div>
            <div className="flex items-center gap-6">
              <LiveDot label="1,284 calls handled today" />
              <span className="text-muted-foreground">96% CSAT avg</span>
            </div>
          </div>
          <HeroDevice mode={heroTab} />
        </div>
      </section>
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-32">
          <SectionHeader
            eyebrow="Personal line"
            title="It just handles it."
            description="Screening, scheduling, errands, spam guard, summaries, and Siri-ready intents — without turning your phone into work."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {personalCalls.map((s) => (
              <div
                key={s.who}
                className="border border-border bg-background p-6 transition-all hover:border-brand"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-brand">
                    <Phone size={16} />
                  </span>
                  <Chip>{s.tag}</Chip>
                </div>
                <p className="font-display text-xl text-ink">{s.who}</p>
                <p className="mt-3 border-l-2 border-brand/40 pl-3 text-sm text-muted-foreground">
                  {s.result}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-ink text-paper wl-grain">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-12 text-center md:flex-row md:text-left">
          <div>
            <LiveDot label="Siri shortcut ready" />
            <h2 className="mt-2 font-display text-3xl">
              “Hey Siri, have Wireline call the pharmacy.”
            </h2>
          </div>
          <Button to="/features" className="bg-paper text-ink hover:bg-paper/90">
            See personal automation <ArrowRight size={15} />
          </Button>
        </div>
      </section>
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:py-32">
          <SectionHeader
            eyebrow="Business line"
            title="A full front desk in one cockpit."
            description="Live operations, agent fleet, Studio, Training, analytics, integrations, and a built-in Assistant for what to improve next."
          />
          <div className="mt-12 grid gap-5 lg:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.l} className="border border-border bg-card p-6">
                <div className="flex items-center justify-between text-muted-foreground">
                  <BarChart3 size={16} />
                  <span className="font-mono text-xs text-brand">{m.d}</span>
                </div>
                <div className="mt-4 font-display text-4xl text-ink">{m.k}</div>
                <div className="mt-1 text-xs uppercase tracking-[.16em] text-muted-foreground">
                  {m.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroDevice({ mode }: { mode: Mode }) {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-brand/8 blur-3xl" />
      <div
        className={cn(
          "relative w-full max-w-[440px] border p-5 overflow-hidden",
          mode === "business"
            ? "border-paper/10 bg-ink text-paper shadow-[0_24px_80px_-20px_rgba(79,30,123,0.25)]"
            : "border-border bg-card text-ink shadow-[0_24px_80px_-20px_rgba(0,0,0,0.15)]",
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.12] mix-blend-overlay" />
        <div className="mb-5 flex items-center justify-between">
          <Logo light={mode === "business"} />
          <LiveDot label={mode === "business" ? "Fleet live" : "Aria live"} />
        </div>
        <div
          className={cn(
            "border p-4",
            mode === "business" ? "border-paper/10 bg-paper/[.03]" : "border-border bg-background",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {mode === "business" ? "Sarah is on a call" : "Aria handled a call"}
            </span>
            <span className="font-mono text-xs text-brand">00:42</span>
          </div>
          <p
            className={cn(
              "mt-3 text-sm",
              mode === "business" ? "text-paper/65" : "text-muted-foreground",
            )}
          >
            {mode === "business"
              ? "Qualified a new roofing lead, created CRM record, booked Friday 10am estimate."
              : "Blocked spam, rescheduled doctor appointment, and sent you a one-line summary."}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {["Transcript", "Actions", "Score"].map((x) => (
            <div
              key={x}
              className={cn(
                "border p-3 text-center text-xs",
                mode === "business" ? "border-paper/10" : "border-border",
              )}
            >
              {x}
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <div className="h-12 flex-1 bg-brand" />
          <div className="h-8 flex-1 bg-brand/40" />
          <div className="h-16 flex-1 bg-brand/70" />
          <div className="h-10 flex-1 bg-brand/30" />
        </div>
      </div>
    </div>
  );
}

function StaticPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main>
      <section className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <SectionHeader eyebrow={eyebrow} title={title} description={description} />
        </div>
      </section>
      {children}
    </main>
  );
}

function Features() {
  const cards: Array<[ComponentType<{ size?: number; className?: string }>, string]> = [
    [Mic, "Voice agents"],
    [Mail, "Email drafting"],
    [MessageSquare, "SMS follow-up"],
    [Calendar, "Appointments"],
    [Database, "Knowledge"],
    [ShieldCheck, "Verified actions"],
  ];
  return (
    <StaticPage
      eyebrow="Features"
      title="Everything your front line needs."
      description="One system for answering, resolving, escalating, training, and improving every conversation."
    >
      <div className="mx-auto grid max-w-7xl gap-5 px-6 py-16 md:grid-cols-3">
        {cards.map(([Icon, label]) => (
          <div key={label} className="border border-border bg-card p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-brand">
              <Icon size={18} />
            </span>
            <h3 className="mt-5 font-display text-2xl">{label}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Designed for premium desktop and laptop workflows with less scrolling and clearer
              hierarchy.
            </p>
          </div>
        ))}
      </div>
    </StaticPage>
  );
}
function Pricing() {
  const tiers = [
    ["Personal", "$19", "One AI phone line, spam guard, intents, summaries."],
    ["Business", "$149", "Fleet, Studio, Training, Live Ops, analytics."],
    ["Scale", "Custom", "More volume, roles, custom integrations, support."],
  ];
  return (
    <StaticPage
      eyebrow="Pricing"
      title="Simple pricing for personal and business."
      description="Start lean, then add agents, channels, and model upgrades as your usage grows."
    >
      <div className="mx-auto grid max-w-6xl gap-5 px-6 py-16 md:grid-cols-3">
        {tiers.map((t, i) => (
          <div
            key={t[0]}
            className={cn(
              "border p-6",
              i === 1 ? "border-brand bg-ink text-paper" : "border-border bg-card",
            )}
          >
            <Chip active={i === 1}>{t[0]}</Chip>
            <div className="mt-6 font-display text-5xl">{t[1]}</div>
            <p className={cn("mt-4 text-sm", i === 1 ? "text-paper/65" : "text-muted-foreground")}>
              {t[2]}
            </p>
            <Button
              to="/get-started"
              className={cn("mt-6 w-full", i === 1 && "bg-paper text-ink hover:bg-paper/90")}
            >
              Choose plan
            </Button>
          </div>
        ))}
      </div>
    </StaticPage>
  );
}
function Compare() {
  return (
    <StaticPage
      eyebrow="Compare"
      title="AI-native instead of phone-tree software."
      description="Wireline combines a live call floor, agent builder, training, analytics, and AI coaching without forcing you into legacy call-center UX."
    />
  );
}
function Showcase() {
  return (
    <StaticPage
      eyebrow="Showcase"
      title="Hear how agents behave before you deploy."
      description="Preview reception, sales, support, scheduling, and personal-call scenarios with realistic handoffs and summaries."
    >
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="border border-border bg-card p-6">
          <LiveDot label="Demo line active" />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {agents.map((a) => (
              <button
                key={a.id}
                className="border border-border bg-background p-4 text-left hover:border-brand"
              >
                <div className="font-display text-xl">{a.name}</div>
                <p className="mt-1 text-sm text-muted-foreground">{a.role}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </StaticPage>
  );
}
function Developers() {
  const cards: Array<[ComponentType<{ size?: number; className?: string }>, string]> = [
    [Terminal, "API-first"],
    [Webhook, "Webhooks"],
    [Key, "OAuth-ready"],
  ];
  return (
    <StaticPage
      eyebrow="Developers"
      title="Integrate Wireline into your stack."
      description="Webhooks, CRM sync, OAuth, audit logs, and model/provider controls for teams that want their phone agents wired into operations."
    >
      <div className="mx-auto grid max-w-6xl gap-5 px-6 py-16 md:grid-cols-3">
        {cards.map(([Icon, label]) => (
          <div key={label} className="border border-border bg-card p-6">
            <Icon className="text-brand" />
            <h3 className="mt-4 font-display text-2xl">{label}</h3>
          </div>
        ))}
      </div>
    </StaticPage>
  );
}
function About() {
  return (
    <StaticPage
      eyebrow="About"
      title="Wireline makes phones useful again."
      description="A focused operating layer for calls, messages, appointments, training, and AI-assisted execution."
    />
  );
}
function Blog() {
  return (
    <StaticPage
      eyebrow="Blog"
      title="Notes from the Wireline build."
      description="Product updates, AI voice agent strategy, launch notes, and operations playbooks."
    />
  );
}
function MarketingTraining() {
  return (
    <StaticPage
      eyebrow="Training"
      title="Teach the agent once. Improve it forever."
      description="Upload policies, scripts, pronunciation, scenarios, and workflows. Then test before the first customer call."
    />
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-ink p-12 text-paper wl-grain lg:flex">
        <Link to="/">
          <Logo light />
        </Link>
        <div>
          <LiveDot label="Workspace setup" />
          <h1 className="mt-4 max-w-lg font-display text-5xl leading-tight">
            Run personal calls and business ops from one Wireline account.
          </h1>
          <p className="mt-5 max-w-sm text-sm text-paper/65">
            Set up the line, pick your mode, then use the Assistant to finish training.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-[.18em] text-paper/40">
          SOC 2 roadmap · AES-256-GCM · trywireline.com
        </span>
      </div>
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm 2xl:max-w-md">{children}</div>
      </div>
    </div>
  );
}
function GetStarted() {
  const [mode, setMode] = useState<Mode>("personal");
  const navigate = useNavigate();
  const choices: Array<[Mode, ComponentType<{ size?: number; className?: string }>, string]> = [
    ["personal", User, "One number, call screening, intents, Siri & CarPlay."],
    ["business", Building2, "A fleet of agents, live ops, roles, and analytics."],
  ];
  return (
    <AuthShell>
      <div className="mb-8 lg:hidden">
        <Logo />
      </div>
      <Chip active>Step 1 of 2</Chip>
      <h1 className="mt-5 font-display text-3xl text-ink">How will you use Wireline?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose the workspace. You can change it later.
      </p>
      <div className="mt-7 grid gap-3">
        {choices.map(([id, Icon, desc]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={cn(
              "flex gap-4 border p-5 text-left",
              mode === id
                ? "border-brand bg-card shadow-[0_0_0_1px_var(--brand)]"
                : "border-border bg-background hover:border-brand/50",
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                mode === id ? "bg-brand text-paper" : "bg-secondary text-ink",
              )}
            >
              <Icon size={18} />
            </span>
            <span>
              <span className="font-display text-lg capitalize">{id}</span>
              <span className="block text-sm text-muted-foreground">{desc}</span>
            </span>
          </button>
        ))}
      </div>
      <Button
        onClick={() => navigate(mode === "personal" ? "/app/personal" : "/app/business")}
        className="mt-6 w-full"
      >
        Continue <ArrowRight size={16} />
      </Button>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/auth" className="text-brand">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
function SignIn() {
  const navigate = useNavigate();
  return (
    <AuthShell>
      <Link to="/" className="mb-8 inline-flex">
        <Logo />
      </Link>
      <Chip active>Welcome back</Chip>
      <h1 className="mt-5 font-display text-3xl">Sign in to Wireline</h1>
      <div className="mt-7 grid gap-3">
        <input
          className="h-11 border border-border bg-card px-3 text-sm outline-none focus:border-brand"
          placeholder="Email"
        />
        <input
          className="h-11 border border-border bg-card px-3 text-sm outline-none focus:border-brand"
          placeholder="Password"
          type="password"
        />
        <Button onClick={() => navigate("/app/business")} className="w-full">
          Open console <ArrowRight size={16} />
        </Button>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        New here?{" "}
        <Link to="/get-started" className="text-brand">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

function ConsoleShell({ personal = false }: { personal?: boolean }) {
  const [tab, setTab] = useState<ConsoleTab>(personal ? "assistant" : "liveops");
  const nav: Array<[ConsoleTab, ReactNode, string]> = personal
    ? [
        ["assistant", <Sparkles size={16} />, "Assistant"],
        ["liveops", <Phone size={16} />, "Calls"],
        ["training", <Command size={16} />, "Intents"],
        ["settings", <Shield size={16} />, "Settings"],
      ]
    : [
        ["assistant", <Sparkles size={16} />, "Assistant"],
        ["liveops", <Activity size={16} />, "Live Ops"],
        ["fleet", <Bot size={16} />, "Fleet"],
        ["studio", <LayoutGrid size={16} />, "Studio"],
        ["training", <Database size={16} />, "Training"],
        ["analytics", <BarChart3 size={16} />, "Analytics"],
        ["integrations", <Plug size={16} />, "Integrations"],
        ["settings", <Shield size={16} />, "Settings"],
      ];
  return (
    <div
      className={cn("flex min-h-screen", personal ? "bg-background text-ink" : "bg-ink text-paper")}
    >
      <aside
        className={cn(
          "hidden w-60 shrink-0 flex-col border-r p-4 lg:flex",
          personal ? "border-border bg-card" : "border-paper/10 bg-ink",
        )}
      >
        <Link to="/" className="mb-8 px-2 pt-2">
          <Logo light={!personal} />
        </Link>
        <Chip className={personal ? undefined : "border-paper/20 text-paper/60"}>
          {personal ? "Personal" : "Acme Co · Business"}
        </Chip>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {nav.map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors",
                tab === id
                  ? "bg-brand text-paper"
                  : personal
                    ? "text-muted-foreground hover:bg-background hover:text-ink"
                    : "text-paper/60 hover:bg-paper/5 hover:text-paper",
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
        <div className={cn("border-t pt-4", personal ? "border-border" : "border-paper/10")}>
          <Link
            to="/"
            className={cn(
              "flex items-center gap-2 text-sm",
              personal ? "text-muted-foreground" : "text-paper/50",
            )}
          >
            <LogOut size={15} /> Exit
          </Link>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header
          className={cn(
            "sticky top-0 z-30 flex h-14 items-center justify-between border-b px-6 backdrop-blur",
            personal ? "border-border bg-background/90" : "border-paper/10 bg-ink/90",
          )}
        >
          <div className="flex items-center gap-3 lg:hidden">
            <Logo light={!personal} />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <LiveDot label={personal ? "Aria live" : "Fleet live"} />
            <span
              className={cn(
                "font-mono text-xs",
                personal ? "text-muted-foreground" : "text-paper/40",
              )}
            >
              · {personal ? "3 calls handled today" : "3 agents on calls"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "hidden items-center gap-2 border px-3 py-1.5 md:flex",
                personal ? "border-border" : "border-paper/15",
              )}
            >
              <Search size={14} />
              <input
                placeholder="Search…"
                className={cn(
                  "w-40 bg-transparent text-sm outline-none",
                  personal
                    ? "placeholder:text-muted-foreground"
                    : "text-paper placeholder:text-paper/30",
                )}
              />
            </div>
            <Bell size={17} />
          </div>
        </header>
        <div
          className={cn(
            "flex gap-1 overflow-x-auto border-b px-4 py-2 lg:hidden",
            personal ? "border-border" : "border-paper/10",
          )}
        >
          {nav.map(([id, , label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "whitespace-nowrap px-3 py-1.5 text-xs",
                tab === id ? "text-brand" : personal ? "text-muted-foreground" : "text-paper/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <main className="flex-1 overflow-auto p-6">
          {tab === "assistant" && <Assistant personal={personal} />}{" "}
          {tab === "liveops" && (personal ? <PersonalCalls /> : <LiveOps />)}{" "}
          {tab === "fleet" && <Fleet />} {tab === "studio" && <Studio />}{" "}
          {tab === "training" && <TrainingConsole personal={personal} />}{" "}
          {tab === "analytics" && <Analytics />} {tab === "integrations" && <Integrations />}{" "}
          {tab === "settings" && <Settings personal={personal} />}
        </main>
      </div>
    </div>
  );
}

function Assistant({ personal }: { personal: boolean }) {
  const prompts = personal
    ? ["Summarize today", "Set pharmacy intent", "Block unknown callers"]
    : ["Audit my fleet", "Fix billing calls", "Train Sarah on pricing"];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Chip active>Wireline Assistant</Chip>
        <h1 className={cn("mt-3 font-display text-4xl", personal ? "text-ink" : "text-paper")}>
          {personal
            ? "Your personal phone chief of staff."
            : "Your operator for agents, workflows, and launch."}
        </h1>
        <p className={cn("mt-2 text-sm", personal ? "text-muted-foreground" : "text-paper/60")}>
          Ask what to improve, what to train, which calls need review, or what actions are safe to
          approve.
        </p>
      </div>
      <div
        className={cn(
          "border p-5",
          personal ? "border-border bg-card" : "border-paper/12 bg-paper/[.03]",
        )}
      >
        <div className="space-y-4">
          {[
            "I reviewed the last 24 hours.",
            personal
              ? "Aria blocked 7 spam calls and found one appointment that needs confirmation."
              : "Sarah is performing well. Tyler needs a billing escalation update and Maria needs one pricing rule.",
            "I can update training, draft replies, or create a test scenario.",
          ].map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[86%] border p-3 text-sm",
                i % 2
                  ? "ml-auto border-brand bg-brand text-paper"
                  : personal
                    ? "border-border bg-background"
                    : "border-paper/10 bg-ink",
              )}
            >
              {m}
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {prompts.map((p) => (
            <button
              key={p}
              className="border border-border px-3 py-1.5 text-xs text-muted-foreground"
            >
              {p}
            </button>
          ))}
        </div>
        <div
          className={cn(
            "mt-4 flex items-center gap-3 border px-3 py-2",
            personal ? "border-border bg-background" : "border-paper/10 bg-ink",
          )}
        >
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            placeholder="Ask Wireline…"
          />
          <Button className="h-9 px-3">Send</Button>
        </div>
      </div>
    </div>
  );
}
function LiveOps() {
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Live Operations" title="The cockpit" light />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((m) => (
          <Panel key={m.l}>
            <div className="flex justify-between text-paper/40">
              <PhoneCall size={14} />
              <span className="font-mono text-xs text-brand-bright">{m.d}</span>
            </div>
            <div className="mt-3 font-display text-3xl">{m.k}</div>
            <Eyebrow>{m.l}</Eyebrow>
          </Panel>
        ))}
      </div>
      <Panel className="p-0">
        <div className="flex justify-between border-b border-paper/10 p-5">
          <span className="font-display text-xl">Calls in progress</span>
          <LiveDot label="active" />
        </div>
        {liveCalls.map((c) => (
          <div
            key={c.id}
            className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-paper/8 p-4 text-sm"
          >
            <div>
              <div>{c.topic}</div>
              <div className="font-mono text-xs text-paper/40">
                {c.agent} · {c.caller}
              </div>
            </div>
            <span>{c.duration}</span>
            <button className="border border-paper/20 px-3 py-1 text-xs">
              <Headphones size={12} className="inline" /> Listen
            </button>
          </div>
        ))}
      </Panel>
    </div>
  );
}
function PersonalCalls() {
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Personal line" title="Handled today" />
      <div className="grid gap-4 md:grid-cols-3">
        {personalCalls.map((c) => (
          <div key={c.who} className="border border-border bg-card p-5">
            <Chip>{c.tag}</Chip>
            <h3 className="mt-4 font-display text-2xl">{c.who}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{c.result}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
function Fleet() {
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Agent Fleet" title="Your agents" light />
      <Panel className="p-0">
        {agents.map((a) => (
          <div
            key={a.id}
            className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 border-b border-paper/8 p-4 text-sm"
          >
            <div>
              <div className="font-display text-xl">{a.name}</div>
              <div className="text-paper/40">{a.role}</div>
            </div>
            <span>{a.status}</span>
            <span>{a.calls}</span>
            <span>{a.csat}</span>
            <button className="border border-paper/20 px-3 py-1 text-xs">Coach</button>
          </div>
        ))}
      </Panel>
    </div>
  );
}
function Studio() {
  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Agent Studio"
        title="Simple setup first. Training lives separately."
        light
      />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <Panel>
          <h3 className="font-display text-2xl">Basics</h3>
          <div className="mt-5 grid gap-3">
            <input
              className="border border-paper/15 bg-ink px-3 py-2 text-sm"
              defaultValue="Sarah"
            />
            <select className="border border-paper/15 bg-ink px-3 py-2 text-sm">
              <option>Reception agent</option>
              <option>Sales agent</option>
            </select>
            <select className="border border-paper/15 bg-ink px-3 py-2 text-sm">
              <option>Grok 4.3 balanced</option>
              <option>Gemini Flash economical</option>
            </select>
          </div>
        </Panel>
        <Panel>
          <h3 className="font-display text-2xl">Launch checklist</h3>
          <div className="mt-5 space-y-3">
            {["Name and role", "Phone number", "Model", "Voice", "Handoff rule"].map((x, i) => (
              <div key={x} className="flex items-center gap-3 text-sm">
                <Check size={15} className={i < 3 ? "text-brand-bright" : "text-paper/30"} />
                {x}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
function TrainingConsole({ personal }: { personal?: boolean }) {
  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Training"
        title={personal ? "Personal intents" : "Knowledge, workflows, voice, simulator"}
        light={!personal}
      />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {["Knowledge", "Voice", "Workflows", "Simulator"].map((x) => (
          <div
            key={x}
            className={cn(
              "border p-5",
              personal ? "border-border bg-card" : "border-paper/12 bg-paper/[.03]",
            )}
          >
            <FileText className="text-brand" />
            <h3 className={cn("mt-4 font-display text-2xl", personal ? "text-ink" : "text-paper")}>
              {x}
            </h3>
            <p className={cn("mt-2 text-sm", personal ? "text-muted-foreground" : "text-paper/50")}>
              Add source material, rules, and scenarios.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
function Analytics() {
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Analytics" title="Performance, quality, and revenue" light />
      <div className="grid gap-4 lg:grid-cols-3">
        {metrics.slice(1).map((m) => (
          <Panel key={m.l}>
            <div className="font-display text-4xl">{m.k}</div>
            <Eyebrow>{m.l}</Eyebrow>
          </Panel>
        ))}
      </div>
    </div>
  );
}
function Integrations() {
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Integrations" title="Connect the stack" light />
      <div className="grid gap-4 md:grid-cols-3">
        {["Google", "Microsoft", "HubSpot", "Stripe", "Twilio", "Vapi"].map((x) => (
          <Panel key={x}>
            <Plug className="text-brand-bright" />
            <h3 className="mt-4 font-display text-2xl">{x}</h3>
            <p className="text-sm text-paper/50">Ready to connect</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
function Settings({ personal }: { personal?: boolean }) {
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Settings" title="Workspace controls" light={!personal} />
      <div className="grid gap-4 md:grid-cols-2">
        {["Billing", "Team", "Branding", "Security"].map((x) => (
          <div
            key={x}
            className={cn(
              "border p-5",
              personal ? "border-border bg-card" : "border-paper/12 bg-paper/[.03]",
            )}
          >
            <ShieldCheck className="text-brand" />
            <h3 className={cn("mt-4 font-display text-2xl", personal ? "text-ink" : "text-paper")}>
              {x}
            </h3>
          </div>
        ))}
      </div>
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  light = false,
}: {
  eyebrow: string;
  title: string;
  light?: boolean;
}) {
  return (
    <div>
      <Chip active className={light ? "border-paper/20 bg-paper/5 text-paper/70" : undefined}>
        {eyebrow}
      </Chip>
      <h1 className={cn("mt-2 font-display text-4xl", light ? "text-paper" : "text-ink")}>
        {title}
      </h1>
    </div>
  );
}
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border border-paper/12 bg-paper/[.03] p-5", className)}>{children}</div>
  );
}
function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-[10px] uppercase tracking-[.18em] text-paper/40">{children}</span>;
}
function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div>
        <Logo />
        <h1 className="mt-8 font-display text-5xl">Page not found</h1>
        <p className="mt-3 text-muted-foreground">
          This route is not part of the new Wireline surface.
        </p>
        <Button to="/" className="mt-6">
          <ArrowLeft size={15} /> Back home
        </Button>
      </div>
    </div>
  );
}

export default function FigmaOverhaulApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/features" element={<Features />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/showcase" element={<Showcase />} />
          <Route path="/developers" element={<Developers />} />
          <Route path="/about" element={<About />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/training" element={<MarketingTraining />} />
        </Route>
        <Route path="/get-started" element={<GetStarted />} />
        <Route path="/signup" element={<GetStarted />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/login" element={<SignIn />} />
        <Route path="/auth" element={<SignIn />} />
        <Route path="/auth/*" element={<SignIn />} />
        <Route path="/app/personal" element={<ConsoleShell personal />} />
        <Route path="/personal-home" element={<ConsoleShell personal />} />
        <Route path="/app/business" element={<ConsoleShell />} />
        <Route path="/ops" element={<ConsoleShell />} />
        <Route path="/agents" element={<ConsoleShell />} />
        <Route path="/phone" element={<ConsoleShell />} />
        <Route path="/email" element={<ConsoleShell />} />
        <Route path="/sms" element={<ConsoleShell />} />
        <Route path="/insights" element={<ConsoleShell />} />
        <Route path="/integrations" element={<ConsoleShell />} />
        <Route path="/admin" element={<ConsoleShell />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
