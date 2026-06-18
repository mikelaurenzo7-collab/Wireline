import type { ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Bell, Check, Database, LogOut, Phone, Plug, Radio, Search, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";

type BusinessPage = "assistant" | "live" | "fleet" | "training" | "analytics" | "team" | "integrations" | "settings";
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
  { name: "Sarah", role: "Front desk + appointments", model: "Grok 4.3", status: "Live", calls: "142", score: "96%", next: "Refund policy drill" },
  { name: "Liam", role: "Inbound sales + demos", model: "Gemini Flash", status: "Live", calls: "88", score: "94%", next: "Billing language" },
  { name: "Tyler", role: "Technical triage", model: "Claude Sonnet", status: "Training", calls: "34", score: "91%", next: "Webhook simulations" },
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
  return <section className={cx("rounded-[28px] border border-white/10 bg-white/[.045] p-5 shadow-[0_24px_80px_-62px_rgba(0,0,0,.9)]", className)}>{children}</section>;
}

function Pill({ children, tone = "default" }: { children: ReactNode; tone?: Tone }) {
  const styles = tone === "brand" ? "border-brand/35 bg-brand/15 text-brand-bright" : tone === "warn" ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : tone === "muted" ? "border-white/10 bg-white/[.035] text-paper/35" : "border-white/10 bg-white/[.045] text-paper/55";
  return <span className={cx("inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.15em]", styles)}>{children}</span>;
}

function statusTone(status: string): Tone {
  if (["Live", "Done", "Available"].includes(status)) return "brand";
  if (["Review", "Approve", "Coach"].includes(status)) return "warn";
  if (["Planned", "Training"].includes(status)) return "muted";
  return "default";
}

function MiniMetric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-[18px] border border-white/10 bg-black/15 p-4"><p className="font-display text-3xl text-paper">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.14em] text-paper/35">{label}</p></div>;
}

