import { useState } from "react";
import type { ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Building2,
  Calendar,
  Check,
  ChevronRight,
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
  Radio,
  ShieldCheck,
  Sliders,
  Sparkles,
  Smartphone,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

import FigmaAuthPortal, { FigmaOAuthComplete } from "./FigmaAuthPortal";

type Tab = "ops" | "studio" | "training" | "personal" | "integrations" | "analytics" | "admin";
type Agent = { name: string; role: string; model: string; voice: string; status: "Live" | "Training" | "Paused"; calls: number; csat: number };

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

const agents: Agent[] = [
  { name: "Sarah", role: "Front desk + appointments", model: "Grok 4.3", voice: "Warm female", status: "Live", calls: 142, csat: 96 },
  { name: "Liam", role: "Inbound sales + demos", model: "Gemini 2.5 Flash", voice: "Confident male", status: "Live", calls: 88, csat: 94 },
  { name: "Tyler", role: "Technical triage", model: "Claude Sonnet", voice: "Calm neutral", status: "Training", calls: 34, csat: 91 },
];

const appNav: Array<{ to: string; tab: Tab; label: string; icon: typeof Home }> = [
  { to: "/personal-home", tab: "personal", label: "Personal", icon: Home },
  { to: "/business", tab: "ops", label: "Live Ops", icon: Radio },
  { to: "/agents", tab: "studio", label: "Studio", icon: Sliders },
  { to: "/training", tab: "training", label: "Training", icon: FileText },
  { to: "/integrations", tab: "integrations", label: "Integrations", icon: Plug },
  { to: "/analytics", tab: "analytics", label: "Analytics", icon: BarChart3 },
];

const marketing = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/showcase", label: "Showcase" },
  { to: "/developers", label: "Developers" },
  { to: "/about", label: "About" },
];

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-7 w-7 place-items-center rounded-[10px] bg-brand shadow-[0_18px_50px_-18px_rgba(79,30,123,.8)]">
        <svg viewBox="0 0 36 36" className="h-5 w-5" aria-hidden="true">
          <path d="M8 10l4.5 16L18 14l5.5 12L28 10" fill="none" stroke="#f5efe6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={cx("font-display text-[19px] font-semibold tracking-[-0.03em]", light ? "text-paper" : "text-ink")}>Wireline</span>
    </span>
  );
}

