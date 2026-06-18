import type { ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CalendarCheck,
  Check,
  Clock3,
  Code2,
  Database,
  Headphones,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  Phone,
  Plug,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Workflow,
} from "lucide-react";

type Tone = "light" | "dark";
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
    text: "A private AI phone layer for screening, summaries, reminders, and routine calls that should not interrupt your day.",
    items: ["Assistant call screening", "Spam guard", "Call summaries", "Siri and widget triggers"],
  },
  {
    name: "Personal+",
    price: "$19",
    plan: "personal-plus",
    note: "For heavier personal use",
    text: "More handled calls, deeper calendar and email context, and appointment workflows for real personal productivity.",
    items: [
      "Higher monthly usage",
      "Calendar/email context",
      "Appointment workflows",
      "Priority personal memory",
    ],
  },
  {
    name: "Business Starter",
    price: "$99",
    plan: "business-starter",
    note: "For your first business line",
    text: "Launch one serious AI front desk without buying a call-center stack or forcing your team into a complex console.",
    items: [
      "2 business agents",
      "300 voice minutes",
      "2 business numbers",
      "Studio + Training basics",
    ],
    badge: "Best entry",
  },
  {
    name: "Business Growth",
    price: "$249",
    plan: "starter",
    note: "For SMB front desks",
    text: "A complete AI phone team with Studio, Training, Live Ops, analytics, integrations, and model selection.",
    items: ["5 AI agents", "1,000 voice minutes", "Live Ops + analytics", "CRM/calendar routing"],
    featured: true,
    badge: "Most popular",
  },
  {
    name: "Scale",
    price: "$699+",
    plan: "scale",
    note: "For high-volume teams",
    text: "Advanced approvals, webhooks, audit logs, custom routing, and launch support for higher call volume.",
    items: ["10 AI agents", "3,000 voice minutes", "Audit logs", "Launch support"],
  },
];

const workflowSteps = [
  {
    icon: Phone,
    title: "Connect the line",
    text: "Bring one personal number, a business line, or a fleet of numbers into Wireline.",
  },
  {
    icon: Bot,
    title: "Choose the agent",
    text: "Start with a personal assistant, front desk, sales qualifier, intake agent, or support agent.",
  },
  {
    icon: Database,
    title: "Train the behavior",
    text: "Add scripts, policies, FAQs, objections, routing rules, and approval boundaries.",
  },
  {
    icon: Radio,
    title: "Run live ops",
    text: "Review calls, escalations, outcomes, follow-ups, and coaching gaps from one command layer.",
  },
];

const agentPreviews = [
  {
    icon: UserRound,
    title: "Personal Assistant",
    text: "Screens unknown callers, waits on hold, summarizes calls, and keeps routine phone work out of your day.",
    tag: "Personal",
  },
  {
    icon: Building2,
    title: "Front Desk Sarah",
    text: "Answers FAQs, books appointments, routes urgent issues, and sends confirmations after every call.",
    tag: "Business",
  },
  {
    icon: Headphones,
    title: "Support Tyler",
    text: "Handles status checks, triage, refunds, escalation notes, and post-call customer updates.",
    tag: "Support",
  },
  {
    icon: CalendarCheck,
    title: "Sales Liam",
    text: "Qualifies inbound leads, books demos, captures context, and pushes notes into your CRM.",
    tag: "Revenue",
  },
];

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-paper shadow-[0_18px_50px_-18px_rgba(79,30,123,.8)]">
        W
      </span>
      <span
        className={cn(
          "font-display text-[20px] font-semibold tracking-[-0.03em]",
          light ? "text-paper" : "text-ink",
        )}
      >
        Wireline
      </span>
    </span>
  );
}

function Pill({ children, tone = "light" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
        tone === "dark"
          ? "border-white/10 bg-white/5 text-white/65"
          : "border-brand/20 bg-brand/10 text-brand",
      )}
    >
      {children}
    </span>
  );
}