function RequireBusiness({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center bg-ink text-paper"><Sparkles className="h-5 w-5 animate-pulse text-brand-bright" /></div>;
  if (!user) return <Navigate to={`/signin?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function BusinessShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const active = pageFromPath(location.pathname);
  const activeLabel = nav.find(([id]) => id === active)?.[1] ?? "Business";
  return <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-ink text-paper">
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#160f24] p-4 2xl:flex"><Link to="/" className="mb-8 inline-flex items-center gap-2 px-2 pt-2"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-paper">W</span><span className="font-display text-[20px] font-semibold">Wireline</span></Link><Pill>Business workspace</Pill><nav className="mt-5 flex flex-1 flex-col gap-1">{nav.map(([id, label, path]) => <Link key={id} to={path} className={cx("rounded-[14px] px-3 py-2.5 text-[13px] font-semibold transition", active === id ? "bg-brand text-paper" : "text-paper/55 hover:bg-paper/5 hover:text-paper")}>{label}</Link>)}</nav><div className="border-t border-paper/10 pt-4 text-xs text-paper/45"><div className="truncate">{user?.email ?? "Owner"}</div><button onClick={() => { void signOut(); navigate("/"); }} className="mt-3 inline-flex items-center gap-2 hover:text-paper"><LogOut size={14} /> Sign out</button></div></aside>
    <div className="min-w-0 flex-1"><header className="sticky top-0 z-40 border-b border-white/10 bg-ink/92 backdrop-blur-xl"><div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><Link to="/" className="2xl:hidden"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-paper">W</span></Link><Pill tone="brand"><Radio size={12} /> {activeLabel}</Pill></div><div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-[14px] border border-white/10 px-3 py-2 md:flex"><Search size={14} className="text-paper/35" /><span className="text-xs text-paper/35">Search calls, agents, contacts…</span></div><Bell size={17} className="text-paper/55" /><span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs text-paper">{user?.email?.[0]?.toUpperCase() ?? "W"}</span></div></div><nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2 2xl:hidden">{nav.map(([id, label, path]) => <Link key={id} to={path} className={cx("shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold", active === id ? "bg-brand text-paper" : "text-paper/45")}>{label}</Link>)}</nav></header><main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main></div>
  </div>;
}

function Title({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="max-w-3xl"><p className="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-brand-bright">{eyebrow}</p><h1 className="mt-3 font-display text-4xl leading-[1.03] tracking-[-.05em] text-paper sm:text-5xl">{title}</h1><p className="mt-4 text-sm leading-6 text-paper/55">{text}</p></div>;
}

function AssistantPage() {
  return <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]"><div className="space-y-6"><Title eyebrow="Wireline Assistant" title="Ask what to improve, route, or train next." text="This is the owner/operator command center. It explains what changed, what needs approval, and which agents need training." /><Card className="min-h-[420px]"><div className="rounded-[20px] border border-white/10 bg-black/20 p-5 text-sm leading-7 text-paper/70">I reviewed the last 24 hours. Sarah is strong on scheduling. Liam needs billing escalation language. Tyler needs webhook timeout simulations. Recommended next step: update refund policy, then run five billing scenarios in Training.</div><div className="mt-5 flex flex-wrap gap-2">{["Audit my fleet", "Fix billing calls", "Train Sarah", "Show escalations"].map((x) => <button key={x} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-paper/55 hover:text-paper">{x}</button>)}</div><div className="mt-5 flex items-center gap-3 rounded-[18px] border border-white/10 bg-black/20 px-3 py-2"><input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-paper/30" placeholder="Ask Wireline…" /><button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold">Ask</button></div></Card></div><div className="space-y-5"><Card><Pill tone="warn">Needs approval</Pill><h2 className="mt-4 font-display text-2xl">Refund call</h2><p className="mt-2 text-sm leading-6 text-paper/52">Sarah needs a human approval rule before promising refund timing.</p></Card><Card><Pill tone="brand">Training win</Pill><h2 className="mt-4 font-display text-2xl">12 improved calls</h2><p className="mt-2 text-sm leading-6 text-paper/52">Updated objection handling reduced repeated escalations.</p></Card><Card><Pill>Next action</Pill><h2 className="mt-4 font-display text-2xl">Run simulations</h2><p className="mt-2 text-sm leading-6 text-paper/52">Five billing scenarios should be tested before expanding permissions.</p></Card></div></div>;
}

function LiveOpsPage() {
  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><Title eyebrow="Live Operations" title="The cockpit for calls in motion." text="Track active calls, coaching moments, escalations, and quality pulse without crowding Studio." /><button className="rounded-[14px] bg-brand px-5 py-3 text-sm font-semibold">Start outbound</button></div><div className="grid gap-4 md:grid-cols-3"><MiniMetric value="281" label="Calls today" /><MiniMetric value="3m 41s" label="Avg handle" /><MiniMetric value="8" label="Open escalations" /></div><div className="grid gap-5 xl:grid-cols-[1fr_360px]"><Card><h2 className="font-display text-2xl">Calls in progress</h2><div className="mt-5 divide-y divide-white/10 rounded-[22px] border border-white/10 overflow-hidden">{liveCalls.map(([topic, agent, detail, time, action]) => <div key={topic} className="grid gap-3 p-4 text-sm lg:grid-cols-[1fr_140px_1fr_96px_100px]"><div className="font-semibold">{topic}</div><div className="text-paper/55">{agent}</div><div className="text-paper/45">{detail}</div><div className="font-mono text-paper/35">{time}</div><Pill tone={statusTone(action)}>{action}</Pill></div>)}</div></Card><Card><h2 className="font-display text-2xl">Quality pulse</h2><div className="mt-5 space-y-4">{[["Billing objection", "92%"], ["Refund approval", "85%"], ["Appointment routing", "78%"]].map(([name, value]) => <div key={name}><div className="flex justify-between text-sm"><span>{name}</span><span className="text-brand-bright">{value}</span></div><div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-brand" style={{ width: value }} /></div></div>)}</div></Card></div></div>;
}

function FleetPage() {
  return <div className="space-y-6"><Title eyebrow="Agent Fleet" title="Every agent, status, and improvement loop." text="Fleet is the roster. Studio edits setup. Training improves behavior. Live Ops monitors performance." /><div className="grid gap-5 lg:grid-cols-3">{agents.map((agent) => <Card key={agent.name}><div className="flex items-center justify-between"><Pill tone={statusTone(agent.status)}>{agent.status}</Pill><span className="text-xs text-paper/35">{agent.model}</span></div><h3 className="mt-5 font-display text-3xl">{agent.name}</h3><p className="mt-1 text-sm text-paper/50">{agent.role}</p><div className="mt-5 grid grid-cols-2 gap-2"><MiniMetric value={agent.calls} label="Calls" /><MiniMetric value={agent.score} label="Score" /></div><div className="mt-4 rounded-[16px] border border-white/10 bg-black/15 p-3 text-sm text-paper/55"><span className="text-paper/35">Next training:</span> {agent.next}</div><div className="mt-5 flex gap-2"><Link to="/app/business/studio" className="flex-1 rounded-[14px] bg-brand px-3 py-2 text-center text-sm font-semibold">Edit setup</Link><Link to="/app/business/training" className="flex-1 rounded-[14px] border border-white/10 px-3 py-2 text-center text-sm text-paper/65">Train</Link></div></Card>)}</div></div>;
}

function TrainingPage() {
  const items = [[Database, "Knowledge", "Policies, pricing, hours, FAQs, allowed claims, and document sources."], [Workflow, "Workflows", "Bookings, refunds, escalations, routing, SMS follow-ups, and approvals."], [Phone, "Voice", "Tone, pronunciation, brevity, response length, and banned phrases."], [BarChart3, "Simulator", "Run difficult scenarios before customers experience the agent."]] as const;
  return <div className="space-y-6"><Title eyebrow="Training" title="Teach once. Improve forever." text="Training is now the deep work surface. Studio stays simple because scripts, docs, scenarios, and simulations live here." /><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{items.map(([Icon, title, text]) => <Card key={title}><Icon className="text-brand-bright" /><h3 className="mt-4 font-display text-2xl">{title}</h3><p className="mt-2 text-sm leading-6 text-paper/52">{text}</p></Card>)}</div><div className="grid gap-5 lg:grid-cols-[1fr_360px]"><Card><h3 className="font-display text-2xl">Launch checklist</h3><div className="mt-5 grid gap-3 md:grid-cols-3">{["Upload policies", "Run 5 simulations", "Approve escalation rules"].map((x, i) => <div key={x} className="rounded-[18px] border border-white/10 bg-black/20 p-4 text-sm text-paper/65"><Check className={cx("mb-3 h-4 w-4", i < 2 ? "text-brand-bright" : "text-paper/30")} />{x}</div>)}</div></Card><Card><Pill tone="warn">Next before launch</Pill><h3 className="mt-4 font-display text-2xl">Billing scenario pack</h3><p className="mt-2 text-sm leading-6 text-paper/52">Refund timing, failed payment, discount request, disputed charge, and manager callback.</p></Card></div></div>;
}

function AnalyticsPage() {
  const rows = [["Calls", "1,842", "+18%"], ["Booked", "214", "+12%"], ["Containment", "83%", "+6%"], ["Revenue assisted", "$48k", "+22%"]];
  return <div className="space-y-6"><Title eyebrow="Analytics" title="What is working, what needs training." text="Analytics should guide training, staffing, and model choice — not just show vanity metrics." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{rows.map(([k,v,c]) => <Card key={k}><p className="text-xs text-paper/40">{k}</p><p className="mt-2 font-display text-4xl">{v}</p><p className="mt-2 text-xs text-brand-bright">{c}</p></Card>)}</div><Card><h2 className="font-display text-2xl">Training opportunities</h2><div className="mt-5 grid gap-3 md:grid-cols-3">{["Billing objections", "Refund approvals", "Webhook timeouts"].map((x) => <div key={x} className="rounded-[18px] border border-white/10 bg-black/20 p-4 text-sm text-paper/60">{x}</div>)}</div></Card></div>;
}

function TeamPage() {
  return <div className="space-y-6"><Title eyebrow="Team & Roles" title="Give people the right controls." text="Owners, managers, reviewers, and operators should not have the same permissions." /><div className="grid gap-5 md:grid-cols-3">{[["Owner", "Billing, settings, models, all approvals"], ["Manager", "Training, routing, escalation rules"], ["Reviewer", "Call review, QA notes, scenario approval"]].map(([role, text]) => <Card key={role}><Users className="text-brand-bright" /><h3 className="mt-4 font-display text-2xl">{role}</h3><p className="mt-2 text-sm leading-6 text-paper/52">{text}</p><button className="mt-5 rounded-[14px] border border-white/10 px-3 py-2 text-sm text-paper/65">Configure role</button></Card>)}</div></div>;
}

function IntegrationsPage() {
  return <div className="space-y-6"><Title eyebrow="Integrations" title="Connect the systems agents actually use." text="Business connectors stay separate from personal context. Each integration needs clear scope, status, and action state." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{connectors.map(([name, status, detail]) => <Card key={name}><Plug className="text-brand-bright" /><div className="mt-4 flex items-center justify-between gap-3"><h3 className="font-display text-xl">{name}</h3><Pill tone={statusTone(status)}>{status}</Pill></div><p className="mt-3 text-sm leading-6 text-paper/52">{detail}</p><button className="mt-5 rounded-[14px] border border-white/10 px-3 py-2 text-sm text-paper/65">{status === "Review" ? "Verify" : status === "Available" ? "Connect" : "View plan"}</button></Card>)}</div></div>;
}

function SettingsPage() {
  const settings = ["Workspace", "Billing", "Security", "Data boundaries", "Audit logs", "Model defaults", "Phone numbers", "Approval rules"];
  return <div className="space-y-6"><Title eyebrow="Settings" title="Workspace controls and data boundaries." text="Settings should make launch constraints explicit: billing, security, audit logs, models, routing, and approval rules." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{settings.map((x) => <Card key={x}><ShieldCheck className="text-brand-bright" /><h3 className="mt-4 font-display text-xl">{x}</h3><p className="mt-2 text-sm leading-6 text-paper/52">Configured for a launch-ready workspace.</p></Card>)}</div></div>;
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
  return <BrowserRouter><RequireBusiness><BusinessShell><Routes><Route path="/app/business/*" element={<CurrentPage />} /><Route path="/business" element={<Navigate to="/app/business/live" replace />} /><Route path="/ops" element={<Navigate to="/app/business/live" replace />} /><Route path="/integrations" element={<Navigate to="/app/business/integrations" replace />} /><Route path="/analytics" element={<Navigate to="/app/business/analytics" replace />} /><Route path="/phone" element={<Navigate to="/app/business/live" replace />} /><Route path="/email" element={<Navigate to="/app/business/integrations" replace />} /><Route path="/sms" element={<Navigate to="/app/business/integrations" replace />} /><Route path="/admin" element={<Navigate to="/app/business/settings" replace />} /></Routes></BusinessShell></RequireBusiness></BrowserRouter>;
}
