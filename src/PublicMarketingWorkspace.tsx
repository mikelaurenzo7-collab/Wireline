import type { ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Building2,
  CalendarCheck,
  Check,
  Code2,
  Database,
  Headphones,
  Mail,
  MessageSquare,
  Phone,
  PhoneCall,
  Radio,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

type CardItem = { icon: LucideIcon; title: string; text: string; tag?: string };
type Tier = {
  name: string;
  price: string;
  plan: string;
  note: string;
  text: string;
  items: string[];
  badge?: string;
  featured?: boolean;
};

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
const nav = ["features", "pricing", "showcase", "developers", "compare", "training", "about"];

const tiers: Tier[] = [
  {
    name: "Personal",
    price: "$9",
    plan: "personal",
    note: "For one person",
    text: "A private assistant for your own phone — screening, summaries, reminders, and the routine calls that should never interrupt your day.",
    items: ["Call screening", "Spam guard", "Call summaries", "Siri & widget triggers"],
  },
  {
    name: "Plus",
    price: "$19",
    plan: "personal-plus",
    note: "For heavier personal use",
    text: "More handled calls, deeper calendar and email context, and appointment workflows for real personal productivity.",
    items: [
      "Higher monthly usage",
      "Calendar & email context",
      "Appointment workflows",
      "Priority personal memory",
    ],
  },
  {
    name: "Studio",
    price: "$29",
    plan: "business-starter",
    note: "Best value for customization",
    text: "Unlock the full Studio for personal, side-project, or business workflows — without a complicated call-center stack.",
    items: [
      "4 configurable agents",
      "500 voice minutes",
      "2 dedicated numbers",
      "Studio + Training",
    ],
    badge: "Best entry",
  },
  {
    name: "Operator",
    price: "$59",
    plan: "starter",
    note: "For heavier call volume",
    text: "More agents, minutes, live review, analytics, and workflows for people or teams.",
    items: ["8 agents", "1,200 voice minutes", "Live Ops + analytics", "CRM & calendar routing"],
    featured: true,
    badge: "Most popular",
  },
  {
    name: "Custom",
    price: "Custom",
    plan: "scale",
    note: "For high-volume teams",
    text: "Advanced approvals, webhooks, audit logs, custom routing, and hands-on launch support.",
    items: ["10 assistants", "3,000 voice minutes", "Audit logs", "Launch support"],
  },
];

const workflowSteps = [
  {
    icon: Phone,
    title: "Connect the line",
    text: "Bring one personal number, a business line, or a whole set of numbers into Wireline.",
  },
  {
    icon: Bot,
    title: "Choose the assistant",
    text: "Start with a personal assistant, front desk, sales qualifier, intake, or support assistant.",
  },
  {
    icon: Database,
    title: "Train the behavior",
    text: "Add scripts, policies, FAQs, objections, routing rules, and the limits it should never cross.",
  },
  {
    icon: Radio,
    title: "Run it live",
    text: "Review calls, escalations, outcomes, and follow-ups — all from one simple place.",
  },
];

const agentPreviews: CardItem[] = [
  {
    icon: UserRound,
    title: "Personal Assistant",
    text: "Screens unknown callers, waits on hold, summarizes calls, and keeps routine phone work off your plate.",
    tag: "Personal",
  },
  {
    icon: Building2,
    title: "Front Desk",
    text: "Answers FAQs, books appointments, routes urgent issues, and texts a confirmation after every call.",
    tag: "Business",
  },
  {
    icon: Headphones,
    title: "Support",
    text: "Handles status checks, triage, refunds, escalation notes, and post-call customer updates.",
    tag: "Support",
  },
  {
    icon: CalendarCheck,
    title: "Sales",
    text: "Qualifies inbound leads, books demos, captures context, and pushes clean notes into your CRM.",
    tag: "Revenue",
  },
];

const capabilities = [
  "Call screening",
  "Appointment booking",
  "Spam blocking",
  "Live transfer",
  "Call summaries",
  "SMS follow-up",
  "CRM sync",
  "Voicemail triage",
  "Lead qualifying",
  "After-hours coverage",
  "Calendar routing",
  "Escalation alerts",
];

/* ── Primitives ──────────────────────────────────────────────────────────── */

function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-brand",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Button({
  children,
  to,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  to: string;
  variant?: "primary" | "secondary" | "ghost" | "invert";
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200",
        variant === "primary" &&
          "bg-brand text-[#fff] shadow-[0_16px_36px_-16px_rgba(124,58,237,.9)] hover:-translate-y-0.5 hover:shadow-[0_22px_46px_-16px_rgba(124,58,237,.95)]",
        variant === "secondary" &&
          "border border-border bg-card text-foreground hover:border-brand/50 hover:text-brand",
        variant === "ghost" && "text-foreground hover:text-brand",
        variant === "invert" && "bg-[#F3EFFA] text-[#1E1B2E] hover:-translate-y-0.5 hover:bg-white",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function WordMark({ invert = false }: { invert?: boolean }) {
  return (
    <Link to="/" className="group inline-flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-[#fff] shadow-[0_14px_30px_-12px_rgba(124,58,237,.85)]">
        <span className="font-mono text-sm font-bold">W</span>
      </span>
      <span
        className={cn(
          "font-display text-[22px] font-semibold tracking-[-0.04em]",
          invert ? "text-[#F3EFFA]" : "text-foreground",
        )}
      >
        Wireline
      </span>
    </Link>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-[rgba(247,249,248,0.82)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-5 sm:px-8">
        <WordMark />
        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <NavLink
              key={item}
              to={`/${item}`}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3.5 py-2 text-sm font-medium capitalize transition-colors",
                  isActive
                    ? "bg-brand/10 text-brand"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {item}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/signin"
            className="inline-flex min-h-[44px] items-center rounded-full px-4 py-2 text-sm font-medium text-foreground hover:text-brand"
          >
            Sign in
          </Link>
          <Button to="/get-started">
            Get started <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const groups: Array<[string, string[]]> = [
    ["Product", ["features", "pricing", "showcase", "training"]],
    ["Build", ["developers", "compare"]],
    ["Company", ["about", "blog", "contact"]],
    ["Legal", ["terms", "privacy", "security"]],
  ];
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid w-full max-w-[1280px] gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="max-w-xs">
          <WordMark />
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            The AI phone layer for people and businesses — from one personal assistant to a full
            team of trained voice assistants.
          </p>
        </div>
        {groups.map(([label, links]) => (
          <div key={label}>
            <Mono className="text-muted-foreground">{label}</Mono>
            <ul className="mt-4 space-y-2.5">
              {links.map((l) => (
                <li key={l}>
                  <Link
                    to={`/${l}`}
                    className="text-sm capitalize text-muted-foreground transition-colors hover:text-brand"
                  >
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>© {new Date().getFullYear()} Wireline. All rights reserved.</span>
          <span className="font-mono uppercase tracking-[0.2em]">trywireline.com</span>
        </div>
      </div>
    </footer>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopBar />
      {children}
      <Footer />
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  text,
  align = "left",
}: {
  eyebrow: string;
  title: ReactNode;
  text?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <Mono>{eyebrow}</Mono>
      <h2 className="mt-4 font-display text-4xl font-medium leading-[1.04] tracking-[-0.03em] text-balance md:text-5xl">
        {title}
      </h2>
      {text && (
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground text-pretty">{text}</p>
      )}
    </div>
  );
}

function Card({ item }: { item: CardItem }) {
  const Icon = item.icon;
  return (
    <div className="group relative flex flex-col rounded-3xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_24px_48px_-28px_rgba(124,58,237,.45)]">
      <div className="flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/10 text-brand">
          <Icon size={20} />
        </span>
        {item.tag && <Mono className="text-muted-foreground">{item.tag}</Mono>}
      </div>
      <h3 className="mt-5 font-display text-xl font-medium tracking-[-0.02em]">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
    </div>
  );
}

/* ── Hero live-call illustration (example, not real metrics) ─────────────── */

function Waveform() {
  const bars = [0.3, 0.7, 1, 0.5, 0.85, 0.4, 0.95, 0.6, 0.35, 0.8, 0.5, 0.9, 0.45, 0.7, 0.3];
  return (
    <div className="flex h-8 items-end gap-1" aria-hidden="true">
      {bars.map((h, i) => (
        <span
          key={i}
          className="wl-eq-bar w-1 rounded-full bg-[#A78BFA]"
          style={{ height: `${h * 100}%`, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

function CallTranscript() {
  const lines: Array<{ who: "caller" | "assistant"; text: string }> = [
    { who: "caller", text: "Hi, I'm trying to book a service estimate for next week." },
    { who: "assistant", text: "Happy to help. Friday at 11:30 works — should I lock it in?" },
    { who: "caller", text: "Yes, Friday's perfect." },
    { who: "assistant", text: "Booked. I'll text a confirmation and a reminder the morning of." },
  ];
  return (
    <div className="space-y-3">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            "wl-rise max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-6",
            l.who === "assistant" ? "ml-auto bg-brand text-[#fff]" : "bg-white/8 text-[#F3EFFA]",
          )}
          style={{ animationDelay: `${i * 140}ms` }}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}

function HeroPanel() {
  return (
    <div className="relative">
      <div
        className="absolute -inset-6 rounded-[40px] opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 50% at 70% 20%, rgba(124,58,237,.28), transparent 70%), radial-gradient(50% 50% at 20% 80%, rgba(91,33,182,.22), transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#1E1B2E] p-6 shadow-[0_40px_90px_-40px_rgba(0,0,0,.7)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-[#fff]">
              <PhoneCall size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#F3EFFA]">Personal Assistant</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#A78BFA]">
                On a call now
              </p>
            </div>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5">
            <span className="relative grid place-items-center">
              <span className="wl-ping absolute h-2 w-2 rounded-full bg-[#A78BFA]" />
              <span className="h-2 w-2 rounded-full bg-[#A78BFA]" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#F3EFFA]">
              Live
            </span>
          </span>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
          <Waveform />
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[#7A7194]">
            Screening · transcribing
          </span>
        </div>

        <div className="mt-5">
          <CallTranscript />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {["Booked Friday 11:30", "SMS confirmation sent", "Added to calendar"].map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-[#F3EFFA]"
            >
              <Check size={12} className="text-brand" /> {t}
            </span>
          ))}
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6E6584]">
          Illustration of a Wireline call
        </p>
      </div>
    </div>
  );
}

/* ── Capability marquee ──────────────────────────────────────────────────── */

function CapabilityMarquee() {
  const row = [...capabilities, ...capabilities];
  return (
    <div className="wl-marquee relative overflow-hidden border-y border-border bg-card py-5">
      <div className="wl-marquee-track gap-8 whitespace-nowrap">
        {row.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-8">
            <span className="font-display text-xl font-medium tracking-[-0.02em] text-muted-foreground">
              {c}
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Sections ────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 38% at 82% 8%, rgba(124,58,237,.10), transparent 70%), radial-gradient(40% 30% at 6% 70%, rgba(91,33,182,.08), transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div className="relative mx-auto grid w-full max-w-[1280px] items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5">
            <Sparkles size={13} className="text-brand" />
            <Mono className="text-foreground">Personal first · Business-ready</Mono>
          </div>
          <h1 className="mt-7 font-display text-[clamp(2.75rem,6vw,5.25rem)] font-medium leading-[0.98] tracking-[-0.045em] text-balance">
            Your phone,
            <br />
            <span className="italic text-brand">finally</span> answering for you.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Wireline answers, screens, books, and follows up on calls — for one person or an entire
            business. Start with a personal assistant, grow into a team of trained business
            assistants.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button to="/get-started">
              Get started free <ArrowRight size={16} />
            </Button>
            <Button to="/showcase" variant="secondary">
              <Phone size={16} /> Hear an assistant
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3">
            {[
              ["Answers 24/7", Radio],
              ["Books appointments", CalendarCheck],
              ["Texts follow-ups", MessageSquare],
            ].map(([label, Icon]) => {
              const I = Icon as LucideIcon;
              return (
                <span
                  key={label as string}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <I size={15} className="text-brand" /> {label as string}
                </span>
              );
            })}
          </div>
        </div>
        <HeroPanel />
      </div>
    </section>
  );
}

function TwoWorlds() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-5 py-20 sm:px-8 lg:py-28">
      <SectionHeader
        eyebrow="One platform, two jobs"
        title={<>A personal assistant for you. A team of assistants for your business.</>}
        text="Wireline scales from a single private line to a fleet of business numbers — without ever feeling complicated."
      />
      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {/* Personal */}
        <div className="relative overflow-hidden rounded-[32px] border border-border bg-card p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand">
              <UserRound size={22} />
            </span>
            <div>
              <Mono className="text-muted-foreground">For you</Mono>
              <h3 className="font-display text-2xl font-medium tracking-[-0.02em]">
                Personal Wireline Assistant
              </h3>
            </div>
          </div>
          <p className="mt-5 text-[15px] leading-7 text-muted-foreground">
            It screens unknown callers, blocks spam, waits on hold, and hands you a clean summary —
            so your phone stops running your day.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              "Screens and labels every unknown caller",
              "Waits on hold and tells you when a human picks up",
              "Sends a written summary after each call",
            ].map((l) => (
              <li key={l} className="flex items-start gap-3 text-sm text-foreground">
                <Check size={16} className="mt-0.5 shrink-0 text-brand" /> {l}
              </li>
            ))}
          </ul>
          <Link
            to="/get-started"
            className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:gap-3 transition-all"
          >
            Set up your assistant <ArrowUpRight size={16} />
          </Link>
        </div>

        {/* Business */}
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#1E1B2E] p-8 text-[#F3EFFA]">
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full opacity-50 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(124,58,237,.5), transparent 70%)" }}
            aria-hidden="true"
          />
          <div className="relative flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-[#fff]">
              <Building2 size={22} />
            </span>
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#A78BFA]">
                For your business
              </span>
              <h3 className="font-display text-2xl font-medium tracking-[-0.02em]">
                Configurable Wireline Agents
              </h3>
            </div>
          </div>
          <p className="relative mt-5 text-[15px] leading-7 text-[#B8B0CA]">
            A front desk that never misses a call. Assistants that book jobs, qualify leads, answer
            FAQs, and route the urgent stuff to a real person.
          </p>
          <ul className="relative mt-6 space-y-3">
            {[
              "Answer, book, and qualify across every line",
              "Route urgent calls and escalate to your team",
              "Push notes and outcomes into your CRM",
            ].map((l) => (
              <li key={l} className="flex items-start gap-3 text-sm text-[#F3EFFA]">
                <Check size={16} className="mt-0.5 shrink-0 text-[#A78BFA]" /> {l}
              </li>
            ))}
          </ul>
          <Link
            to="/pricing"
            className="relative mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#A78BFA] hover:gap-3 transition-all"
          >
            Build your front desk <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-5 py-20 sm:px-8 lg:py-28">
      <SectionHeader eyebrow="How it works" title="Live in an afternoon, not a quarter." />
      <div className="mt-14 grid gap-px overflow-hidden rounded-[32px] border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
        {workflowSteps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="group relative bg-card p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold text-brand">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon
                  size={20}
                  className="text-muted-foreground transition-colors group-hover:text-brand"
                />
              </div>
              <h3 className="mt-8 font-display text-xl font-medium tracking-[-0.02em]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AssistantShowcase() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-5 py-20 sm:px-8 lg:py-28">
      <SectionHeader
        eyebrow="The assistants"
        title="Pick a role. Train it. Put it on the phone."
        text="Each assistant is a focused role with its own scripts, limits, and tone — not a generic bot."
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {agentPreviews.map((item) => (
          <Card key={item.title} item={item} />
        ))}
      </div>
    </section>
  );
}

function Manifesto() {
  return (
    <section className="relative overflow-hidden bg-[#1E1B2E] py-24 text-[#F3EFFA]">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, rgba(124,58,237,.18), transparent 70%), radial-gradient(40% 40% at 80% 100%, rgba(91,33,182,.14), transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-[1000px] px-5 text-center sm:px-8">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#A78BFA]">
          Why Wireline
        </span>
        <p className="mt-7 font-display text-3xl font-medium leading-[1.18] tracking-[-0.02em] text-balance md:text-[2.6rem]">
          The phone is still where deals close, jobs get booked, and customers decide to stay. Yet
          most calls go to voicemail. Wireline makes sure{" "}
          <span className="italic text-brand">every one</span> gets a great answer.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button to="/get-started" variant="invert">
            Get started free <ArrowRight size={16} />
          </Button>
          <Button to="/compare" variant="ghost" className="text-[#F3EFFA] hover:text-[#fff]">
            See how we compare <ArrowUpRight size={16} />
          </Button>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-5 py-20 sm:px-8 lg:py-28">
      <SectionHeader
        eyebrow="Pricing"
        title="Start at $9. Custom when you're ready."
        text="Personal plans for individuals, business plans for teams. No call-center contract, no setup fees."
        align="center"
      />
      <div className="mt-14 grid gap-5 lg:grid-cols-3 xl:grid-cols-5">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "relative flex flex-col rounded-3xl border p-6",
              tier.featured
                ? "border-brand/50 bg-[#1E1B2E] text-[#F3EFFA] shadow-[0_30px_70px_-40px_rgba(124,58,237,.7)] xl:scale-[1.03]"
                : "border-border bg-card",
            )}
          >
            {tier.badge && (
              <span
                className={cn(
                  "absolute -top-3 left-6 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
                  tier.featured ? "bg-brand text-[#fff]" : "bg-brand/10 text-brand",
                )}
              >
                {tier.badge}
              </span>
            )}
            <h3 className="font-display text-xl font-medium tracking-[-0.02em]">{tier.name}</h3>
            <p
              className={cn(
                "mt-1 text-xs",
                tier.featured ? "text-[#B8B0CA]" : "text-muted-foreground",
              )}
            >
              {tier.note}
            </p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-display text-4xl font-semibold tracking-[-0.03em]">
                {tier.price}
              </span>
              <span
                className={cn(
                  "text-sm",
                  tier.featured ? "text-[#B8B0CA]" : "text-muted-foreground",
                )}
              >
                /mo
              </span>
            </div>
            <p
              className={cn(
                "mt-4 min-h-[72px] text-sm leading-6",
                tier.featured ? "text-[#B8B0CA]" : "text-muted-foreground",
              )}
            >
              {tier.text}
            </p>
            <ul className="mt-2 space-y-2.5">
              {tier.items.map((it) => (
                <li
                  key={it}
                  className={cn(
                    "flex items-start gap-2 text-sm",
                    tier.featured ? "text-[#F3EFFA]" : "text-foreground",
                  )}
                >
                  <Check
                    size={15}
                    className={cn(
                      "mt-0.5 shrink-0",
                      tier.featured ? "text-[#A78BFA]" : "text-brand",
                    )}
                  />
                  {it}
                </li>
              ))}
            </ul>
            <Link
              to={`/get-started?plan=${tier.plan}`}
              className={cn(
                "mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all",
                tier.featured
                  ? "bg-[#F3EFFA] text-[#1E1B2E] hover:bg-white"
                  : "border border-border text-foreground hover:border-brand/50 hover:text-brand",
              )}
            >
              Choose {tier.name}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-5 pb-24 sm:px-8">
      <div className="relative overflow-hidden rounded-[36px] border border-border bg-card p-10 text-center sm:p-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background: "radial-gradient(50% 70% at 50% 0%, rgba(124,58,237,.12), transparent 70%)",
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl font-display text-4xl font-medium leading-[1.05] tracking-[-0.03em] text-balance md:text-5xl">
            Put your phone to work today.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Set up a personal assistant in minutes, or launch your first business line this
            afternoon.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button to="/get-started">
              Get started free <ArrowRight size={16} />
            </Button>
            <Button to="/pricing" variant="secondary">
              View pricing
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Pages ───────────────────────────────────────────────────────────────── */

function Landing() {
  return (
    <Layout>
      <main>
        <Hero />
        <CapabilityMarquee />
        <TwoWorlds />
        <HowItWorks />
        <AssistantShowcase />
        <Manifesto />
        <Pricing />
        <FinalCTA />
      </main>
    </Layout>
  );
}

function SimplePage({
  eyebrow,
  title,
  text,
  items,
}: {
  eyebrow: string;
  title: string;
  text: string;
  items: CardItem[];
}) {
  return (
    <Layout>
      <main>
        <section className="mx-auto w-full max-w-[1280px] px-5 pt-20 sm:px-8">
          <SectionHeader eyebrow={eyebrow} title={title} text={text} />
        </section>
        <section className="mx-auto w-full max-w-[1280px] px-5 py-14 sm:px-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Card key={item.title} item={item} />
            ))}
          </div>
        </section>
        <FinalCTA />
      </main>
    </Layout>
  );
}

function Features() {
  return (
    <SimplePage
      eyebrow="Features"
      title="The full AI phone layer."
      text="Everything you need to answer, book, follow up, and improve — on personal and business lines alike."
      items={[
        {
          icon: PhoneCall,
          title: "Real-time voice",
          text: "Natural conversations that screen, answer, and resolve calls live.",
        },
        {
          icon: CalendarCheck,
          title: "Scheduling",
          text: "Books, confirms, and reschedules straight into your calendar.",
        },
        {
          icon: MessageSquare,
          title: "SMS follow-up",
          text: "Confirmations, reminders, and follow-ups the instant a call ends.",
        },
        {
          icon: Database,
          title: "CRM sync",
          text: "Notes, contacts, and outcomes flow into your existing tools.",
        },
        {
          icon: ShieldCheck,
          title: "Approvals",
          text: "Decide what runs on its own and what needs a human.",
        },
        {
          icon: Radio,
          title: "Live Ops",
          text: "Watch calls, escalations, and outcomes in one simple view.",
        },
      ]}
    />
  );
}

function Showcase() {
  return (
    <SimplePage
      eyebrow="Showcase"
      title="Meet the assistants."
      text="Focused roles with their own scripts, limits, and tone — ready for your line."
      items={agentPreviews}
    />
  );
}

function Developers() {
  return (
    <SimplePage
      eyebrow="Developers"
      title="Wire it into anything."
      text="Webhooks, an API, and clean events so Wireline fits the systems you already run."
      items={[
        {
          icon: Code2,
          title: "REST API",
          text: "Provision numbers, assistants, and calls programmatically.",
        },
        { icon: Radio, title: "Webhooks", text: "Real-time call, booking, and outcome events." },
        {
          icon: Database,
          title: "Data export",
          text: "Transcripts and structured outcomes, on demand.",
        },
        {
          icon: ShieldCheck,
          title: "Scoped tokens",
          text: "Granular, revocable access for every integration.",
        },
        {
          icon: Mail,
          title: "Inbound email",
          text: "Turn emails into actions your assistants can run.",
        },
        {
          icon: Bot,
          title: "Custom tools",
          text: "Give assistants tools that call your own endpoints.",
        },
      ]}
    />
  );
}

function Compare() {
  return (
    <SimplePage
      eyebrow="Compare"
      title="Why teams switch to Wireline."
      text="One platform for personal and business phone work — without the call-center stack."
      items={[
        {
          icon: UserRound,
          title: "vs. voicemail",
          text: "Every call gets a real answer, not a callback you'll forget.",
        },
        {
          icon: Building2,
          title: "vs. answering services",
          text: "Trained on your business, available instantly, far less per call.",
        },
        {
          icon: Bot,
          title: "vs. generic bots",
          text: "Role-specific assistants with limits and approvals, not a chatbot.",
        },
        {
          icon: ShieldCheck,
          title: "vs. DIY tooling",
          text: "Booking, CRM, SMS, and Live Ops already wired together.",
        },
        {
          icon: CalendarCheck,
          title: "vs. missed bookings",
          text: "Appointments captured the moment a caller is ready.",
        },
        {
          icon: Radio,
          title: "vs. no visibility",
          text: "See every call, outcome, and escalation in one place.",
        },
      ]}
    />
  );
}

function Training() {
  return (
    <SimplePage
      eyebrow="Training"
      title="Coach it like a new hire."
      text="Scripts, FAQs, objections, and review — your assistants get sharper every week."
      items={[
        {
          icon: Database,
          title: "Knowledge base",
          text: "FAQs, policies, and docs the assistant can draw on.",
        },
        {
          icon: MessageSquare,
          title: "Scripts & tone",
          text: "Define how it greets, handles, and closes every call.",
        },
        {
          icon: ShieldCheck,
          title: "Guardrails",
          text: "Hard limits on what it can promise or do.",
        },
        {
          icon: Radio,
          title: "Call review",
          text: "Flag moments and turn them into better behavior.",
        },
        {
          icon: Bot,
          title: "Objection handling",
          text: "Teach responses to the questions that come up most.",
        },
        {
          icon: CalendarCheck,
          title: "Simulator",
          text: "Test changes on realistic calls before going live.",
        },
      ]}
    />
  );
}

function About() {
  return (
    <SimplePage
      eyebrow="About"
      title="Make the phone work for people again."
      text="Wireline is building the AI phone layer for individuals and businesses — so no call goes unanswered."
      items={[
        {
          icon: Sparkles,
          title: "Our mission",
          text: "Give everyone a capable assistant on the other end of the line.",
        },
        {
          icon: ShieldCheck,
          title: "Trust first",
          text: "Scoped tools, approvals, and audit-friendly behavior by design.",
        },
        {
          icon: Building2,
          title: "Built for scale",
          text: "From one personal line to a full business fleet.",
        },
      ]}
    />
  );
}

function Blog() {
  return (
    <SimplePage
      eyebrow="Blog"
      title="Notes from the line."
      text="Product updates and ideas on building a phone that works for you."
      items={[
        { icon: Sparkles, title: "Coming soon", text: "We're getting our first posts ready." },
        {
          icon: Radio,
          title: "Product updates",
          text: "What's new across assistants and Live Ops.",
        },
        { icon: Bot, title: "Playbooks", text: "How teams put their assistants to work." },
      ]}
    />
  );
}

function LegalPage({ kind }: { kind: "terms" | "privacy" | "security" | "contact" }) {
  const copy: Record<typeof kind, [string, string]> = {
    terms: ["Terms", "The terms that govern your use of Wireline."],
    privacy: ["Privacy", "How Wireline handles call data, transcripts, and your information."],
    security: [
      "Security",
      "Wireline is designed around scoped tools, approvals, and audit-friendly behavior.",
    ],
    contact: ["Contact", "Reach Wireline for launch setup, support, or partnership questions."],
  };
  const [title, text] = copy[kind];
  return (
    <Layout>
      <main className="mx-auto w-full max-w-[900px] px-5 py-24 sm:px-8">
        <SectionHeader eyebrow="Trust" title={title} text={text} />
        <div className="mt-10">
          <Button to="/get-started">Get started</Button>
        </div>
      </main>
    </Layout>
  );
}

function PublicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/features" element={<Features />} />
      <Route
        path="/pricing"
        element={
          <Layout>
            <main>
              <Pricing />
              <FinalCTA />
            </main>
          </Layout>
        }
      />
      <Route path="/showcase" element={<Showcase />} />
      <Route path="/developers" element={<Developers />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="/training" element={<Training />} />
      <Route path="/about" element={<About />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/security" element={<LegalPage kind="security" />} />
      <Route path="/contact" element={<LegalPage kind="contact" />} />
    </Routes>
  );
}

export default function PublicMarketingWorkspace() {
  return (
    <BrowserRouter>
      <PublicRoutes />
    </BrowserRouter>
  );
}
