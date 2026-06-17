import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Activity, Check, ChevronRight, Home, LogOut, Mail, Mic, Phone, Settings, ShieldCheck, Smartphone, Sparkles, Wand2 } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";

const nav = [
  ["Home", "/app/personal"],
  ["Assistant", "/app/personal/assistant"],
  ["Automations", "/app/personal/automations"],
  ["Devices", "/app/personal/devices"],
  ["Number", "/app/personal/number"],
  ["Activity", "/app/personal/activity"],
  ["Settings", "/app/personal/settings"],
];

const models = ["Grok 4.3", "Gemini Flash", "Claude Sonnet", "GPT-5.5 Thinking", "Auto route"];

const automations = [
  "Ask Assistant", "Place a call", "Call a contact", "Call a business", "Reschedule", "Check status",
  "Book appointment", "Cancel appointment", "Wait on hold", "Take this call", "Summarize last call",
  "What needs attention", "Send recap", "Add reminder", "Call back missed call", "Mark followed up"
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-border bg-card p-5 shadow-[0_20px_70px_-56px_rgba(26,22,20,.65)] ${className}`}>{children}</section>;
}

function RequirePersonal({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center bg-background"><Sparkles className="h-5 w-5 animate-pulse text-brand" /></div>;
  if (!user) return <Navigate to={`/signin?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  return <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background text-ink wl-grain"><header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"><Link to="/" className="inline-flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-paper">W</span><span className="font-display text-[20px] font-semibold tracking-[-0.03em] text-ink">Wireline</span></Link><div className="flex items-center gap-3"><span className="hidden rounded-full border border-brand/20 bg-brand/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand sm:inline-flex">Personal workspace</span><span className="grid h-9 w-9 place-items-center rounded-full bg-brand font-display text-paper">{user?.email?.[0]?.toUpperCase() ?? "W"}</span><button onClick={() => { void signOut(); navigate("/"); }} className="text-muted-foreground hover:text-ink"><LogOut size={17} /></button></div></div><nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-3 sm:px-6 lg:px-8">{nav.map(([label, path]) => <Link key={path} to={path} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold transition ${location.pathname === path || (path.includes('automations') && (location.pathname.includes('intents') || location.pathname.includes('siri'))) ? "bg-brand text-paper" : "text-muted-foreground hover:bg-ink/5 hover:text-ink"}`}>{label}</Link>)}</nav></header><main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">{children}</main></div>;
}

function ModelSelector() {
  return <Card><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Sparkles size={13} /> Model selector</div><h2 className="mt-4 font-display text-2xl">Assistant model</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Choose the default model for personal calls, summaries, and automations.</p><select className="mt-5 h-12 w-full rounded-[16px] border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-brand">{models.map((model) => <option key={model}>{model}</option>)}</select></Card>;
}

function HomeView() {
  return <div className="grid gap-6 lg:grid-cols-[1.35fr_.85fr]"><div className="space-y-6"><Card className="p-6 sm:p-8"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Sparkles size={13} /> Personal call concierge</div><h1 className="mt-5 max-w-3xl font-display text-4xl leading-[1.04] tracking-[-0.05em] sm:text-5xl">Assistant handles routine phone work for you.</h1><p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">One Assistant screens calls, places calls, waits on hold, summarizes outcomes, and tells you what needs attention. Siri, widgets, and CarPlay are launch surfaces for the same Assistant.</p><div className="mt-6 flex flex-wrap gap-3"><Link to="/app/personal/assistant" className="rounded-[14px] bg-brand px-5 py-3 text-sm font-semibold text-paper">Open Assistant</Link><Link to="/app/personal/automations" className="rounded-[14px] border border-border bg-background px-5 py-3 text-sm font-semibold text-ink">Tune automations</Link></div></Card><ActivityView compact /></div><div className="space-y-6"><SetupRail /><ModelSelector /></div></div>;
}

function SetupRail() {
  return <Card className="bg-ink text-paper"><div className="text-[11px] font-semibold uppercase tracking-[.14em] text-paper/60">Setup path</div><h2 className="mt-4 font-display text-2xl">Make Assistant useful in five steps.</h2><div className="mt-5 space-y-3">{[["Connect number", "/app/personal/number"], ["Choose model", "/app/personal/settings"], ["Enable automations", "/app/personal/automations"], ["Install devices", "/app/personal/devices"], ["Connect context", "/app/personal/settings"]].map(([title, path], index) => <Link key={title} to={path} className="flex items-center gap-3 rounded-[18px] border border-paper/10 bg-paper/[.035] p-3 text-sm hover:bg-paper/[.06]"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-paper">{index + 1}</span><span className="flex-1 font-semibold text-paper">{title}</span><ChevronRight size={15} className="text-paper/40" /></Link>)}</div></Card>;
}

function AssistantView() {
  return <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-4xl flex-col"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Sparkles size={13} /> Assistant</div><h1 className="mt-4 font-display text-4xl sm:text-5xl">Tell Assistant what phone work to handle.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">No named persona. Assistant is where you ask, review, approve, and hand off.</p><Card className="mt-6 flex flex-1 flex-col"><div className="space-y-4"><div className="max-w-[86%] rounded-[18px] border border-border bg-background p-4 text-sm leading-6">I reviewed your calls. One appointment is confirmed and three unknown callers were blocked.</div><div className="ml-auto max-w-[86%] rounded-[18px] bg-brand p-4 text-sm leading-6 text-paper">Call the office and say I am running 10 minutes late.</div><div className="max-w-[86%] rounded-[18px] border border-border bg-background p-4 text-sm leading-6">Ready. I will keep it brief, ask for confirmation, and report back.</div></div><div className="mt-5 flex items-center gap-3 rounded-[18px] border border-border bg-background px-3 py-2"><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Ask Assistant to call, screen, summarize, wait on hold…" /><button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-paper">Send</button></div></Card></div>;
}

function AutomationsView() {
  return <div className="space-y-6"><div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Wand2 size={13} /> Automations</div><h1 className="mt-4 font-display text-4xl sm:text-5xl">One hub for intents, Siri, widgets, and shortcuts.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">The old Intents and Siri pages now resolve here. Choose what Assistant can do, where it can launch, and what requires confirmation.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{automations.map((title, index) => <Card key={title}><div className="flex items-start justify-between gap-3"><h3 className="font-display text-xl">{title}</h3><span className="rounded-full bg-paper-deep px-2 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{index < 6 ? "Ready" : index < 14 ? "Setup" : "Roadmap"}</span></div><p className="mt-3 text-sm leading-6 text-muted-foreground">Configure launch surfaces, confirmation rules, and personal context for this action.</p></Card>)}</div></div>;
}

