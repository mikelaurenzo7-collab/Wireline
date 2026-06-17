import { useState, type ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Activity, Check, ChevronRight, Clock, Headphones, Home, LogOut, Mail, Mic, Phone, PhoneCall, Settings, ShieldCheck, Smartphone, Sparkles, Wand2 } from "lucide-react";
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

const models = [
  ["Grok 4.3", "Default", "Fast, capable, low-cost default for everyday phone work."],
  ["Gemini Flash", "Fast", "Best for quick errands, simple summaries, and lightweight routing."],
  ["Claude Sonnet", "Careful", "Best for polished wording, sensitive replies, and nuanced calls."],
  ["GPT-5.5 Thinking", "Deep", "Best for complex planning, multi-step decisions, and high-trust workflows."],
  ["Auto route", "Smart", "Wireline chooses the best model by task, urgency, and cost."],
];

const automationGroups = [
  {
    name: "Calls",
    text: "Let Assistant place, screen, wait, and call back without making the user hunt for the right trigger.",
    items: [
      ["Ask Assistant", "Open the command surface and ask what needs attention.", "App, Siri, widget", "Ready"],
      ["Place a call", "Give Assistant a number, contact, or business and a short message.", "App, Siri, Action Button", "Ready"],
      ["Call a contact", "Use saved contacts with confirmation before dialing.", "Siri, Contacts", "Setup"],
      ["Call a business", "Pharmacies, restaurants, offices, schools, support lines.", "App, Siri", "Setup"],
      ["Wait on hold", "Assistant waits and brings you back when a human answers.", "App, Siri", "Ready"],
      ["Take this call", "Hand off eligible incoming calls to Assistant.", "CallKit, Siri", "Ready"],
      ["Call back missed call", "Return the last relevant missed call safely.", "CarPlay-safe", "Ready"],
    ],
  },
  {
    name: "Scheduling",
    text: "Appointments need guardrails, confirmations, and calendar context before Assistant commits.",
    items: [
      ["Reschedule", "Move an appointment and report back with the confirmed time.", "Siri, app", "Setup"],
      ["Book appointment", "Collect options, choose a time window, then ask before booking.", "Guided flow", "Setup"],
      ["Cancel appointment", "Always confirm before cancellation, fees, or irreversible actions.", "Guided flow", "Setup"],
      ["Add reminder", "Turn a call outcome into a reminder or calendar follow-up.", "Calendar, reminders", "Setup"],
    ],
  },
  {
    name: "Follow-up",
    text: "Summaries, status checks, recaps, and attention queues make the product feel useful every day.",
    items: [
      ["Check status", "Ask about prescriptions, orders, refunds, availability, or paperwork.", "App, Siri", "Ready"],
      ["Summarize last call", "Get the short version first, open the app for details.", "Siri, Activity", "Ready"],
      ["What needs attention", "Show unresolved calls, approvals, and follow-ups.", "Siri, widget", "Ready"],
      ["Send recap", "Send the outcome to yourself by push, email, or text.", "Email, notification", "Setup"],
      ["Mark followed up", "Close a resolved task from the Activity queue.", "App, Siri", "Roadmap"],
    ],
  },
];

const deviceGroups = [
  ["Core", [["iPhone app", "Primary setup, Assistant, calls, number, and activity.", "Ready"], ["Siri + App Shortcuts", "Voice entry for call, handoff, recap, and attention checks.", "Configure"], ["Widgets", "Home and Lock Screen shortcuts for Assistant and follow-ups.", "Configure"]]],
  ["Fast triggers", [["Action Button", "Assign Ask Assistant on supported iPhones.", "Manual"], ["Back Tap", "Accessibility-friendly shortcut for fast entry.", "Manual"], ["Control Center", "Quick launch tile through iOS Shortcuts.", "Manual"]]],
  ["Driving + wearable", [["CarPlay", "Recent callbacks, active-call handoff, and line visibility only.", "Entitlement gated"], ["Apple Watch", "Glanceable Ask Assistant and call handoff triggers.", "Roadmap"]]],
];

const activityRows = [["Office", "Appointment confirmed for Thursday at 2 PM", "Done"], ["Unknown caller", "Blocked and archived", "Done"], ["Pharmacy", "Prescription ready before 6 PM", "Needs pickup"], ["Support", "Refund still needs follow-up", "Open"]];

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-border bg-card p-5 shadow-[0_20px_70px_-56px_rgba(26,22,20,.65)] ${className}`}>{children}</section>;
}

function Status({ value }: { value: string }) {
  const tone = value === "Ready" ? "bg-brand/10 text-brand" : value === "Setup" || value === "Configure" ? "bg-paper-deep text-ink" : "bg-ink/5 text-muted-foreground";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${tone}`}>{value}</span>;
}

