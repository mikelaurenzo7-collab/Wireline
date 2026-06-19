import React, { useState } from "react";
import {
  Bot,
  Brain,
  CalendarDays,
  Database,
  FolderOpen,
  Headphones,
  LayoutDashboard,
  Mic,
  Phone,
  Play,
  Plus,
  Rocket,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import "../styles/stitch-studio.css";

export interface AgentStudioCanvasProps {
  agentId: string;
  agentName: string;
  onPublish?: () => void;
}

type Mode = "architect" | "roster" | "voice";
type Field = { label: string; value: string; area?: boolean; options?: string[] };
type Section = { title: string; eyebrow: string; icon: React.ElementType; fields: Field[] };

const inputClass = "w-full rounded-xl border border-white/10 bg-[#101013] px-3.5 py-3 text-sm text-[#f4f2f7] outline-none placeholder:text-[#747374] focus:border-[#5d5cff]/70 focus:ring-2 focus:ring-[#5d5cff]/20";

const sections: Section[] = [
  {
    title: "Identity & Persona",
    eyebrow: "Who this agent is",
    icon: Bot,
    fields: [
      { label: "Agent Name", value: "Front Desk" },
      { label: "Role / Title", value: "Dental Receptionist" },
      {
        label: "System Prompt / Persona",
        value:
          "You are a helpful, friendly receptionist for a dental clinic. Help patients schedule appointments and answer basic questions about hours, location, insurance, and next steps.",
        area: true,
      },
    ],
  },
  {
    title: "Logic & Intelligence",
    eyebrow: "How the agent thinks",
    icon: Brain,
    fields: [
      {
        label: "Base Model",
        value: "GPT-4o optimized for voice",
        options: ["GPT-4o optimized for voice", "Gemini Flash", "Grok 4.3", "Claude Sonnet"],
      },
    ],
  },
  {
    title: "Connectivity",
    eyebrow: "How the agent reaches people",
    icon: Headphones,
    fields: [
      {
        label: "Voice Provider",
        value: "ElevenLabs — Rachel",
        options: ["ElevenLabs — Rachel", "OpenAI Voice — Nova", "Vapi Default"],
      },
      { label: "Inbound Number", value: "Assign phone number" },
    ],
  },
];

const intents = [
  { icon: CalendarDays, label: "Schedule appointment", badge: "API linked" },
  { icon: Database, label: "Answer FAQ", badge: "Knowledge base" },
  { icon: ShieldCheck, label: "Escalate urgent request", badge: "Safety" },
];

const roster = [
  { name: "Nova", role: "Sales", status: "Live", success: "94.2%", calls: "1,248" },
  { name: "Atlas", role: "Support", status: "Training", success: "88.7%", calls: "412" },
  { name: "Echo", role: "Front Desk", status: "Draft", success: "61.9%", calls: "23" },
];

function Tile({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="stitch-icon-tile">
      <Icon className="h-5 w-5" />
    </div>
  );
}

function TopButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-2 rounded-xl border border-[#5d5cff]/45 bg-[#5d5cff]/14 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_30px_rgba(93,92,255,0.2)]"
          : "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-medium text-[#c7c4d8] hover:bg-white/[0.07] hover:text-white"
      }
    >
      {children}
    </button>
  );
}