function Button({
  to,
  children,
  variant = "primary",
}: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "dark";
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-[14px] px-5 text-sm font-semibold transition active:scale-[.98]",
        variant === "primary" &&
          "bg-brand text-paper shadow-[0_24px_50px_-22px_rgba(79,30,123,.8)] hover:bg-brand-deep",
        variant === "secondary" && "border border-ink/12 bg-card text-ink hover:border-brand/40",
        variant === "dark" && "border border-white/10 bg-white/5 text-paper hover:bg-white/10",
      )}
    >
      {children}
    </Link>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-ink wl-overhaul-surface">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0f0b14]/90 text-paper backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="Wireline home">
            <Logo light />
          </Link>
          <nav className="hidden items-center gap-1 xl:flex">
            {nav.map((item) => (
              <NavLink
                key={item}
                to={`/${item}`}
                className={({ isActive }) =>
                  cn(
                    "rounded-[12px] px-3 py-2 text-[13px] font-medium capitalize transition",
                    isActive ? "bg-white/10 text-paper" : "text-white/55 hover:text-paper",
                  )
                }
              >
                {item}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Button to="/signin" variant="dark">
              Sign in
            </Button>
            <Button to="/get-started">Get started</Button>
          </div>
          <Link
            to="/get-started"
            className="rounded-[12px] bg-brand px-3 py-2 text-xs font-semibold text-paper lg:hidden"
          >
            Start
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-white/10 bg-[#0f0b14] text-paper">
        <div className="mx-auto grid max-w-[1500px] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-4">
            <Logo light />
            <p className="max-w-sm text-sm leading-6 text-white/55">
              AI voice, SMS, and email agents for every call at home and at work.
            </p>
            <Pill tone="dark">
              <ShieldCheck size={12} /> Guardrails before autonomy
            </Pill>
          </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <FooterCol
              title="Product"
              links={["Features", "Pricing", "Showcase", "Training"]}
              dark
            />
            <FooterCol title="Trust" links={["Security", "Privacy", "Terms", "Contact"]} dark />
            <FooterCol
              title="Developers"
              links={["Developers", "Compare", "Blog", "Contact"]}
              dark
            />
            <FooterCol title="Company" links={["About", "Blog", "Security", "Contact"]} dark />
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({
  title,
  links,
  dark = false,
}: {
  title: string;
  links: string[];
  dark?: boolean;
}) {
  const path = (label: string) => `/${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-3">
      <p
        className={cn(
          "text-[11px] font-bold uppercase tracking-[.16em]",
          dark ? "text-paper" : "text-ink",
        )}
      >
        {title}
      </p>
      {links.map((link) => (
        <Link
          key={link}
          to={path(link)}
          className={cn(
            "block text-sm",
            dark ? "text-white/45 hover:text-paper" : "text-muted-foreground hover:text-ink",
          )}
        >
          {link}
        </Link>
      ))}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  text,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  text: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <p
        className={cn(
          "text-[11px] font-bold uppercase tracking-[.18em]",
          dark ? "text-brand-bright" : "text-brand",
        )}
      >
        {eyebrow}
      </p>
      <h2
        className={cn(
          "mt-3 font-display !normal-case text-4xl font-medium leading-[1.03] tracking-[-.05em] md:text-6xl",
          dark ? "text-paper" : "text-ink",
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "mt-5 max-w-2xl text-[16px] leading-7",
          dark ? "text-white/60" : "text-muted-foreground",
        )}
      >
        {text}
      </p>
    </div>
  );
}

function Card({ item, dark = false }: { item: CardItem; dark?: boolean }) {
  const Icon = item.icon;
  return (
    <div
      className={cn(
        "rounded-[28px] border p-6 shadow-[0_20px_70px_-56px_rgba(26,22,20,.65)]",
        dark ? "border-paper/12 bg-paper/[0.035] text-paper" : "border-border bg-card text-ink",
      )}
    >
      <div
        className={cn(
          "mb-5 grid h-11 w-11 place-items-center rounded-full",
          dark ? "bg-white/8 text-brand-bright" : "bg-brand text-paper",
        )}
      >
        <Icon size={20} />
      </div>
      {item.tag && (
        <p
          className={cn(
            "mb-2 text-[10px] font-bold uppercase tracking-[.16em]",
            dark ? "text-white/35" : "text-muted-foreground",
          )}
        >
          {item.tag}
        </p>
      )}
      <h3 className="font-display !normal-case text-2xl font-medium">{item.title}</h3>
      <p className={cn("mt-2 text-sm leading-6", dark ? "text-white/55" : "text-muted-foreground")}>
        {item.text}
      </p>
    </div>
  );
}

function ProductCanvas() {
  const lanes = [
    ["PERSONAL", "Unknown caller screened", "Pharmacy hold handled", "Summary sent to iPhone"],
    ["BUSINESS", "Sarah booked Friday 11:30", "Lead pushed to CRM", "Refund needs approval"],
    ["TRAINING", "Objection added", "Policy updated", "Simulator passed 92%"],
  ];
  return (
    <div className="relative">
      <div className="absolute inset-7 -z-10 rounded-[52px] bg-brand/30 blur-3xl" />
      <div className="rounded-[34px] border border-white/10 bg-white/[.08] p-3 shadow-[0_50px_140px_-80px_rgba(0,0,0,.9)] backdrop-blur">
        <div className="overflow-hidden rounded-[28px] bg-[#100b14] text-paper">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <Logo light />
            <Pill tone="dark">
              <Radio size={12} /> Live command layer
            </Pill>
          </div>
          <div className="grid gap-px bg-white/10 lg:grid-cols-[1fr_.88fr]">
            <div className="bg-[#100b14] p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["142", "calls today"],
                  ["96%", "quality"],
                  ["$4.8k", "assisted rev"],
                ].map(([v, l]) => (
                  <div
                    key={l}
                    className="rounded-[18px] border border-white/10 bg-white/[.055] p-4"
                  >
                    <p className="font-display text-3xl leading-none">{v}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[.15em] text-white/35">{l}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[.04] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[.18em] text-white/35">
                      Active call
                    </p>
                    <p className="mt-1 font-display !normal-case text-2xl">Front Desk Sarah</p>
                  </div>
                  <span className="rounded-full bg-brand px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em]">
                    Live
                  </span>
                </div>
                <div className="mt-4 space-y-2 text-sm text-white/65">
                  <p>Caller intent: schedule service estimate</p>
                  <p>Confidence: 94% · Human review not required</p>
                  <p>Next action: book Friday 11:30 AM and send SMS confirmation</p>
                </div>
              </div>
            </div>
            <div className="bg-[#17101d] p-5">
              <p className="text-[10px] uppercase tracking-[.18em] text-white/35">
                Operating lanes
              </p>
              <div className="mt-4 space-y-3">
                {lanes.map(([label, ...items]) => (
                  <div
                    key={label}
                    className="rounded-[20px] border border-white/10 bg-white/[.04] p-3"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-bright">
                      {label}
                    </p>
                    <div className="mt-3 space-y-2">
                      {items.map((item) => (
                        <p
                          key={item}
                          className="rounded-[12px] bg-white/[.055] px-3 py-2 text-xs text-white/60"
                        >
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[.055] px-4 py-3 backdrop-blur">
      <p className="font-display text-2xl leading-none text-paper">{value}</p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-[.16em] text-white/35">{label}</p>
    </div>
  );
}

function Landing() {
  return (
    <Layout>
      <main>
        <section className="relative overflow-hidden border-b border-white/10 bg-[#0f0b14] text-paper">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(106,45,163,.35),transparent_30rem),radial-gradient(circle_at_82%_22%,rgba(239,233,220,.12),transparent_26rem)]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          <div className="relative mx-auto grid max-w-[1500px] gap-12 px-5 py-20 sm:px-8 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1fr_.96fr] lg:items-center lg:py-24">
            <div className="flex flex-col justify-center gap-7">
              <Pill tone="dark">
                <Sparkles size={12} /> Personal Assistant + Business Agent Fleet
              </Pill>
              <h1 className="max-w-5xl font-display !normal-case text-5xl font-medium leading-[.97] tracking-[-0.065em] text-paper md:text-7xl xl:text-8xl">
                Your Phone, Finally Working for You.
              </h1>
              <p className="max-w-2xl text-[18px] leading-8 text-white/64">
                Wireline answers, routes, logs, and follows up on calls for individuals and
                businesses — from one personal assistant to a full fleet of trained voice agents.
              </p>
              <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
                <HeroMetric value="1" label="personal assistant" />
                <HeroMetric value="24/7" label="front desk coverage" />
                <HeroMetric value="Fleet" label="trained business agents" />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button to="/get-started">
                  Get started <ArrowRight size={16} />
                </Button>
                <Button to="/showcase" variant="dark">
                  <Phone size={16} /> Preview agents
                </Button>
              </div>
            </div>
            <ProductCanvas />
          </div>
        </section>
        <ProblemSection />
        <SplitSection />
        <AgentShowcase />
        <HowItWorks />
        <FeatureRows />
        <TrainingPreview />
        <ModelSection />
        <Pricing />
        <FinalCTA />
      </main>
    </Layout>
  );
}

function ProblemSection() {
  const items: CardItem[] = [
    {
      icon: Clock3,
      title: "Missed calls become missed revenue.",
      text: "Every voicemail, delayed callback, and after-hours gap is a lost chance to book, help, or follow up.",
      tag: "Leak",
    },
    {
      icon: MessageSquare,
      title: "Follow-up is still manual.",
      text: "The call is only half the job. Wireline turns outcomes into SMS, email, CRM notes, and reminders.",
      tag: "Ops",
    },
    {
      icon: ShieldCheck,
      title: "Autonomy needs boundaries.",
      text: "Sensitive actions require approvals, scoped tools, confidence thresholds, and clear audit trails.",
      tag: "Trust",
    },
  ];
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1500px] px-5 py-20 sm:px-8">
        <SectionHeader
          eyebrow="Why Wireline"
          title="Stop leaking attention and revenue through the phone."
          text="The phone is still where important moments happen. Wireline turns those calls into handled outcomes instead of interruptions, voicemail, and forgotten follow-up."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {items.map((item) => (
            <Card key={item.title} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SplitSection() {
  const lanes = [
    {
      title: "For Personal",
      eyebrow: "One assistant",
      icon: UserRound,
      text: "A private AI layer for your own phone: screen calls, wait on hold, summarize outcomes, and trigger useful actions from mobile surfaces.",
      bullets: [
        "Screen unknown callers",
        "Handle routine errands",
        "Summarize calls",
        "Trigger from Siri/widgets",
      ],
    },
    {
      title: "For Business",
      eyebrow: "Agent fleet",
      icon: Building2,
      text: "A trained phone team for your company: answer, qualify, book, support, escalate, and log outcomes across numbers and workflows.",
      bullets: ["Front desk agents", "Sales qualifiers", "Support triage", "Training + Live Ops"],
    },
  ];
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-20 sm:px-8 lg:grid-cols-2">
        {lanes.map((lane) => {
          const Icon = lane.icon;
          return (
            <div
              key={lane.title}
              className="rounded-[34px] border border-border bg-background p-6 sm:p-8"
            >
              <div className="flex items-center justify-between gap-4">
                <Pill>{lane.eyebrow}</Pill>
                <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-paper">
                  <Icon size={20} />
                </span>
              </div>
              <h2 className="mt-8 font-display !normal-case text-5xl tracking-[-.055em]">
                {lane.title}
              </h2>
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">
                {lane.text}
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {lane.bullets.map((bullet) => (
                  <p
                    key={bullet}
                    className="flex items-center gap-2 rounded-[16px] border border-border bg-card px-4 py-3 text-sm font-semibold"
                  >
                    <Check size={15} className="text-brand" /> {bullet}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AgentShowcase() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1500px] px-5 py-20 sm:px-8">
        <SectionHeader
          eyebrow="Showcase"
          title="Preview the phone team before it touches a caller."
          text="Every agent should feel obvious before launch: what it handles, what it knows, when it escalates, and what it does after the call."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {agentPreviews.map((item) => (
            <Card key={item.title} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto max-w-[1500px] px-5 py-20 sm:px-8">
        <SectionHeader
          eyebrow="How it works"
          title="A clean path from number to trained agent."
          text="Wireline should feel like setup, training, and operations — not a crowded prompt editor."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="rounded-[28px] border border-border bg-background p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">
                    Step {index + 1}
                  </span>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-paper">
                    <Icon size={19} />
                  </span>
                </div>
                <h3 className="mt-6 font-display !normal-case text-2xl">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeatureRows() {
  const items: CardItem[] = [
    {
      icon: Mic,
      title: "Voice agents",
      text: "Natural call handling, summaries, escalation rules, and human handoff.",
    },
    {
      icon: MessageSquare,
      title: "SMS workflows",
      text: "Confirmations, reminders, follow-up links, and post-call summaries.",
    },
    {
      icon: Mail,
      title: "Email follow-up",
      text: "Drafts, approvals, customer replies, and CRM notes.",
    },
    {
      icon: Smartphone,
      title: "Mobile surfaces",
      text: "Siri, widgets, Action Button, Control Center, CarPlay, and Android-ready surfaces.",
    },
    {
      icon: Database,
      title: "Training hub",
      text: "Policies, scripts, scenarios, objections, and simulations outside Studio.",
    },
    {
      icon: Lock,
      title: "Guardrails",
      text: "Approval rules, confidence thresholds, audit logs, and scoped integrations.",
    },
  ];
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1500px] px-5 py-20 sm:px-8">
        <SectionHeader
          eyebrow="Platform"
          title="Personal simplicity. Business-grade control."
          text="The product separates personal setup, business Studio, Training, and Live Ops into clear surfaces so users always know where to start."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.title} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TrainingPreview() {
  return (
    <section className="border-b border-white/10 bg-[#0f0b14] text-paper">
      <div className="mx-auto grid max-w-[1500px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[.86fr_1.14fr] lg:items-center">
        <SectionHeader
          dark
          eyebrow="Studio + Training"
          title="Keep setup simple. Move intelligence into Training."
          text="Agent Studio should create the agent: name, number, role, model, voice, workflow. Training should teach the agent: policies, scenarios, scripts, objections, and simulations."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Studio", "Name, role, voice, number, model, workflow, escalation owner."],
            [
              "Training",
              "Knowledge, scripts, objections, policy rules, simulator, approval boundaries.",
            ],
            [
              "Live Ops",
              "Calls, outcomes, confidence, escalations, notes, coaching opportunities.",
            ],
            ["Integrations", "CRM, calendar, email, SMS, webhooks, and scoped tool permissions."],
          ].map(([title, text]) => (
            <div key={title} className="rounded-[24px] border border-white/10 bg-white/[.045] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-brand-bright">
                {title}
              </p>
              <p className="mt-3 text-sm leading-6 text-white/58">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ModelSection() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto grid max-w-[1500px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[.8fr_1.2fr]">
        <SectionHeader
          eyebrow="Model marketplace"
          title="Pick the model per agent."
          text="Default agents can run on fast, affordable models while high-stakes agents can upgrade to premium reasoning paths with OpenRouter available for routing."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            "Grok 4.3",
            "Gemini Flash",
            "Claude Sonnet",
            "GPT-5.5 Thinking",
            "OpenRouter Auto",
            "Custom provider",
          ].map((p, i) => (
            <div key={p} className="rounded-[22px] border border-border bg-card p-4">
              <p className="text-sm font-semibold">{p}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {i < 2 ? "Efficient default" : i < 4 ? "Premium reasoning" : "Advanced routing"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="bg-card">
      <div className="mx-auto max-w-[1500px] px-5 py-20 sm:px-8">
        <SectionHeader
          eyebrow="Pricing"
          title="Personal, starter business, and scale pricing."
          text="Start low for personal use, launch a real business line at $99, then grow into higher-volume agents as the front desk proves itself."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "flex min-h-[430px] flex-col rounded-[30px] border p-6",
                tier.featured
                  ? "border-brand bg-ink text-paper"
                  : "border-border bg-background text-ink",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{tier.name}</p>
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      tier.featured ? "text-white/55" : "text-muted-foreground",
                    )}
                  >
                    {tier.note}
                  </p>
                </div>
                {tier.badge && <Pill tone={tier.featured ? "dark" : "light"}>{tier.badge}</Pill>}
              </div>
              <div className="mt-6 flex items-end gap-1">
                <span className="font-display text-5xl leading-none">{tier.price}</span>
                <span
                  className={cn(
                    "pb-1 text-sm",
                    tier.featured ? "text-white/50" : "text-muted-foreground",
                  )}
                >
                  /mo
                </span>
              </div>
              <p
                className={cn(
                  "mt-4 text-sm leading-6",
                  tier.featured ? "text-white/60" : "text-muted-foreground",
                )}
              >
                {tier.text}
              </p>
              <div className="mt-6 flex-1 space-y-3 text-sm">
                {tier.items.map((item) => (
                  <p key={item} className="flex items-start gap-2">
                    <Check
                      size={15}
                      className={cn(
                        "mt-0.5 shrink-0",
                        tier.featured ? "text-brand-bright" : "text-brand",
                      )}
                    />
                    {item}
                  </p>
                ))}
              </div>
              <Button
                to={`/get-started?plan=${tier.plan}`}
                variant={tier.featured ? "dark" : "secondary"}
              >
                Start with {tier.name}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="bg-[#0f0b14] text-paper">
      <div className="mx-auto max-w-[1500px] px-5 py-20 sm:px-8">
        <div className="relative overflow-hidden rounded-[40px] border border-white/10 bg-white/[.045] p-8 sm:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_10%,rgba(106,45,163,.38),transparent_26rem)]" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <Pill tone="dark">Put your phone to work</Pill>
              <h2 className="mt-5 max-w-4xl font-display !normal-case text-5xl tracking-[-.055em] md:text-7xl">
                Launch the AI phone layer for life and business.
              </h2>
              <p className="mt-5 max-w-2xl text-[16px] leading-7 text-white/60">
                Start with one assistant, then expand into a trained business fleet with clear
                boundaries, live operations, and real follow-up.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button to="/get-started">
                Get started <ArrowRight size={16} />
              </Button>
              <Button to="/showcase" variant="dark">
                Preview agents
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <Page
      eyebrow="Features"
      title="A complete operating layer for calls."
      text="Each surface has one job: Personal for one user, Studio for setup, Training for knowledge, Live Ops for monitoring, and integrations for real work."
      items={[
        {
          icon: Phone,
          title: "Inbound voice",
          text: "Handle routine calls, extract intent, summarize outcomes, and transfer when needed.",
          tag: "Calls",
        },
        {
          icon: Workflow,
          title: "Workflow permissions",
          text: "Enable booking, SMS follow-up, CRM notes, refunds, routing, and approval thresholds.",
          tag: "Studio",
        },
        {
          icon: Database,
          title: "Training console",
          text: "Keep scripts, policies, FAQs, and simulations out of basic setup.",
          tag: "Training",
        },
        {
          icon: BarChart3,
          title: "Quality pulse",
          text: "See coaching opportunities, containment, escalation, and agent-specific performance.",
          tag: "Ops",
        },
        {
          icon: Smartphone,
          title: "Personal automations",
          text: "Assistant can call, screen, wait on hold, summarize, and trigger from Siri/widgets.",
          tag: "Personal",
        },
        {
          icon: ShieldCheck,
          title: "Human-safe defaults",
          text: "Sensitive commitments require confirmation and scoped integration access.",
          tag: "Trust",
        },
      ]}
    />
  );
}
function Showcase() {
  return (
    <Page
      eyebrow="Showcase"
      title="Preview the agent fleet before launch."
      text="Wireline should feel like a command center, not a phone tree."
      items={[
        {
          icon: Bot,
          title: "Front Desk Sarah",
          text: "Books appointments, answers FAQs, transfers urgent calls, and summarizes every call.",
        },
        {
          icon: Headphones,
          title: "Sales Liam",
          text: "Qualifies inbound leads, books demos, collects context, and logs notes.",
        },
        {
          icon: Phone,
          title: "Personal Assistant",
          text: "Calls pharmacies, waits on hold, screens unknown callers, and updates you after.",
        },
      ]}
    />
  );
}
function Developers() {
  return (
    <Page
      eyebrow="Developers"
      title="API-first where it matters."
      text="Connect identity, calendars, phones, CRM, billing, and custom workflows without exposing personal context to business agents."
      items={[
        {
          icon: Plug,
          title: "OAuth connectors",
          text: "Google, Microsoft, and Yahoo flows remain scoped by personal vs business workspace.",
        },
        {
          icon: Code2,
          title: "Webhook API",
          text: "Push call outcomes, escalation events, and status updates into downstream tools.",
        },
        {
          icon: Lock,
          title: "Audit-safe actions",
          text: "Every tool action knows its actor, scope, confidence, and approval state.",
        },
      ]}
    />
  );
}
function Compare() {
  return (
    <Page
      eyebrow="Compare"
      title="A live AI operating layer, not legacy call-center sprawl."
      text="Premium control for the owner, obvious setup for the operator, and safe outcomes for the caller."
      items={[
        {
          icon: Radio,
          title: "Not a phone tree",
          text: "Wireline routes real conversations and escalates based on confidence.",
        },
        {
          icon: Database,
          title: "Not a script dump",
          text: "Training separates knowledge from setup and adds simulation before production calls.",
        },
        {
          icon: Sparkles,
          title: "Not one assistant for everything",
          text: "Personal and business stay scoped, with different integrations and approvals.",
        },
      ]}
    />
  );
}
function Training() {
  return (
    <Page
      eyebrow="Training"
      title="Teach agents before they touch real customers."
      text="Studio stays simple because Training owns scripts, scenarios, docs, simulations, and policy guardrails."
      items={[
        {
          icon: Database,
          title: "Knowledge",
          text: "Policies, pricing, hours, FAQs, documents, and allowed claims.",
        },
        {
          icon: Mic,
          title: "Voice behavior",
          text: "Tone, pronunciation, brevity, escalation language, and banned phrases.",
        },
        {
          icon: Headphones,
          title: "Simulator",
          text: "Run difficult scenarios before real customers experience the agent.",
        },
        {
          icon: Workflow,
          title: "Approvals",
          text: "Refunds, discounts, cancellations, and bookings can require human confirmation.",
        },
      ]}
    />
  );
}
function About() {
  return (
    <Page
      eyebrow="About"
      title="Wireline makes phones useful again."
      text="A single AI-native line for life and work, with strong boundaries between personal context and business operations."
      items={[
        {
          icon: Phone,
          title: "Phones should work for people",
          text: "Personal users need less interruption. Businesses need reliable frontline coverage.",
        },
        {
          icon: ShieldCheck,
          title: "Trust over flash",
          text: "The product should never pretend an action is completed without the right tool and audit trail.",
        },
        {
          icon: Sparkles,
          title: "AI-native, operator-ready",
          text: "The interface should feel premium, calm, and obvious.",
        },
      ]}
    />
  );
}
function Blog() {
  return (
    <Page
      eyebrow="Blog"
      title="Wireline build notes."
      text="Product direction, operational strategy, and practical AI phone workflows."
      items={[
        {
          icon: Sparkles,
          title: "Launch notes",
          text: "How Personal/Business split, Studio, Training, and Live Ops evolved.",
        },
        {
          icon: Workflow,
          title: "Operator playbooks",
          text: "What every SMB should train before letting an AI answer calls.",
        },
        {
          icon: BarChart3,
          title: "Model routing",
          text: "Efficient defaults vs premium reasoning.",
        },
      ]}
    />
  );
}

function LegalPage({ kind }: { kind: "terms" | "privacy" | "security" | "contact" }) {
  const copy = {
    terms: ["Terms", "Clear commercial terms for personal and business workspaces."],
    privacy: ["Privacy", "Personal context and business workspace data stay separated by design."],
    security: [
      "Security",
      "Wireline is designed around scoped tools, approvals, and audit-friendly behavior.",
    ],
    contact: ["Contact", "Reach Wireline for launch setup, support, or partnership questions."],
  }[kind];
  return (
    <Layout>
      <main className="mx-auto max-w-[1100px] px-5 py-20 sm:px-8">
        <SectionHeader eyebrow="Trust" title={copy[0]} text={copy[1]} />
        <div className="mt-10">
          <Button to="/get-started">Get started</Button>
        </div>
      </main>
    </Layout>
  );
}

function Page({
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
      <main className="mx-auto max-w-[1500px] px-5 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[.75fr_1fr] lg:items-end">
          <SectionHeader eyebrow={eyebrow} title={title} text={text} />
          <ProductCanvas />
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.title} item={item} />
          ))}
        </div>
        <div className="mt-12 rounded-[34px] border border-border bg-card p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
            <div>
              <h2 className="font-display !normal-case text-3xl">
                Ready to wire this into your workflow?
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Start personal, launch Business Starter, or connect the agent fleet to real phone,
                calendar, inbox, and CRM systems.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button to="/get-started">Get started</Button>
              <Button to="/pricing" variant="secondary">
                View pricing
              </Button>
            </div>
          </div>
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