function RequirePersonal({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center bg-background"><Sparkles className="h-5 w-5 animate-pulse text-brand" /></div>;
  if (!user) return <Navigate to={`/signin?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  return <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background text-ink wl-grain"><header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"><Link to="/" className="inline-flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-paper">W</span><span className="font-display text-[20px] font-semibold tracking-[-0.03em] text-ink">Wireline</span></Link><div className="flex items-center gap-3"><span className="hidden rounded-full border border-brand/20 bg-brand/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand sm:inline-flex">Personal workspace</span><span className="grid h-9 w-9 place-items-center rounded-full bg-brand font-display text-paper">{user?.email?.[0]?.toUpperCase() ?? "W"}</span><button onClick={() => { void signOut(); navigate("/"); }} className="text-muted-foreground hover:text-ink"><LogOut size={17} /></button></div></div><nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-3 sm:px-6 lg:px-8">{nav.map(([label, path]) => <Link key={path} to={path} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold transition ${location.pathname === path || (path.includes("automations") && (location.pathname.includes("intents") || location.pathname.includes("siri"))) ? "bg-brand text-paper" : "text-muted-foreground hover:bg-ink/5 hover:text-ink"}`}>{label}</Link>)}</nav></header><main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">{children}</main></div>;
}

function ModelSelector() {
  const [model, setModel] = useState(models[0][0]);
  const selected = models.find((item) => item[0] === model) ?? models[0];
  return <Card><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Sparkles size={13} /> Model selector</div><div className="mt-4 flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl">Assistant model</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Choose the default model for personal calls, summaries, and automations.</p></div><Status value={selected[1]} /></div><select value={model} onChange={(e) => setModel(e.target.value)} className="mt-5 h-12 w-full rounded-[16px] border border-border bg-background px-3 text-sm font-semibold outline-none focus:border-brand">{models.map(([name]) => <option key={name}>{name}</option>)}</select><p className="mt-3 rounded-[16px] bg-paper-deep p-3 text-sm leading-6 text-muted-foreground">{selected[2]}</p></Card>;
}

function HomeView() {
  return <div className="grid gap-6 lg:grid-cols-[1.35fr_.85fr]"><div className="space-y-6"><Card className="p-6 sm:p-8"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Sparkles size={13} /> Personal call concierge</div><h1 className="mt-5 max-w-3xl font-display text-4xl leading-[1.04] tracking-[-0.05em] sm:text-5xl">Assistant handles routine phone work for you.</h1><p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">One Assistant screens calls, places calls, waits on hold, summarizes outcomes, and tells you what needs attention. Siri, widgets, and CarPlay are launch surfaces for the same Assistant.</p><div className="mt-6 flex flex-wrap gap-3"><Link to="/app/personal/assistant" className="rounded-[14px] bg-brand px-5 py-3 text-sm font-semibold text-paper">Open Assistant</Link><Link to="/app/personal/automations" className="rounded-[14px] border border-border bg-background px-5 py-3 text-sm font-semibold text-ink">Tune automations</Link></div></Card><ActivityView compact /></div><div className="space-y-6"><SetupRail /><ModelSelector /></div></div>;
}

function SetupRail() {
  const steps = [["Connect number", "/app/personal/number", "Needed for callbacks and handoff"], ["Choose model", "/app/personal/settings", "Default intelligence for personal work"], ["Enable automations", "/app/personal/automations", "Pick call jobs and confirmations"], ["Install devices", "/app/personal/devices", "Siri, widgets, shortcuts, CarPlay"], ["Connect context", "/app/personal/settings", "Email, calendar, contacts, reminders"]];
  return <Card className="bg-ink text-paper"><div className="text-[11px] font-semibold uppercase tracking-[.14em] text-paper/60">Setup path</div><h2 className="mt-4 font-display text-2xl">Make Assistant useful in five steps.</h2><div className="mt-5 space-y-3">{steps.map(([title, path, note], index) => <Link key={title} to={path} className="flex items-center gap-3 rounded-[18px] border border-paper/10 bg-paper/[.035] p-3 text-sm hover:bg-paper/[.06]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-paper">{index + 1}</span><span className="min-w-0 flex-1"><span className="block font-semibold text-paper">{title}</span><span className="block text-xs leading-5 text-paper/45">{note}</span></span><ChevronRight size={15} className="text-paper/40" /></Link>)}</div></Card>;
}