function Pill({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <span className={cx("inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]", dark ? "border-white/10 bg-white/5 text-white/65" : "border-ink/10 bg-paper-deep text-muted-foreground")}>{children}</span>;
}

function ButtonLink({ to, children, variant = "primary" }: { to: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Link to={to} className={cx("inline-flex h-11 items-center justify-center gap-2 rounded-[14px] px-5 text-sm font-semibold transition-all active:scale-[.98]", variant === "primary" && "bg-brand text-paper shadow-[0_24px_50px_-22px_rgba(79,30,123,.8)] hover:bg-brand-deep", variant === "secondary" && "border border-ink/12 bg-card text-ink hover:border-brand/40", variant === "ghost" && "text-muted-foreground hover:bg-ink/5 hover:text-ink")}>{children}</Link>
  );
}

function MarketingFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-ink wl-overhaul-surface">
      <header className="sticky top-0 z-50 border-b border-border bg-background/86 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="Wireline home"><Logo /></Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {marketing.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => cx("rounded-[12px] px-3 py-2 text-[13px] font-medium transition-colors", isActive ? "bg-ink/5 text-ink" : "text-muted-foreground hover:text-ink")}>{item.label}</NavLink>)}
          </nav>
          <div className="hidden items-center gap-2 lg:flex"><ButtonLink to="/signin" variant="ghost">Sign in</ButtonLink><ButtonLink to="/get-started">Get started</ButtonLink></div>
          <Link to="/get-started" className="rounded-[12px] bg-brand px-3 py-2 text-xs font-semibold text-paper lg:hidden">Start</Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-4"><Logo /><p className="max-w-sm text-sm leading-6 text-muted-foreground">AI voice, SMS, and email agents for every conversation at home and at work.</p><Pill><ShieldCheck size={12} /> SOC 2 ready posture</Pill></div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">{["Product", "Solutions", "Developers", "Company"].map((col) => <div key={col} className="space-y-3"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-ink">{col}</p>{["Features", "Pricing", "Security", "Contact"].map((x) => <p key={x} className="text-sm text-muted-foreground">{x}</p>)}</div>)}</div>
        </div>
      </footer>
    </div>
  );
}

function HeroPhone({ mode }: { mode: "personal" | "business" }) {
  const personal = mode === "personal";
  return (
    <div className="relative mx-auto w-full max-w-[500px]">
      <div className="absolute inset-6 -z-10 rounded-[40px] bg-brand/12 blur-3xl" aria-hidden="true" />
      <div className="rounded-[32px] border border-border bg-paper-deep p-3 shadow-[0_40px_120px_-70px_rgba(26,22,20,.65)]">
        <div className="rounded-[26px] border border-border bg-card p-5">
          <div className="flex items-center justify-between"><Logo /><Pill>{personal ? "Personal line" : "Live floor"}</Pill></div>
          <div className="mt-8 rounded-[24px] bg-ink p-5 text-paper">
            <div className="flex items-center justify-between text-xs text-white/50"><span>Live conversation</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 animate-pulse rounded-full bg-brand-bright" /> 00:48</span></div>
            <div className="mt-6 flex items-center gap-4"><div className="grid h-14 w-14 place-items-center rounded-full bg-brand"><PhoneCall size={22} /></div><div><p className="font-display text-2xl font-medium">{personal ? "Aria" : "Sarah"}</p><p className="text-sm text-white/55">{personal ? "Calling Dr. Allen's office" : "Resolving customer refund"}</p></div></div>
            <div className="mt-6 space-y-2">{[personal ? "Rescheduled appointment to Thursday 2pm" : "Verified customer and order", personal ? "Sent confirmation text" : "Issued refund under policy", personal ? "Added reminder to widget" : "Logged outcome to CRM"].map((item) => <div key={item} className="flex items-center gap-2 rounded-[14px] bg-white/[.06] px-3 py-2 text-sm"><Check size={15} className="text-brand-bright" />{item}</div>)}</div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">{[(personal ? "41" : "142"), (personal ? "spam blocked" : "calls today"), (personal ? "CarPlay" : "96% CSAT")].map((x, i) => <div key={x} className="rounded-[18px] bg-paper-deep px-3 py-3"><p className={cx("font-display text-xl", i === 0 ? "text-brand" : "text-ink")}>{x}</p></div>)}</div>
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
        <section className="relative overflow-x-clip border-b border-border"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:py-28"><div className="flex flex-col justify-center gap-7"><Pill><Sparkles size={12} /> Hundreds of models · no lock-in</Pill><h1 className="max-w-3xl font-display text-5xl font-medium leading-[1.02] tracking-[-0.055em] text-ink md:text-7xl">Your phone, finally <span className="italic text-brand">working for you.</span></h1><p className="max-w-xl text-[16px] leading-7 text-muted-foreground">Wireline handles personal calls so you never miss what matters, and runs a fleet of AI agents that answer your business floor around the clock. Human-fast. Never off-script.</p><div className="flex w-fit rounded-full border border-border bg-paper-deep p-1">{(["personal", "business"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cx("rounded-full px-4 py-2 text-xs font-bold capitalize transition", mode === m ? "bg-brand text-paper" : "text-muted-foreground")}>{m}</button>)}</div><div className="flex flex-wrap gap-3"><ButtonLink to="/get-started">Get started free <ArrowRight size={16} /></ButtonLink><ButtonLink to="/showcase" variant="secondary"><Phone size={16} /> Hear a live demo</ButtonLink></div><div className="grid max-w-xl grid-cols-3 overflow-hidden rounded-[20px] border border-border bg-border">{[(mode === "personal" ? "40s" : "142"), (mode === "personal" ? "Thu 2pm" : "$189"), (mode === "personal" ? "41" : "4 demos")].map((k, i) => <div key={k} className="bg-background p-4"><p className="font-display text-2xl font-medium text-brand">{k}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[.14em] text-muted-foreground">{i === 0 ? "handled" : i === 1 ? "confirmed" : "won"}</p></div>)}</div></div><HeroPhone mode={mode} /></div></section>
        <FeatureBand /><ModelBand /><PricingPreview />
      </main>
    </MarketingFrame>
  );
}