function DevicesView() {
  return <div className="space-y-6"><div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Smartphone size={13} /> Devices</div><h1 className="mt-4 font-display text-4xl sm:text-5xl">Every surface launches the same Assistant.</h1></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{["iPhone app", "Siri + App Shortcuts", "Widgets", "Action Button", "Back Tap", "Control Center", "CarPlay", "Apple Watch"].map((name) => <Card key={name}><Smartphone className="text-brand" /><h3 className="mt-4 font-display text-xl">{name}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">A fast entry point into the same personal Assistant workflow.</p></Card>)}</div></div>;
}

function NumberView() {
  return <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><Card><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Phone size={13} /> Number setup</div><h1 className="mt-4 font-display text-4xl">Make handoff reliable.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Assistant needs a callback number and forwarding setup before take-this-call, wait-on-hold, and CarPlay callbacks work cleanly.</p><div className="mt-6 grid gap-4 md:grid-cols-2">{["Wireline number", "Callback number", "Call forwarding", "Allowed contacts"].map((label) => <div key={label}><div className="text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">{label}</div><div className="mt-2 rounded-[16px] border border-border bg-background px-3 py-3 text-sm font-semibold text-ink">Needs setup</div></div>)}</div></Card><Card className="bg-ink text-paper"><PhoneCall className="text-brand-bright" /><h2 className="mt-4 font-display text-2xl">Handoff rule</h2><p className="mt-3 text-sm leading-6 text-paper/55">Assistant asks before transferring sensitive calls or making commitments.</p></Card></div>;
}

function ActivityView({ compact = false }: { compact?: boolean }) {
  const rows = [["Office", "Appointment confirmed", "Done"], ["Unknown caller", "Blocked", "Done"], ["Pharmacy", "Ready before 6 PM", "Needs pickup"], ["Support", "Needs follow-up", "Open"]];
  return <Card><h2 className="font-display text-2xl">Activity</h2><div className="mt-4 divide-y divide-border border border-border">{rows.slice(0, compact ? 3 : rows.length).map(([who, result, status]) => <div key={who} className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto]"><div><p className="font-semibold text-ink">{who}</p><p className="mt-1 text-muted-foreground">{result}</p></div><span className="w-fit rounded-full bg-paper-deep px-3 py-1 text-xs font-semibold text-muted-foreground">{status}</span></div>)}</div></Card>;
}

function SettingsView() {
  return <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><div className="space-y-6"><ModelSelector /><Card><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><ShieldCheck size={13} /> Guardrails</div><h2 className="mt-4 font-display text-2xl">Personal approval rules</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{["Confirm bookings", "Confirm cancellations", "Confirm costs", "Short lock-screen summaries", "Open app for sensitive details", "Report back before next action"].map((rule) => <div key={rule} className="flex items-center gap-3 rounded-[16px] border border-border bg-background p-3 text-sm"><Check className="h-4 w-4 text-brand" /> {rule}</div>)}</div></Card></div><Card><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Mail size={13} /> Personal context</div><h2 className="mt-4 font-display text-2xl">Connect accounts</h2><div className="mt-5 space-y-3">{["Gmail", "Google Calendar", "Outlook", "Yahoo Mail", "Contacts", "Reminders"].map((item) => <button key={item} className="flex w-full items-center justify-between rounded-[16px] border border-border bg-background p-3 text-left text-sm font-semibold text-ink"><span>{item}</span><ChevronRight size={15} className="text-muted-foreground" /></button>)}</div></Card></div>;
}

function PersonalRoutes() {
  return <RequirePersonal><Shell><Routes><Route path="/app/personal" element={<HomeView />} /><Route path="/app/personal/assistant" element={<AssistantView />} /><Route path="/app/personal/automations" element={<AutomationsView />} /><Route path="/app/personal/intents" element={<Navigate to="/app/personal/automations" replace />} /><Route path="/app/personal/siri" element={<Navigate to="/app/personal/automations" replace />} /><Route path="/app/personal/devices" element={<DevicesView />} /><Route path="/app/personal/number" element={<NumberView />} /><Route path="/app/personal/activity" element={<ActivityView />} /><Route path="/app/personal/settings" element={<SettingsView />} /><Route path="*" element={<Navigate to="/app/personal" replace />} /></Routes></Shell></RequirePersonal>;
}

export default function PersonalWorkspace() {
  return <BrowserRouter><PersonalRoutes /></BrowserRouter>;
}