function AssistantView() {
  return <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-4xl flex-col"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Sparkles size={13} /> Assistant</div><h1 className="mt-4 font-display text-4xl sm:text-5xl">Tell Assistant what phone work to handle.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">No named persona. Assistant is where you ask, review, approve, and hand off.</p><Card className="mt-6 flex flex-1 flex-col"><div className="space-y-4"><div className="max-w-[86%] rounded-[18px] border border-border bg-background p-4 text-sm leading-6">I reviewed your calls. One appointment is confirmed and three unknown callers were blocked.</div><div className="ml-auto max-w-[86%] rounded-[18px] bg-brand p-4 text-sm leading-6 text-paper">Call the office and say I am running 10 minutes late.</div><div className="max-w-[86%] rounded-[18px] border border-border bg-background p-4 text-sm leading-6">Ready. I will keep it brief, ask for confirmation, and report back.</div></div><div className="mt-5 flex flex-wrap gap-2">{["What needs attention?", "Wait on hold", "Call back missed call", "Summarize last call"].map((item) => <button key={item} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-brand">{item}</button>)}</div><div className="mt-5 flex items-center gap-3 rounded-[18px] border border-border bg-background px-3 py-2"><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Ask Assistant to call, screen, summarize, wait on hold…" /><button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-paper">Send</button></div></Card></div>;
}

function AutomationsView() {
  return <div className="space-y-8"><div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Wand2 size={13} /> Automations</div><h1 className="mt-4 font-display text-4xl sm:text-5xl">One hub for calls, scheduling, and follow-up.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Siri, widgets, shortcuts, and the app all launch the same Assistant. Enable the job here; choose the launch surface on Devices.</p></div>{automationGroups.map((group) => <section key={group.name} className="space-y-4"><div className="flex flex-col justify-between gap-2 border-t border-border pt-5 sm:flex-row sm:items-end"><div><h2 className="font-display text-2xl">{group.name}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{group.text}</p></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{group.items.map(([title, detail, surface, status]) => <Card key={title}><div className="flex items-start justify-between gap-3"><h3 className="font-display text-xl">{title}</h3><Status value={status} /></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p><p className="mt-4 rounded-[14px] bg-background p-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-ink">Surface:</span> {surface}</p></Card>)}</div></section>)}</div>;
}

function DevicesView() {
  return <div className="space-y-8"><div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Smartphone size={13} /> Devices</div><h1 className="mt-4 font-display text-4xl sm:text-5xl">Every surface launches the same Assistant.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Keep the mental model simple: Assistant is the brain, Automations are the jobs, Devices are the launch surfaces.</p></div>{deviceGroups.map(([group, items]) => <section key={group as string} className="space-y-4"><h2 className="font-display text-2xl">{group as string}</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(items as string[][]).map(([name, detail, status]) => <Card key={name}><Smartphone className="text-brand" /><div className="mt-4 flex items-start justify-between gap-3"><h3 className="font-display text-xl">{name}</h3><Status value={status} /></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p></Card>)}</div></section>)}</div>;
}

function NumberView() {
  return <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><Card><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-brand"><Phone size={13} /> Number setup</div><h1 className="mt-4 font-display text-4xl">Make handoff reliable.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Assistant needs a callback number and forwarding setup before take-this-call, wait-on-hold, and CarPlay callbacks work cleanly.</p><div className="mt-6 grid gap-4 md:grid-cols-2">{["Wireline number", "Callback number", "Call forwarding", "Allowed contacts"].map((label) => <div key={label}><div className="text-[11px] font-bold uppercase tracking-[.16em] text-muted-foreground">{label}</div><div className="mt-2 rounded-[16px] border border-border bg-background px-3 py-3 text-sm font-semibold text-ink">Needs setup</div></div>)}</div></Card><Card className="bg-ink text-paper"><PhoneCall className="text-brand-bright" /><h2 className="mt-4 font-display text-2xl">Handoff rule</h2><p className="mt-3 text-sm leading-6 text-paper/55">Assistant asks before transferring sensitive calls or making commitments.</p></Card></div>;
}

function ActivityView({ compact = false }: { compact?: boolean }) {
  return <Card><h2 className="font-display text-2xl">Activity</h2><div className="mt-4 divide-y divide-border border border-border">{activityRows.slice(0, compact ? 3 : activityRows.length).map(([who, result, status]) => <div key={who} className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto]"><div><p className="font-semibold text-ink">{who}</p><p className="mt-1 text-muted-foreground">{result}</p></div><span className="w-fit rounded-full bg-paper-deep px-3 py-1 text-xs font-semibold text-muted-foreground">{status}</span></div>)}</div></Card>;
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
