import { useState } from "react";
import { BrowserRouter, Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Bot, Check, ChevronRight, Database, Headphones, Home, LogOut, Mic, Phone, Radio, ShieldCheck, Sliders, Sparkles, Users, Workflow } from "lucide-react";
import { useAuth } from "./contexts/AuthContext";

const agents = [
  { name: "Sarah", role: "Front desk + appointments", model: "Grok 4.3", voice: "Warm female", number: "(312) 555-0198", status: "Live" },
  { name: "Liam", role: "Inbound sales + demos", model: "Gemini Flash", voice: "Confident male", number: "(312) 555-0142", status: "Live" },
  { name: "Tyler", role: "Technical triage", model: "Claude Sonnet", voice: "Calm neutral", number: "(312) 555-0177", status: "Training" },
];

const models = ["Grok 4.3", "Gemini Flash", "Claude Sonnet", "GPT-5.5 Thinking", "OpenRouter Auto"];
const voices = ["Warm female", "Confident male", "Calm neutral", "Bright support", "Professional receptionist"];
const workflows = ["Answer inbound calls", "Book appointments", "Qualify leads", "Send SMS follow-up", "Create CRM note", "Escalate billing", "Route emergencies", "Transfer to human"];

const nav = [
  ["Assistant", "/app/business"],
  ["Live Ops", "/app/business/live"],
  ["Fleet", "/app/business/fleet"],
  ["Studio", "/app/business/studio"],
  ["Training", "/app/business/training"],
  ["Analytics", "/app/business/analytics"],
  ["Integrations", "/app/business/integrations"],
  ["Settings", "/app/business/settings"],
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-white/10 bg-white/[.045] p-5 shadow-[0_24px_80px_-62px_rgba(0,0,0,.9)] ${className}`}>{children}</section>;
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold uppercase tracking-[.16em] text-white/35">{label}</span>{children ?? <input defaultValue={value} className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-black/20 px-3 text-sm text-paper outline-none focus:border-brand-bright" />}</label>;
}

function RequireStudio({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center bg-ink text-paper"><Sparkles className="h-5 w-5 animate-pulse text-brand-bright" /></div>;
  if (!user) return <Navigate to={`/signin?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function StudioShell() {
  const [agentIndex, setAgentIndex] = useState(0);
  const [model, setModel] = useState(agents[0].model);
  const [voice, setVoice] = useState(agents[0].voice);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const agent = agents[agentIndex];

  return <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-ink text-paper">
    <aside className="hidden w-60 shrink-0 flex-col border-r border-white/10 bg-[#160f24] p-4 lg:flex"><Link to="/" className="mb-8 inline-flex items-center gap-2 px-2 pt-2"><span className="grid h-7 w-7 place-items-center rounded-[10px] bg-brand">W</span><span className="font-display text-[19px] font-semibold">Wireline</span></Link><div className="mb-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-white/60">Business workspace</div><nav className="flex flex-1 flex-col gap-1">{nav.map(([label, path]) => <Link key={path} to={path} className={`flex items-center gap-3 px-3 py-2.5 text-[13px] transition ${path === "/app/business/studio" ? "bg-brand text-paper" : "text-paper/60 hover:bg-paper/5 hover:text-paper"}`}>{label}</Link>)}</nav><div className="border-t border-paper/10 pt-4 text-xs text-paper/50"><div className="truncate">{user?.email ?? "Owner"}</div><button onClick={() => { void signOut(); navigate("/"); }} className="mt-3 inline-flex items-center gap-2 text-paper/50 hover:text-paper"><LogOut size={14} /> Sign out</button></div></aside>
    <div className="min-w-0 flex-1"><header className="sticky top-0 z-30 border-b border-white/10 bg-ink/92 backdrop-blur"><div className="flex h-14 items-center justify-between px-4 sm:px-6"><div className="flex items-center gap-3"><Link to="/app/business/live" className="lg:hidden"><Home size={18} /></Link><span className="font-mono text-[11px] uppercase tracking-[.16em] text-brand-bright">Agent Studio</span></div><Link to="/app/business/training" className="hidden rounded-[14px] border border-white/10 px-3 py-2 text-sm text-paper/70 hover:text-paper sm:inline-flex">Open Training</Link></div><div className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2 lg:hidden">{nav.map(([label, path]) => <Link key={path} to={path} className={`shrink-0 px-3 py-1.5 text-[12px] ${path === "/app/business/studio" ? "text-brand-bright" : "text-paper/45"}`}>{label}</Link>)}</div></header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4"><div><span className="text-[11px] font-bold uppercase tracking-[.18em] text-brand-bright">Fleet selector</span><h1 className="mt-2 font-display text-3xl">Pick an agent.</h1><p className="mt-2 text-sm leading-6 text-paper/50">Studio starts with who this agent is. Training handles what it knows.</p></div>{agents.map((item, index) => <button key={item.name} onClick={() => { setAgentIndex(index); setModel(item.model); setVoice(item.voice); }} className={`w-full rounded-[22px] border p-4 text-left transition ${agentIndex === index ? "border-brand-bright bg-brand/18" : "border-white/10 bg-white/[.035] hover:bg-white/[.06]"}`}><div className="flex items-center justify-between gap-3"><span className="font-display text-2xl">{item.name}</span><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[.14em] text-paper/55">{item.status}</span></div><p className="mt-1 text-sm text-paper/48">{item.role}</p><p className="mt-3 text-xs text-paper/35">{item.model} · {item.voice}</p></button>)}<Link to="/app/business/fleet" className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/[.035] p-4 text-sm text-paper/65 hover:text-paper"><span>Manage full fleet</span><ChevronRight size={15} /></Link></div>
        <div className="space-y-6"><Card className="p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div><div className="inline-flex items-center gap-2 rounded-full border border-brand/35 bg-brand/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-brand-bright"><Sliders size={13} /> Basic setup</div><h2 className="mt-5 font-display text-4xl sm:text-5xl">{agent.name}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-paper/55">Configure identity, model, voice, phone number, workflows, and handoff. Keep scripts and docs out of Studio so setup stays obvious.</p></div><Link to="/app/business/training" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[14px] bg-paper px-4 text-sm font-semibold text-ink">Train agent <ArrowRight size={15} /></Link></div><div className="mt-7 grid gap-4 md:grid-cols-2"><Field label="Agent name" value={agent.name} /><Field label="Primary role" value={agent.role} /><Field label="Model"><select value={model} onChange={(e) => setModel(e.target.value)} className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-black/20 px-3 text-sm text-paper outline-none focus:border-brand-bright">{models.map((item) => <option key={item} className="bg-ink">{item}</option>)}</select></Field><Field label="Voice"><select value={voice} onChange={(e) => setVoice(e.target.value)} className="mt-2 h-12 w-full rounded-[16px] border border-white/10 bg-black/20 px-3 text-sm text-paper outline-none focus:border-brand-bright">{voices.map((item) => <option key={item} className="bg-ink">{item}</option>)}</select></Field><Field label="Phone number" value={agent.number} /><Field label="Response style" value="Concise, warm, never overpromise" /></div></Card>
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]"><Card><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-brand-bright"><Workflow size={13} /> Workflow access</div><h3 className="mt-4 font-display text-2xl">What this agent can do</h3><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{workflows.map((item, index) => <button key={item} className={`rounded-[16px] border p-3 text-left text-sm ${index < 5 ? "border-brand/35 bg-brand/12 text-paper" : "border-white/10 bg-white/[.035] text-paper/55"}`}><Check className={`mb-3 h-4 w-4 ${index < 5 ? "text-brand-bright" : "text-paper/30"}`} />{item}</button>)}</div></Card><Card><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-brand-bright"><ShieldCheck size={13} /> Handoff rules</div><div className="mt-5 space-y-3 text-sm text-paper/65">{["Transfer urgent callers immediately", "Ask before refund or discount promises", "Escalate low-confidence answers", "Summarize every handled call"].map((item) => <div key={item} className="rounded-[16px] border border-white/10 bg-black/15 p-3">{item}</div>)}</div></Card></div>
          <div className="grid gap-5 md:grid-cols-3"><Card><Bot className="text-brand-bright" /><h3 className="mt-4 font-display text-2xl">Studio</h3><p className="mt-2 text-sm leading-6 text-paper/50">Name, role, model, voice, number, workflows, handoff.</p></Card><Card><Database className="text-brand-bright" /><h3 className="mt-4 font-display text-2xl">Training</h3><p className="mt-2 text-sm leading-6 text-paper/50">Policies, scripts, scenarios, FAQs, objection handling.</p></Card><Card><Radio className="text-brand-bright" /><h3 className="mt-4 font-display text-2xl">Live Ops</h3><p className="mt-2 text-sm leading-6 text-paper/50">Calls in progress, coaching, escalations, quality pulse.</p></Card></div>
        </div>
      </div></main>
    </div>
  </div>;
}

export default function AgentStudioWorkspace() {
  return <BrowserRouter><RequireStudio><StudioShell /></RequireStudio></BrowserRouter>;
}