function FieldControl({ field }: { field: Field }) {
  if (field.area) {
    return <textarea className={`${inputClass} min-h-[98px] resize-none leading-relaxed`} defaultValue={field.value} />;
  }
  if (field.options) {
    return (
      <select className={`${inputClass} appearance-none`} defaultValue={field.value}>
        {field.options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  }
  return <input className={inputClass} defaultValue={field.value} />;
}

function ConfigCard({ section }: { section: Section }) {
  return (
    <section className="stitch-panel p-5 xl:p-6">
      <div className="mb-5 flex items-center gap-3">
        <Tile icon={section.icon} />
        <div>
          <p className="stitch-kicker">{section.eyebrow}</p>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-white">{section.title}</h3>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {section.fields.map((field) => (
          <label key={field.label} className={field.area ? "md:col-span-2" : ""}>
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-[#b1b5bf]">
              {field.label}
            </span>
            <FieldControl field={field} />
          </label>
        ))}
      </div>
      {section.title === "Logic & Intelligence" && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-[#101013]/90 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="stitch-kicker">Core intents</p>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-[#c1c1ff]">
              <Plus className="h-3.5 w-3.5" /> Add intent
            </button>
          </div>
          <div className="space-y-2">
            {intents.map((intent) => {
              const Icon = intent.icon;
              return (
                <div key={intent.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3.5 py-3">
                  <div className="flex items-center gap-3 text-sm text-[#f4f2f7]">
                    <Icon className="h-4 w-4 text-[#c1c1ff]" />
                    {intent.label}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#b1b5bf]">
                      {intent.badge}
                    </span>
                    <Trash2 className="h-3.5 w-3.5 text-[#747374]" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function CoachPanel() {
  return (
    <section className="flex min-h-0 flex-col border-r border-white/10 bg-[#131315]/72 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Tile icon={Bot} />
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">The Coach</h2>
            <p className="stitch-kicker">AI architect assistant</p>
          </div>
        </div>
      </div>
      <div className="wireline-stitch-scroll flex-1 space-y-6 overflow-y-auto p-5 lg:p-6">
        <div className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[#747374]">
          Session started
          <br />
          <span className="normal-case tracking-normal">Today, 9:41 AM</span>
        </div>
        <Bubble text="Let's build a new agent. What role should this agent play for your business?" />
        <Bubble user text="I need a front-desk receptionist for my dental clinic. They should handle appointment scheduling and basic FAQ." />
        <Bubble actions text="Got it. I've initialized the drafting board with a clean starter template. Next we name the agent, choose the voice, connect scheduling, and test the opening line." />
      </div>
      <div className="border-t border-white/5 bg-[#0f0f12]/92 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {["Add intent", "Set voice", "Link API"].map((label) => (
            <button key={label} type="button" className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-[#c7c4d8]">
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[#c1c1ff]" aria-label="Add instruction">
            <Plus className="h-4 w-4" />
          </button>
          <input className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-[#747374]" placeholder="Tell Coach what to build..." />
          <Mic className="h-4 w-4 text-[#c7c4d8]" />
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c1c1ff] text-[#1500a8]" aria-label="Send instruction">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function Bubble({ text, user, actions }: { text: string; user?: boolean; actions?: boolean }) {
  return (
    <div className={user ? "flex justify-end" : "flex justify-start"}>
      <div className={user ? "flex max-w-[92%] flex-row-reverse gap-3" : "flex max-w-[92%] gap-3"}>
        <div className={user ? "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5d5cff] text-xs font-bold text-white" : "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[#c1c1ff]"}>
          {user ? "ML" : <Bot className="h-4 w-4" />}
        </div>
        <div className={user ? "rounded-2xl rounded-tr-md border border-[#5d5cff]/28 bg-[#5d5cff]/16 p-4 text-sm leading-relaxed text-white" : "rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.06] p-4 text-sm leading-relaxed text-[#f4f2f7]"}>
          <p className="max-w-none">{text}</p>
          {actions && (
            <div className="mt-4 flex flex-wrap gap-2">
              {["Name: Sarah", "Set voice", "Link scheduling"].map((action) => (
                <button key={action} type="button" className="inline-flex items-center gap-1 rounded-full border border-[#5d5cff]/35 bg-[#5d5cff]/8 px-3 py-1.5 text-xs font-semibold text-[#c1c1ff]">
                  <Plus className="h-3.5 w-3.5" /> {action}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BoardHeader({ title, agentName, agentId, onPublish }: AgentStudioCanvasProps & { title: string }) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <p className="stitch-kicker mb-2">Configuring</p>
        <div className="mb-2 flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-[-0.045em] text-white">{title}</h1>
          <span className="rounded-md border border-white/10 bg-white/[0.07] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#b1b5bf]">
            Draft
          </span>
        </div>
        <p className="max-w-none text-sm text-[#c7c4d8]">
          {agentName || "New Agent"}
          <span className="ml-2 font-mono text-[11px] text-[#747374]">{agentId}</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="rounded-xl border border-white/10 bg-[#0a0a0c] px-4 py-2.5 text-sm font-semibold text-white">
          Discard
        </button>
        <button type="button" onClick={onPublish} className="inline-flex items-center gap-2 rounded-xl border border-[#5d5cff]/55 bg-[#5d5cff] px-5 py-2.5 text-sm font-semibold text-white">
          <Rocket className="h-4 w-4" /> Deploy Agent
        </button>
      </div>
    </div>
  );
}

function ArchitectBoard(props: AgentStudioCanvasProps) {
  return (
    <div className="space-y-6">
      <BoardHeader title="Drafting Board" {...props} />
      {sections.map((section) => (
        <ConfigCard key={section.title} section={section} />
      ))}
      <section className="stitch-panel p-5 xl:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Tile icon={Workflow} />
            <div>
              <p className="stitch-kicker">Workflow path</p>
              <h3 className="text-lg font-semibold text-white">Call Flow</h3>
            </div>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm text-[#f4f2f7]">
            <Save className="h-4 w-4" /> Save Snapshot
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {["Greeting", "Qualify need", "Schedule", "Confirm + log"].map((step, index) => (
            <div key={step} className="rounded-2xl border border-white/10 bg-[#0a0a0c] p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#5d5cff]/14 text-[#c1c1ff]">{index + 1}</div>
              <p className="font-semibold text-white">{step}</p>
              <p className="mt-1 max-w-none text-xs leading-relaxed text-[#908fa1]">Coach-reviewed default for safe voice calls.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0a0c] p-3">
      <p className="stitch-kicker">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-white">{value}</p>
    </div>
  );
}

function RosterBoard() {
  return (
    <div className="space-y-6">
      <BoardHeader title="Roster Management" agentId="active-roster" agentName="The Starters" />
      <div className="grid gap-4 xl:grid-cols-3">
        {roster.map((agent) => (
          <article key={agent.name} className="stitch-panel p-5">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Tile icon={Bot} />
                <div>
                  <h3 className="font-semibold text-white">{agent.name}</h3>
                  <p className="text-sm text-[#908fa1]">{agent.role}</p>
                </div>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-[#c7c4d8]">{agent.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Success" value={agent.success} />
              <Metric label="Calls" value={agent.calls} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function VoiceBoard({ agentName }: { agentName: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.82fr]">
      <section className="stitch-panel p-6">
        <div className="mb-5 flex items-center gap-3">
          <Tile icon={Mic} />
          <div>
            <p className="stitch-kicker">Voice test</p>
            <h3 className="text-lg font-semibold text-white">Call Simulation</h3>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0a0a0c] p-5">
          <p className="max-w-none text-sm leading-relaxed text-[#f4f2f7]">
            “Hi, this is {agentName || "Wireline"}. I’m calling about your recent inquiry and can help you schedule a time that works.”
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button type="button" className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5d5cff] text-white" aria-label="Play voice sample">
              <Play className="h-5 w-5" />
            </button>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full w-2/3 rounded-full bg-[#c1c1ff]" />
            </div>
            <span className="font-mono text-xs text-[#908fa1]">00:18</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="Energy" value="82%" />
          <Metric label="Warmth" value="91%" />
          <Metric label="Pace" value="0.95x" />
        </div>
      </section>
      <ConfigCard section={sections[2]} />
    </div>
  );
}

export default function AgentStudioCanvas({ agentId, agentName, onPublish }: AgentStudioCanvasProps) {
  const [mode, setMode] = useState<Mode>("architect");
  const board =
    mode === "roster" ? (
      <RosterBoard />
    ) : mode === "voice" ? (
      <VoiceBoard agentName={agentName} />
    ) : (
      <ArchitectBoard agentId={agentId} agentName={agentName} onPublish={onPublish} />
    );

  return (
    <div className="relative h-full min-h-[720px] overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0c] text-[#e4e2e4] shadow-[0_40px_120px_-70px_rgba(0,0,0,0.95)]">
      <div className="wireline-stitch-grid absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(93,92,255,0.16),transparent_62%)]" aria-hidden="true" />
      <div className="relative z-10 flex h-full flex-col">
        <header className="flex min-h-20 items-center justify-between border-b border-white/5 bg-[#0a0a0c]/75 px-5 backdrop-blur-xl lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <div className="text-xl font-bold tracking-[-0.04em] text-[#c1c1ff] lg:text-2xl">Wireline</div>
            <div className="hidden h-6 w-px bg-white/10 sm:block" />
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#c7c4d8] lg:text-base">
              <Headphones className="h-4 w-4 text-[#c1c1ff]" />
              <span className="truncate">{agentName || "New Agent"}</span>
              <span className="h-2 w-2 rounded-full bg-[#c1c1ff] shadow-[0_0_14px_rgba(193,193,255,0.7)]" />
            </div>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <TopButton active={mode === "roster"} onClick={() => setMode("roster")}>
              <FolderOpen className="h-4 w-4" /> Locker
            </TopButton>
            <TopButton active={mode === "architect"} onClick={() => setMode("architect")}>
              <Workflow className="h-4 w-4" /> Workflow
            </TopButton>
            <button type="button" onClick={() => setMode("voice")} className="inline-flex items-center gap-2 rounded-xl border border-[#5d5cff]/55 bg-[#5d5cff] px-5 py-2.5 text-sm font-semibold text-white">
              <Play className="h-4 w-4" /> Test Voice
            </button>
          </div>
        </header>
        <div className="border-b border-white/5 bg-[#0d0d10]/80 px-4 py-3 md:hidden">
          <div className="wireline-stitch-scroll flex gap-2 overflow-x-auto">
            {(["architect", "roster", "voice"] as Mode[]).map((id) => (
              <button key={id} type="button" onClick={() => setMode(id)} className={id === mode ? "shrink-0 rounded-xl bg-[#5d5cff] px-3 py-2 text-xs font-semibold text-white" : "shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-[#c7c4d8]"}>
                {id === "roster" ? "Locker" : id}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-1 min-h-0">
          <aside className="hidden w-20 shrink-0 flex-col items-center border-r border-white/10 bg-[#131315]/80 py-5 lg:flex">
            <Tile icon={Sparkles} />
            <nav className="mt-8 flex flex-1 flex-col gap-3">
              {[
                { id: "architect", icon: LayoutDashboard },
                { id: "roster", icon: Users },
                { id: "voice", icon: Phone },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} type="button" onClick={() => setMode(item.id as Mode)} className={mode === item.id ? "flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] text-[#c1c1ff]" : "flex h-12 w-12 items-center justify-center rounded-2xl text-[#908fa1] hover:bg-white/[0.05] hover:text-white"}>
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </nav>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5d5cff] text-xs font-bold text-white">ML</div>
          </aside>
          <main className="grid flex-1 min-w-0 grid-cols-1 xl:grid-cols-[minmax(360px,0.42fr)_minmax(560px,0.58fr)]">
            <CoachPanel />
            <section className="wireline-stitch-scroll min-h-0 overflow-y-auto bg-[#131315]/45 p-5 backdrop-blur-sm lg:p-8">{board}</section>
          </main>
        </div>
      </div>
    </div>
  );
}