function SectionHeader({ eyebrow, title, text, dark = false }: { eyebrow: string; title: string; text: string; dark?: boolean }) { return <div className="max-w-2xl"><p className={cx("text-[11px] font-bold uppercase tracking-[.18em]", dark ? "text-brand-bright" : "text-brand")}>{eyebrow}</p><h2 className={cx("mt-3 font-display text-4xl font-medium leading-[1.05] tracking-[-.04em] md:text-5xl", dark ? "text-paper" : "text-ink")}>{title}</h2><p className={cx("mt-4 text-[15px] leading-7", dark ? "text-white/60" : "text-muted-foreground")}>{text}</p></div>; }
function Card({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={cx("rounded-[28px] border border-border bg-card p-6 shadow-[0_20px_70px_-56px_rgba(26,22,20,.65)]", className)}>{children}</div>; }
function DarkCard({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={cx("rounded-[26px] border border-white/10 bg-white/[.045] p-5 shadow-[0_24px_80px_-60px_rgba(0,0,0,.8)]", className)}>{children}</div>; }

function FeatureBand() { const items = [[Mic, "Voice agents", "Natural turn-taking, branded voices, and escalation rules."], [Mail, "Email follow-up", "Drafts, approvals, customer replies, and CRM notes."], [MessageSquare, "SMS workflows", "Two-way confirmations, reminders, and post-call summaries."], [Smartphone, "iOS + Android", "Widgets, Siri shortcuts, CarPlay, and glanceable control."], [Database, "Training hub", "Policies, scripts, prices, objections, and scenario tests."], [Lock, "Guardrails", "Never claims an action without an enabled tool and audit trail."]] as const; return <section className="border-b border-border bg-card"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionHeader eyebrow="Platform" title="Personal simplicity. Business-grade control." text="The overhaul separates personal and business paths while keeping one premium Wireline system." /><div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map(([Icon, t, d]) => <Card key={t}><div className="mb-5 grid h-11 w-11 place-items-center rounded-full bg-brand text-paper"><Icon size={20} /></div><h3 className="font-display text-xl font-medium text-ink">{t}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{d}</p></Card>)}</div></div></section>; }
function ModelBand() { const providers = ["OpenRouter", "Anthropic", "OpenAI", "Google Gemini", "xAI Grok", "Meta Llama"]; return <section className="border-b border-border bg-ink text-paper"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><SectionHeader dark eyebrow="Model marketplace" title="Pick the model per agent." text="Default to fast, affordable Grok/Gemini paths, upgrade critical agents to premium models, and keep Anthropic/OpenAI available where they matter." /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{providers.map((p, i) => <div key={p} className="rounded-[22px] border border-white/10 bg-white/[.045] p-4"><p className="text-sm font-semibold">{p}</p><p className="mt-2 text-xs text-white/45">{i === 0 ? "300+ models" : i === 1 ? "Opus/Sonnet" : "Selectable routing"}</p></div>)}</div></div></div></section>; }
function PricingPreview() { return <section className="bg-background"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionHeader eyebrow="Pricing" title="No hard agent limits. Add capacity when it pays for itself." text="Personal starts low. Business scales by minutes, integrations, and advanced controls." /><div className="mt-10 grid gap-4 lg:grid-cols-4">{[["Personal", "$9", "Siri, widgets, call screening"], ["Personal+", "$19", "More minutes and errands"], ["Business Growth", "$249", "Fleet, live ops, studio"], ["Scale", "$699", "High-volume operations"]].map(([n, p, d], i) => <Card key={n} className={i === 2 ? "bg-ink text-paper" : ""}><p className="text-sm font-semibold">{n}</p><p className="mt-4 font-display text-4xl font-medium">{p}</p><p className={cx("mt-2 text-sm", i === 2 ? "text-white/55" : "text-muted-foreground")}>{d}</p><div className="mt-6 space-y-2 text-sm"><p className="flex items-center gap-2"><Check size={15} className="text-brand-bright" /> Voice + SMS + email</p><p className="flex items-center gap-2"><Check size={15} className="text-brand-bright" /> Choose model stack</p></div></Card>)}</div></div></section>; }

function MarketingPage({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <MarketingFrame><main className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionHeader eyebrow={eyebrow} title={title} text={text} /><div className="mt-10 grid gap-4 md:grid-cols-3"><Card><Sparkles className="text-brand" /><h3 className="mt-4 font-display text-2xl">Premium surface</h3><p className="mt-2 text-sm text-muted-foreground">Clean hierarchy, calm cream/purple palette, and desktop-first spacing.</p></Card><Card><Workflow className="text-brand" /><h3 className="mt-4 font-display text-2xl">Operational depth</h3><p className="mt-2 text-sm text-muted-foreground">Personal and business flows stay separate but share a single account layer.</p></Card><Card><ShieldCheck className="text-brand" /><h3 className="mt-4 font-display text-2xl">Launch-ready rails</h3><p className="mt-2 text-sm text-muted-foreground">OAuth, integrations, Studio, Training, and analytics are mapped into the redesign.</p></Card></div></main></MarketingFrame>; }

function ConsoleShell({ initial = "ops" }: { initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const active = initial === "personal" ? "personal" : tab;
  return (
    <div className="flex h-dvh overflow-hidden bg-[#120b1b] text-paper">
      <aside className="hidden w-[268px] shrink-0 border-r border-white/10 bg-[#160f24] p-4 lg:flex lg:flex-col">
        <Link to="/" className="mb-8"><Logo light /></Link>
        <nav className="space-y-1">{appNav.map((item) => { const Icon = item.icon; const on = item.tab === active; return <button key={item.to} onClick={() => setTab(item.tab)} className={cx("flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left text-sm transition", on ? "bg-white/10 text-white" : "text-white/48 hover:bg-white/[.06] hover:text-white/80")}><Icon size={17} />{item.label}</button>; })}</nav>
        <div className="mt-auto rounded-[22px] border border-white/10 bg-white/[.045] p-4"><Pill dark><Sparkles size={12} /> Assistant</Pill><p className="mt-3 text-sm text-white/58">Ask Wireline to simplify setup, add workflows, or audit agent training.</p></div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:px-6"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-brand-bright">{active === "personal" ? "Personal" : "Business"}</p><h1 className="font-display text-xl font-medium">{active === "studio" ? "Agent Studio" : active === "training" ? "Training" : active === "integrations" ? "Integrations" : active === "analytics" ? "Analytics" : active === "admin" ? "Admin" : active === "personal" ? "Personal Wireline" : "Live Ops"}</h1></div><div className="flex items-center gap-2"><span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55 sm:inline-flex">trywireline.com</span><Bell size={18} className="text-white/55" /></div></header>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip p-4 sm:p-6 lg:p-8">{active === "personal" ? <PersonalConsole /> : active === "studio" ? <Studio /> : active === "training" ? <TrainingConsole /> : active === "integrations" ? <Integrations /> : active === "analytics" ? <Analytics /> : active === "admin" ? <Admin /> : <Ops />}</div>
      </main>
    </div>
  );
}

function AssistantPanel() { return <DarkCard><Pill dark><Bot size={12} /> Wireline Assistant</Pill><h3 className="mt-4 font-display text-2xl">What should improve next?</h3><div className="mt-5 space-y-3 text-sm text-white/65"><p>Sarah is ready for production. Tyler needs one escalation workflow before launch.</p><p>Connect Google Calendar and Outlook before enabling appointment booking.</p><p>Training gaps: refund policy, after-hours pricing, lead qualification.</p></div><div className="mt-5 rounded-[18px] border border-white/10 bg-black/20 p-3 text-sm text-white/45">Ask Wireline…</div></DarkCard>; }
function Ops() { return <div className="grid gap-5 xl:grid-cols-[1fr_380px]"><div className="space-y-5"><div className="grid gap-4 md:grid-cols-4">{[["Live calls", "18"], ["Handled today", "142"], ["CSAT", "96%"], ["Avg latency", "248ms"]].map(([k, v]) => <DarkCard key={k}><p className="text-xs text-white/40">{k}</p><p className="mt-2 font-display text-3xl font-medium">{v}</p></DarkCard>)}</div><DarkCard><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-medium">Live floor</h2><Pill dark><Radio size={12} /> active</Pill></div><div className="mt-5 space-y-3">{["Refund request — Sarah", "Demo request — Liam", "Webhook timeout — Tyler", "Appointment change — Sarah"].map((x, i) => <div key={x} className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[.04] p-4"><div className="flex items-center gap-3"><span className={cx("h-2.5 w-2.5 rounded-full", i === 2 ? "bg-red-400" : "bg-brand-bright")} /><div><p className="text-sm font-semibold">{x}</p><p className="text-xs text-white/42">+1 (312) 555-01{i}7 · {i + 1}:4{i}</p></div></div><ChevronRight size={18} className="text-white/35" /></div>)}</div></DarkCard></div><AssistantPanel /></div>; }
function Studio() { const [agent, setAgent] = useState(agents[0]); return <div className="grid gap-5 xl:grid-cols-[320px_1fr_360px]"><DarkCard><h2 className="font-display text-2xl">Fleet</h2><div className="mt-5 space-y-2">{agents.map((a) => <button key={a.name} onClick={() => setAgent(a)} className={cx("w-full rounded-[18px] border p-3 text-left transition", agent.name === a.name ? "border-brand-bright bg-brand/15" : "border-white/10 bg-white/[.035] hover:bg-white/[.06]")}><p className="font-semibold">{a.name}</p><p className="mt-1 text-xs text-white/45">{a.role}</p></button>)}</div><button className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-white/10 text-sm text-white/65"><Plus size={15} /> Add agent</button></DarkCard><DarkCard><Pill dark>Basic setup</Pill><h2 className="mt-4 font-display text-4xl">{agent.name}</h2><div className="mt-6 grid gap-4 md:grid-cols-2"><Field label="Role" value={agent.role} /><Field label="Model" value={agent.model} /><Field label="Voice" value={agent.voice} /><Field label="Phone number" value="(312) 555-0198" /></div><div className="mt-6 rounded-[22px] border border-white/10 bg-black/20 p-4"><p className="text-sm font-semibold">Simple first. Training lives separately.</p><p className="mt-2 text-sm text-white/50">Studio now handles name, role, model, voice, number, handoff, and workflow selection. Scripts, docs, scenarios, and simulations live on Training.</p></div></DarkCard><AssistantPanel /></div>; }
function Field({ label, value }: { label: string; value: string }) { return <label className="block"><span className="text-[11px] font-bold uppercase tracking-[.16em] text-white/35">{label}</span><div className="mt-2 rounded-[16px] border border-white/10 bg-white/[.045] px-3 py-3 text-sm">{value}</div></label>; }
function TrainingConsole() { return <div className="grid gap-5 lg:grid-cols-4">{[[Database, "Knowledge", "Policies, pricing, FAQs, objections"], [Workflow, "Workflows", "Escalations, bookings, refunds, approvals"], [Mic, "Voice", "Tone, pronunciation, response length"], [Headphones, "Simulator", "Test before real customer calls"]].map(([Icon, title, text]) => <DarkCard key={title as string}><Icon className="text-brand-bright" /><h3 className="mt-4 font-display text-2xl">{title as string}</h3><p className="mt-2 text-sm text-white/52">{text as string}</p></DarkCard>)}</div>; }
function PersonalConsole() { return <div className="grid gap-5 xl:grid-cols-[1fr_380px]"><div className="space-y-5"><DarkCard><Pill dark><Smartphone size={12} /> Personal line</Pill><h2 className="mt-4 font-display text-4xl">Aria handles the noise.</h2><div className="mt-6 grid gap-3 md:grid-cols-3">{[["Spam blocked", "41"], ["Errands handled", "7"], ["Reminders set", "12"]].map(([k, v]) => <div key={k} className="rounded-[20px] border border-white/10 bg-white/[.04] p-4"><p className="font-display text-3xl">{v}</p><p className="mt-1 text-xs text-white/42">{k}</p></div>)}</div></DarkCard><DarkCard><h3 className="font-display text-2xl">Personal integrations</h3><div className="mt-5 grid gap-3 md:grid-cols-2">{["Google Calendar", "Gmail", "Outlook", "Yahoo Mail", "Siri Shortcuts", "CarPlay"].map((x) => <Connector key={x} name={x} scope="Personal" />)}</div></DarkCard></div><AssistantPanel /></div>; }
function Connector({ name, scope }: { name: string; scope: "Personal" | "Business" }) { return <div className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[.035] p-4"><div><p className="text-sm font-semibold">{name}</p><p className="mt-1 text-xs text-white/40">{scope} data boundary</p></div><button className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60">Connect</button></div>; }
function Integrations() { const business = ["Google Workspace", "Microsoft 365", "HubSpot CRM", "Stripe", "Twilio", "Vapi", "Slack", "Webhook API"]; const personal = ["Gmail", "Google Calendar", "Outlook", "Yahoo Mail", "iOS Shortcuts", "Android Intents"]; return <div className="space-y-5"><DarkCard><Pill dark><Plug size={12} /> Separated integration architecture</Pill><h2 className="mt-4 font-display text-4xl">Personal and business connectors stay separated.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Personal connectors power your private assistant. Business connectors power workspace agents, CRM, billing, telephony, analytics, and team workflows. Same account, separate scopes, separate training context, separate approval rules.</p></DarkCard><div className="grid gap-5 xl:grid-cols-2"><DarkCard><h3 className="font-display text-2xl">Personal connectors</h3><p className="mt-2 text-sm text-white/45">For one user: calls, calendar, email, mobile intents, reminders.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{personal.map((x) => <Connector key={x} name={x} scope="Personal" />)}</div></DarkCard><DarkCard><h3 className="font-display text-2xl">Business workspace connectors</h3><p className="mt-2 text-sm text-white/45">For teams: CRM, billing, calendars, phone stack, Slack, webhooks, audit logs.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{business.map((x) => <Connector key={x} name={x} scope="Business" />)}</div></DarkCard></div></div>; }
function Analytics() { return <div className="grid gap-5 lg:grid-cols-4">{[["Calls", "1,842"], ["Booked", "214"], ["Revenue assisted", "$48k"], ["Containment", "83%"]].map(([k, v]) => <DarkCard key={k}><p className="text-xs text-white/40">{k}</p><p className="mt-2 font-display text-4xl">{v}</p></DarkCard>)}</div>; }
function Admin() { return <div className="grid gap-5 lg:grid-cols-3">{["Workspace", "Team", "Billing", "Security", "Data boundaries", "Audit logs"].map((x) => <DarkCard key={x}><ShieldCheck className="text-brand-bright" /><h3 className="mt-4 font-display text-2xl">{x}</h3><p className="mt-2 text-sm text-white/50">Configured for launch migration.</p></DarkCard>)}</div>; }

function NotFound() { return <MarketingFrame><main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center"><Pill>404</Pill><h1 className="mt-5 font-display text-5xl">Page not found</h1><p className="mt-4 text-muted-foreground">This route was not included in the migration map.</p><ButtonLink to="/">Back home</ButtonLink></main></MarketingFrame>; }

export default function FigmaOverhaul() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/features" element={<MarketingPage eyebrow="Features" title="Every front-line conversation in one system." text="Voice, SMS, email, mobile intents, Studio, Training, analytics, integrations, and model choice." />} />
        <Route path="/pricing" element={<MarketingPage eyebrow="Pricing" title="Personal starts low. Business scales cleanly." text="No hard agent limits. Add capacity, integrations, and advanced models when they pay for themselves." />} />
        <Route path="/showcase" element={<MarketingPage eyebrow="Showcase" title="Preview the agents before launch." text="Reception, sales, support, scheduling, personal errands, handoffs, and post-call summaries." />} />
        <Route path="/developers" element={<MarketingPage eyebrow="Developers" title="API-first where it matters." text="OAuth, webhooks, CRM sync, audit logs, and provider controls for production teams." />} />
        <Route path="/about" element={<MarketingPage eyebrow="About" title="Wireline makes phones useful again." text="A premium AI-native operating layer for personal life and business front-line operations." />} />
        <Route path="/compare" element={<MarketingPage eyebrow="Compare" title="Not phone-tree software." text="A live AI operating layer with Studio, Training, integrations, and analytics instead of legacy call-center sprawl." />} />
        <Route path="/blog" element={<MarketingPage eyebrow="Blog" title="Wireline build notes." text="Launch notes, AI phone strategy, model routing, and operator playbooks." />} />
        <Route path="/get-started" element={<FigmaAuthPortal />} />
        <Route path="/signup" element={<FigmaAuthPortal />} />
        <Route path="/signin" element={<FigmaAuthPortal />} />
        <Route path="/login" element={<FigmaAuthPortal />} />
        <Route path="/auth" element={<FigmaAuthPortal />} />
        <Route path="/auth/*" element={<FigmaAuthPortal />} />
        <Route path="/auth/oauth-complete" element={<FigmaOAuthComplete />} />
        <Route path="/oauth-complete" element={<Navigate to="/auth/oauth-complete" replace />} />
        <Route path="/personal-home" element={<ConsoleShell initial="personal" />} />
        <Route path="/app/personal" element={<ConsoleShell initial="personal" />} />
        <Route path="/business" element={<ConsoleShell initial="ops" />} />
        <Route path="/app/business" element={<ConsoleShell initial="ops" />} />
        <Route path="/ops" element={<ConsoleShell initial="ops" />} />
        <Route path="/agents" element={<ConsoleShell initial="studio" />} />
        <Route path="/training" element={<ConsoleShell initial="training" />} />
        <Route path="/integrations" element={<ConsoleShell initial="integrations" />} />
        <Route path="/analytics" element={<ConsoleShell initial="analytics" />} />
        <Route path="/phone" element={<ConsoleShell initial="ops" />} />
        <Route path="/email" element={<ConsoleShell initial="integrations" />} />
        <Route path="/sms" element={<ConsoleShell initial="integrations" />} />
        <Route path="/admin" element={<ConsoleShell initial="admin" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
