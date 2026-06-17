import React, { useMemo, useState } from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Building2,
  Calendar,
  Car,
  Check,
  ChevronRight,
  Copy,
  Database,
  FileText,
  Headphones,
  Home,
  LayoutGrid,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  Phone,
  PhoneCall,
  Plug,
  Plus,
  Radio,
  ShieldCheck,
  Sliders,
  Sparkles,
  Smartphone,
  Users,
  Watch,
  Workflow,
  Zap,
} from "lucide-react";

type Agent = {
  name: string;
  role: string;
  model: string;
  voice: string;
  status: "Live" | "Training" | "Paused";
  calls: number;
  csat: number;
};

const agents: Agent[] = [
  { name: "Sarah", role: "Front desk + appointments", model: "Grok 4.3", voice: "Warm female", status: "Live", calls: 142, csat: 96 },
  { name: "Liam", role: "Inbound sales + demos", model: "Gemini 2.5 Flash", voice: "Confident male", status: "Live", calls: 88, csat: 94 },
  { name: "Tyler", role: "Technical triage", model: "Claude Sonnet", voice: "Calm neutral", status: "Training", calls: 34, csat: 91 },
];

const nav = [
  { to: "/personal-home", label: "Personal", icon: Home },
  { to: "/business", label: "Live Ops", icon: Radio },
  { to: "/agents", label: "Studio", icon: Sliders },
  { to: "/training", label: "Training", icon: FileText },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const marketing = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/showcase", label: "Showcase" },
  { to: "/developers", label: "Developers" },
  { to: "/about", label: "About" },
];

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-7 w-7 place-items-center rounded-[10px] bg-[#7c3aed] shadow-[0_18px_50px_-18px_rgba(124,58,237,.8)]">
        <svg viewBox="0 0 36 36" className="h-5 w-5" aria-hidden="true">
          <path d="M8 10l4.5 16L18 14l5.5 12L28 10" fill="none" stroke="#f5efe6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={cx("font-display text-[19px] font-semibold tracking-[-0.03em]", light ? "text-[#f5efe6]" : "text-[#1c1209]")}>Wireline</span>
    </span>
  );
}

function Pill({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={cx("inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]", dark ? "border-white/10 bg-white/5 text-white/65" : "border-[#1c1209]/10 bg-[#ede5d7] text-[#7b6a50]")}>{children}</span>
  );
}

function ButtonLink({ to, children, variant = "primary" }: { to: string; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Link
      to={to}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-[14px] px-5 text-sm font-semibold transition-all active:scale-[.98]",
        variant === "primary" && "bg-[#7c3aed] text-[#f5efe6] shadow-[0_24px_50px_-22px_rgba(124,58,237,.8)] hover:bg-[#5b21b6]",
        variant === "secondary" && "border border-[#1c1209]/12 bg-[#f9f3ea] text-[#1c1209] hover:border-[#7c3aed]/40",
        variant === "ghost" && "text-[#7b6a50] hover:bg-[#1c1209]/5 hover:text-[#1c1209]",
      )}
    >
      {children}
    </Link>
  );
}

function MarketingFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-[#f5efe6] text-[#1c1209]">
      <header className="sticky top-0 z-50 border-b border-[#1c1209]/10 bg-[#f5efe6]/86 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="Wireline home"><Logo /></Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {marketing.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => cx("rounded-[12px] px-3 py-2 text-[13px] font-medium transition-colors", isActive ? "bg-[#1c1209]/5 text-[#1c1209]" : "text-[#7b6a50] hover:text-[#1c1209]")}>{item.label}</NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <ButtonLink to="/signin" variant="ghost">Sign in</ButtonLink>
            <ButtonLink to="/get-started">Get started</ButtonLink>
          </div>
          <Link to="/get-started" className="lg:hidden rounded-[12px] bg-[#7c3aed] px-3 py-2 text-xs font-semibold text-[#f5efe6]">Start</Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-[#1c1209]/10 bg-[#ede5d7]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-4">
            <Logo />
            <p className="max-w-sm text-sm leading-6 text-[#7b6a50]">AI voice, SMS, and email agents for every conversation at home and at work.</p>
            <Pill><ShieldCheck size={12} /> SOC 2 ready posture</Pill>
          </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {["Product", "Solutions", "Developers", "Company"].map((col) => <div key={col} className="space-y-3"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#1c1209]">{col}</p>{["Features", "Pricing", "Security", "Contact"].map((x) => <p key={x} className="text-sm text-[#7b6a50]">{x}</p>)}</div>)}
          </div>
        </div>
      </footer>
    </div>
  );
}

function HeroPhone({ mode }: { mode: "personal" | "business" }) {
  const personal = mode === "personal";
  return (
    <div className="relative mx-auto w-full max-w-[500px]">
      <div className="absolute inset-6 -z-10 rounded-[40px] bg-[#7c3aed]/12 blur-3xl" aria-hidden="true" />
      <div className="rounded-[32px] border border-[#1c1209]/10 bg-[#ede5d7] p-3 shadow-[0_40px_120px_-70px_rgba(28,18,9,.65)]">
        <div className="rounded-[26px] border border-[#1c1209]/10 bg-[#f9f3ea] p-5">
          <div className="flex items-center justify-between">
            <Logo />
            <Pill>{personal ? "Personal line" : "Live floor"}</Pill>
          </div>
          <div className="mt-8 rounded-[24px] bg-[#1c1209] p-5 text-[#f5efe6]">
            <div className="flex items-center justify-between text-xs text-white/50"><span>Live conversation</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 animate-pulse rounded-full bg-[#a78bfa]" /> 00:48</span></div>
            <div className="mt-6 flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-[#7c3aed]"><PhoneCall size={22} /></div>
              <div><p className="font-display text-2xl font-medium">{personal ? "Aria" : "Sarah"}</p><p className="text-sm text-white/55">{personal ? "Calling Dr. Allen's office" : "Resolving customer refund"}</p></div>
            </div>
            <div className="mt-6 space-y-2">
              {[personal ? "Rescheduled appointment to Thursday 2pm" : "Verified customer and order", personal ? "Sent confirmation text" : "Issued refund under policy", personal ? "Added reminder to widget" : "Logged outcome to CRM"].map((item) => <div key={item} className="flex items-center gap-2 rounded-[14px] bg-white/[.06] px-3 py-2 text-sm"><Check size={15} className="text-[#a78bfa]" />{item}</div>)}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[(personal ? "41" : "142"), (personal ? "spam blocked" : "calls today"), (personal ? "CarPlay" : "96% CSAT")].map((x, i) => <div key={x} className="rounded-[18px] bg-[#ede5d7] px-3 py-3"><p className={cx("font-display text-xl", i === 0 ? "text-[#7c3aed]" : "text-[#1c1209]")}>{x}</p></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  const [mode, setMode] = useState<"personal" | "business">("personal");
  return (
    <MarketingFrame>
      <main>
        <section className="relative overflow-x-clip border-b border-[#1c1209]/10">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:py-28">
            <div className="flex flex-col justify-center gap-7">
              <Pill><Sparkles size={12} /> Hundreds of models · no lock-in</Pill>
              <h1 className="font-display max-w-3xl text-5xl font-medium leading-[1.02] tracking-[-0.055em] text-[#1c1209] md:text-7xl">Your phone, finally <span className="italic text-[#7c3aed]">working for you.</span></h1>
              <p className="max-w-xl text-[16px] leading-7 text-[#7b6a50]">Wireline handles personal calls so you never miss what matters, and runs a fleet of AI agents that answer your business floor around the clock. Human-fast. Never off-script.</p>
              <div className="flex w-fit rounded-full border border-[#1c1209]/10 bg-[#ede5d7] p-1">
                {(["personal", "business"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cx("rounded-full px-4 py-2 text-xs font-bold capitalize transition", mode === m ? "bg-[#7c3aed] text-[#f5efe6]" : "text-[#7b6a50]")}>{m}</button>)}
              </div>
              <div className="flex flex-wrap gap-3"><ButtonLink to="/get-started">Get started free <ArrowRight size={16} /></ButtonLink><ButtonLink to="/showcase" variant="secondary"><Phone size={16} /> Hear a live demo</ButtonLink></div>
              <div className="grid max-w-xl grid-cols-3 overflow-hidden rounded-[20px] border border-[#1c1209]/10 bg-[#1c1209]/10">
                {[(mode === "personal" ? "40s" : "142"), (mode === "personal" ? "Thu 2pm" : "$189"), (mode === "personal" ? "41" : "4 demos")].map((k, i) => <div key={k} className="bg-[#f5efe6] p-4"><p className="font-display text-2xl font-medium text-[#7c3aed]">{k}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#7b6a50]">{i === 0 ? "handled" : i === 1 ? "confirmed" : "won"}</p></div>)}
              </div>
            </div>
            <HeroPhone mode={mode} />
          </div>
        </section>
        <FeatureBand />
        <ModelBand />
        <PricingPreview />
      </main>
    </MarketingFrame>
  );
}

function FeatureBand() {
  const items = [
    [Mic, "Voice agents", "Natural turn-taking, branded voices, and escalation rules."],
    [Mail, "Email follow-up", "Drafts, approvals, customer replies, and CRM notes."],
    [MessageSquare, "SMS workflows", "Two-way confirmations, reminders, and post-call summaries."],
    [Smartphone, "iOS + Android", "Widgets, Siri shortcuts, CarPlay, and glanceable control."],
    [Database, "Training hub", "Policies, scripts, prices, objections, and scenario tests."],
    [Lock, "Guardrails", "Never claims an action without an enabled tool and audit trail."],
  ] as const;
  return <section className="border-b border-[#1c1209]/10 bg-[#ede5d7]"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionHeader eyebrow="Platform" title="Personal simplicity. Business-grade control." text="The Figma overhaul separates personal and business paths while keeping one premium Wireline system." /><div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map(([Icon, t, d]) => <Card key={t}><div className="mb-5 grid h-11 w-11 place-items-center rounded-full bg-[#7c3aed] text-[#f5efe6]"><Icon size={20} /></div><h3 className="font-display text-xl font-medium text-[#1c1209]">{t}</h3><p className="mt-2 text-sm leading-6 text-[#7b6a50]">{d}</p></Card>)}</div></div></section>;
}

function ModelBand() {
  const providers = ["OpenRouter", "Anthropic", "OpenAI", "Google Gemini", "xAI Grok", "Meta Llama"];
  return <section className="border-b border-[#1c1209]/10 bg-[#1c1209] text-[#f5efe6]"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><SectionHeader dark eyebrow="Model marketplace" title="Pick the model per agent." text="Default to fast, affordable Grok/Gemini paths, upgrade critical agents to premium models, and keep Anthropic/OpenAI available where they matter." /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{providers.map((p, i) => <div key={p} className="rounded-[22px] border border-white/10 bg-white/[.045] p-4"><p className="text-sm font-semibold">{p}</p><p className="mt-2 text-xs text-white/45">{i === 0 ? "300+ models" : i === 1 ? "Opus/Sonnet" : "Selectable routing"}</p></div>)}</div></div></div></section>;
}

function PricingPreview() {
  return <section className="bg-[#f5efe6]"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionHeader eyebrow="Pricing" title="No hard agent limits. Add capacity when it pays for itself." text="Personal starts low. Business scales by minutes, integrations, and advanced controls." /><div className="mt-10 grid gap-4 lg:grid-cols-4">{[["Personal", "$9", "Siri, widgets, call screening"], ["Personal+", "$19", "More minutes and errands"], ["Business Growth", "$249", "Fleet, live ops, studio"], ["Scale", "$699", "High-volume operations"]].map(([n, p, d], i) => <Card key={n} className={i === 2 ? "bg-[#1c1209] text-[#f5efe6]" : ""}><p className="text-sm font-semibold">{n}</p><p className="mt-4 font-display text-4xl font-medium">{p}</p><p className={cx("mt-2 text-sm", i === 2 ? "text-white/55" : "text-[#7b6a50]")}>{d}</p><div className="mt-6 space-y-2 text-sm"><p className="flex items-center gap-2"><Check size={15} className="text-[#a78bfa]" /> Voice + SMS + email</p><p className="flex items-center gap-2"><Check size={15} className="text-[#a78bfa]" /> Choose model stack</p></div></Card>)}</div></div></section>;
}

function SectionHeader({ eyebrow, title, text, dark = false }: { eyebrow: string; title: string; text: string; dark?: boolean }) {
  return <div className="max-w-2xl"><p className={cx("text-[11px] font-bold uppercase tracking-[.18em]", dark ? "text-[#a78bfa]" : "text-[#7c3aed]")}>{eyebrow}</p><h2 className={cx("mt-3 font-display text-4xl font-medium leading-[1.05] tracking-[-.04em] md:text-5xl", dark ? "text-[#f5efe6]" : "text-[#1c1209]")}>{title}</h2><p className={cx("mt-4 text-[15px] leading-7", dark ? "text-white/60" : "text-[#7b6a50]")}>{text}</p></div>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-[28px] border border-[#1c1209]/10 bg-[#f9f3ea] p-6 shadow-[0_20px_70px_-56px_rgba(28,18,9,.65)]", className)}>{children}</div>;
}

function ConsoleShell({ initial = "ops" }: { initial?: "ops" | "studio" | "training" | "personal" | "integrations" | "analytics" }) {
  const [tab, setTab] = useState(initial);
  const active = initial === "personal" ? "personal" : tab;
  return (
    <div className="flex h-dvh overflow-hidden bg-[#120b1b] text-[#f5efe6]">
      <aside className="hidden w-[268px] shrink-0 border-r border-white/10 bg-[#160f24] p-4 lg:flex lg:flex-col">
        <Link to="/" className="mb-8"><Logo light /></Link>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const on = (item.to.includes("personal") && active === "personal") || (item.to.includes("business") && active === "ops") || (item.to.includes("agents") && active === "studio") || (item.to.includes("training") && active === "training") || (item.to.includes("integrations") && active === "integrations") || (item.to.includes("analytics") && active === "analytics");
            return <button key={item.to} onClick={() => setTab(item.to.includes("personal") ? "personal" : item.to.includes("agents") ? "studio" : item.to.includes("training") ? "training" : item.to.includes("integrations") ? "integrations" : item.to.includes("analytics") ? "analytics" : "ops")} className={cx("flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left text-sm transition", on ? "bg-white/10 text-white" : "text-white/48 hover:bg-white/[.06] hover:text-white/80")}><Icon size={17} />{item.label}</button>;
          })}
        </nav>
        <div className="mt-auto rounded-[22px] border border-white/10 bg-white/[.045] p-4"><Pill dark><Sparkles size={12} /> Assistant</Pill><p className="mt-3 text-sm text-white/58">Ask Wireline to simplify setup, add workflows, or audit agent training.</p></div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:px-6">
          <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#a78bfa]">{active === "personal" ? "Personal" : "Business"}</p><h1 className="font-display text-xl font-medium">{active === "studio" ? "Agent Studio" : active === "training" ? "Training" : active === "integrations" ? "Integrations" : active === "analytics" ? "Analytics" : active === "personal" ? "Personal Wireline" : "Live Ops"}</h1></div>
          <div className="flex items-center gap-2"><span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55 sm:inline-flex">trywireline.com</span><Bell size={18} className="text-white/55" /></div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip p-4 sm:p-6 lg:p-8">
          {active === "personal" ? <PersonalConsole /> : active === "studio" ? <Studio /> : active === "training" ? <TrainingConsole /> : active === "integrations" ? <Integrations /> : active === "analytics" ? <Analytics /> : <Ops />}
        </div>
      </main>
    </div>
  );
}

function Ops() {
  return <div className="grid gap-5 xl:grid-cols-[1fr_380px]"><div className="space-y-5"><div className="grid gap-4 md:grid-cols-4">{[["Live calls", "18"], ["Handled today", "142"], ["CSAT", "96%"], ["Avg latency", "248ms"]].map(([k, v]) => <DarkCard key={k}><p className="text-xs text-white/40">{k}</p><p className="mt-2 font-display text-3xl font-medium">{v}</p></DarkCard>)}</div><DarkCard><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-medium">Live floor</h2><Pill dark><Radio size={12} /> active</Pill></div><div className="mt-5 space-y-3">{["Refund request — Sarah", "Demo request — Liam", "Webhook timeout — Tyler", "Appointment change — Sarah"].map((x, i) => <div key={x} className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[.04] p-4"><div className="flex items-center gap-3"><span className={cx("h-2.5 w-2.5 rounded-full", i === 2 ? "bg-red-400" : "bg-[#a78bfa]")} /><div><p className="text-sm font-semibold">{x}</p><p className="text-xs text-white/42">+1 (312) 555-01{i}7 · {i + 1}:4{i}</p></div></div><ChevronRight size={18} className="text-white/35" /></div>)}</div></DarkCard></div><AssistantPanel /></div>;
}

function Studio() {
  const [agent, setAgent] = useState(agents[0]);
  return <div className="grid gap-5 xl:grid-cols-[320px_1fr_360px]"><DarkCard><h2 className="font-display text-2xl font-medium">Agent Fleet</h2><div className="mt-5 space-y-3">{agents.map((a) => <button key={a.name} onClick={() => setAgent(a)} className={cx("w-full rounded-[20px] border p-4 text-left transition", a.name === agent.name ? "border-[#a78bfa] bg-[#7c3aed]/20" : "border-white/10 bg-white/[.035]")}><div className="flex items-center justify-between"><p className="font-semibold">{a.name}</p><span className="text-xs text-[#a78bfa]">{a.status}</span></div><p className="mt-1 text-xs text-white/48">{a.role}</p></button>)}</div><button className="mt-4 flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#7c3aed] py-3 text-sm font-semibold"><Plus size={16} /> New agent</button></DarkCard><DarkCard><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.16em] text-[#a78bfa]">Basic setup</p><h2 className="mt-1 font-display text-3xl font-medium">{agent.name}</h2></div><Pill dark>{agent.model}</Pill></div><div className="mt-8 grid gap-4 md:grid-cols-2"><StudioField label="Agent name" value={agent.name} /><StudioField label="Voice" value={agent.voice} /><StudioField label="Model" value={agent.model} /><StudioField label="Status" value={agent.status} /></div><div className="mt-6 rounded-[22px] border border-white/10 bg-white/[.04] p-5"><p className="text-sm font-semibold">Workflow</p><div className="mt-4 grid gap-3">{["Greet and identify caller intent", "Look up contact or order", "Resolve with approved tool", "Escalate if confidence drops"].map((x) => <div key={x} className="flex items-center gap-3 rounded-[16px] bg-black/16 p-3 text-sm"><Check size={15} className="text-[#a78bfa]" />{x}</div>)}</div></div></DarkCard><AssistantPanel /></div>;
}

function StudioField({ label, value }: { label: string; value: string }) { return <label className="block"><span className="text-[11px] font-bold uppercase tracking-[.16em] text-white/38">{label}</span><div className="mt-2 rounded-[16px] border border-white/10 bg-[#100918] px-4 py-3 text-sm text-white/80">{value}</div></label>; }
function TrainingConsole() { return <div className="grid gap-5 lg:grid-cols-3"><DarkCard><FileText className="text-[#a78bfa]" /><h2 className="mt-4 font-display text-2xl font-medium">Knowledge</h2><p className="mt-2 text-sm text-white/50">Upload FAQs, services, prices, policies, and business context.</p></DarkCard><DarkCard><Workflow className="text-[#a78bfa]" /><h2 className="mt-4 font-display text-2xl font-medium">Workflows</h2><p className="mt-2 text-sm text-white/50">Define call steps, handoffs, qualification, and escalation paths.</p></DarkCard><DarkCard><Bot className="text-[#a78bfa]" /><h2 className="mt-4 font-display text-2xl font-medium">Simulator</h2><p className="mt-2 text-sm text-white/50">Test hard scenarios before customers reach the agent.</p></DarkCard></div>; }
function Integrations() { return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{["Google Calendar", "HubSpot", "Salesforce", "Slack", "Stripe", "Twilio", "Outlook", "Zendesk"].map((x) => <DarkCard key={x}><Plug className="text-[#a78bfa]" /><h2 className="mt-4 font-display text-xl font-medium">{x}</h2><p className="mt-2 text-sm text-white/45">Ready to connect</p></DarkCard>)}</div>; }
function Analytics() { return <div className="space-y-5"><div className="grid gap-4 md:grid-cols-3">{[["Revenue influenced", "$18.4k"], ["Resolution rate", "87%"], ["COGS / minute", "$0.041"]].map(([a,b]) => <DarkCard key={a}><p className="text-xs text-white/42">{a}</p><p className="mt-2 font-display text-3xl font-medium">{b}</p></DarkCard>)}</div><DarkCard><div className="h-72 rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(124,58,237,.28),rgba(124,58,237,.02))]" /></DarkCard></div>; }
function PersonalConsole() { return <div className="grid gap-5 xl:grid-cols-[1fr_370px]"><div className="space-y-5"><DarkCard><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.16em] text-[#a78bfa]">Personal line</p><h2 className="mt-1 font-display text-3xl font-medium">Aria handled it.</h2></div><Pill dark>Live</Pill></div><div className="mt-6 grid gap-3 md:grid-cols-3">{[["Spam blocked", "41"], ["Calls handled", "18"], ["Next action", "Thu 2pm"]].map(([a,b]) => <div key={a} className="rounded-[20px] bg-white/[.04] p-4"><p className="text-xs text-white/40">{a}</p><p className="mt-2 font-display text-2xl font-medium">{b}</p></div>)}</div></DarkCard><DarkCard><h2 className="font-display text-2xl font-medium">Intent rules</h2><div className="mt-5 space-y-3">{["Unknown caller during work hours → screen + summarize", "Family calls twice → ring through", "Delivery driver → provide gate code", "Appointment office → confirm or reschedule"].map((x) => <div key={x} className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-white/[.035] p-4"><Check size={16} className="text-[#a78bfa]" /><span className="text-sm text-white/75">{x}</span></div>)}</div></DarkCard></div><AssistantPanel /></div>; }

function AssistantPanel() {
  const prompts = ["Simplify my Studio setup", "Add a refund workflow", "Train Sarah on pricing", "Audit today's calls"];
  return <DarkCard className="h-fit"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#7c3aed]"><Sparkles size={18} /></div><div><h2 className="font-display text-xl font-medium">Wireline Assistant</h2><p className="text-xs text-white/42">Planning and setup copilot</p></div></div><div className="mt-5 rounded-[18px] bg-white/[.045] p-4 text-sm leading-6 text-white/62">Tell me what you want your agent to do. I’ll build the workflow, training checklist, and guardrails.</div><div className="mt-4 flex flex-wrap gap-2">{prompts.map((p) => <button key={p} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55 hover:border-[#a78bfa]/60 hover:text-white">{p}</button>)}</div><div className="mt-5 flex gap-2 rounded-[18px] border border-white/10 bg-[#100918] p-2"><input className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-white/32" placeholder="Ask Wireline..." /><button className="grid h-9 w-9 place-items-center rounded-[13px] bg-[#7c3aed]"><ArrowRight size={16} /></button></div></DarkCard>;
}
function DarkCard({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={cx("rounded-[28px] border border-white/10 bg-white/[.055] p-5 shadow-[0_35px_90px_-60px_rgba(0,0,0,.85)]", className)}>{children}</section>; }

function AuthScreen({ start = false }: { start?: boolean }) { return <div className="grid min-h-dvh bg-[#f5efe6] lg:grid-cols-2"><div className="hidden flex-col justify-between bg-[#1c1209] p-12 text-[#f5efe6] lg:flex"><Link to="/"><Logo light /></Link><div><Pill dark>{start ? "Step 1 of 2" : "Welcome back"}</Pill><h1 className="mt-5 max-w-md font-display text-5xl font-medium leading-[1.04] tracking-[-.045em]">{start ? "Choose personal or business and launch." : "Return to your Wireline workspace."}</h1><p className="mt-5 max-w-sm text-sm leading-6 text-white/55">The overhaul keeps setup simple: choose a path, name the agent, connect tools, and let training live on its own page.</p></div><p className="text-xs uppercase tracking-[.18em] text-white/35">SOC 2 · AES-256 · trywireline.com</p></div><div className="flex items-center justify-center px-5 py-12"><div className="w-full max-w-sm"><div className="mb-8 lg:hidden"><Logo /></div><h2 className="font-display text-3xl font-medium tracking-[-.035em] text-[#1c1209]">{start ? "Get started" : "Sign in"}</h2><p className="mt-2 text-sm text-[#7b6a50]">{start ? "Pick the workspace after account creation." : "Use your Wireline account."}</p><div className="mt-6 grid grid-cols-2 gap-3"><button className="rounded-[18px] border border-[#1c1209]/10 bg-[#f9f3ea] p-4 text-left"><UserIcon /><p className="mt-3 font-semibold">Personal</p></button><button className="rounded-[18px] border border-[#7c3aed]/40 bg-[#ede5d7] p-4 text-left"><Building2 size={18} className="text-[#7c3aed]" /><p className="mt-3 font-semibold">Business</p></button></div><div className="mt-5 space-y-3"><input className="h-12 w-full rounded-[16px] border border-[#1c1209]/10 bg-[#ede5d7] px-4 outline-none" placeholder="Email" /><input className="h-12 w-full rounded-[16px] border border-[#1c1209]/10 bg-[#ede5d7] px-4 outline-none" placeholder="Password" type="password" /><Link to="/personal-home" className="flex h-12 items-center justify-center gap-2 rounded-[16px] bg-[#7c3aed] text-sm font-semibold text-[#f5efe6]">Continue <ArrowRight size={16} /></Link></div></div></div></div>; }
function UserIcon() { return <Users size={18} className="text-[#7c3aed]" />; }

function SimplePage({ title, text, icon: Icon }: { title: string; text: string; icon: React.ComponentType<{ size?: number; className?: string }> }) { return <MarketingFrame><section className="mx-auto max-w-7xl px-5 py-24 sm:px-8"><Pill><Icon size={12} /> Wireline</Pill><h1 className="mt-6 max-w-3xl font-display text-5xl font-medium leading-[1.03] tracking-[-.05em] md:text-7xl">{title}</h1><p className="mt-6 max-w-2xl text-[16px] leading-7 text-[#7b6a50]">{text}</p><div className="mt-10 grid gap-4 md:grid-cols-3">{["Premium desktop layouts", "Simple user flows", "Integrated agent training"].map((x) => <Card key={x}><Check className="text-[#7c3aed]" /><p className="mt-4 font-display text-xl font-medium">{x}</p></Card>)}</div></section></MarketingFrame>; }

export default function FigmaOverhaul() {
  const initialStudio = useMemo(() => window.location.pathname.includes("agents") || window.location.pathname.includes("studio"), []);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/features" element={<SimplePage title="Everything your calls, texts, and emails need." text="A clean product architecture for personal and business users: voice agents, SMS, email, workflows, training, integrations, analytics, and mobile extensions." icon={LayoutGrid} />} />
        <Route path="/pricing" element={<MarketingFrame><PricingPreview /></MarketingFrame>} />
        <Route path="/showcase" element={<SimplePage title="Hear the agents before you deploy them." text="Demo personal screening, front desk booking, technical triage, and outbound follow-up agents from the new showcase system." icon={Headphones} />} />
        <Route path="/developers" element={<SimplePage title="Developer-ready voice infrastructure." text="APIs, webhooks, model routing, tool actions, and audit events for teams that want to extend Wireline into their stack." icon={Zap} />} />
        <Route path="/about" element={<SimplePage title="The front line should feel effortless." text="Wireline turns the phone from a liability into a reliable AI-native interface for people and teams." icon={Sparkles} />} />
        <Route path="/compare" element={<SimplePage title="Wireline replaces voicemail, IVRs, and brittle bots." text="A premium AI-native operating layer built around conversation, not ticket queues." icon={ShieldCheck} />} />
        <Route path="/blog" element={<SimplePage title="Wireline notes from product, design, and engineering." text="Short, useful essays on latency, agent training, model routing, and personal automation." icon={FileText} />} />
        <Route path="/training" element={<ConsoleShell initial="training" />} />
        <Route path="/integrations" element={<ConsoleShell initial="integrations" />} />
        <Route path="/analytics" element={<ConsoleShell initial="analytics" />} />
        <Route path="/personal-home" element={<ConsoleShell initial="personal" />} />
        <Route path="/personal" element={<ConsoleShell initial="personal" />} />
        <Route path="/business" element={<ConsoleShell initial="ops" />} />
        <Route path="/ops" element={<ConsoleShell initial="ops" />} />
        <Route path="/agents" element={<ConsoleShell initial={initialStudio ? "studio" : "ops"} />} />
        <Route path="/studio" element={<ConsoleShell initial="studio" />} />
        <Route path="/admin" element={<ConsoleShell initial="integrations" />} />
        <Route path="/app" element={<Navigate to="/personal-home" replace />} />
        <Route path="/app/personal" element={<ConsoleShell initial="personal" />} />
        <Route path="/app/business" element={<ConsoleShell initial="ops" />} />
        <Route path="/app/studio" element={<ConsoleShell initial="studio" />} />
        <Route path="/signin" element={<AuthScreen />} />
        <Route path="/signup" element={<AuthScreen start />} />
        <Route path="/auth" element={<AuthScreen />} />
        <Route path="/get-started" element={<AuthScreen start />} />
        <Route path="*" element={<MarketingFrame><section className="mx-auto max-w-3xl px-5 py-24 text-center"><Logo /><h1 className="mt-8 font-display text-5xl font-medium tracking-[-.05em]">Page not found</h1><p className="mt-4 text-[#7b6a50]">The redesigned Wireline route does not exist yet.</p><div className="mt-8"><ButtonLink to="/">Back home</ButtonLink></div></section></MarketingFrame>} />
      </Routes>
    </BrowserRouter>
  );
}
