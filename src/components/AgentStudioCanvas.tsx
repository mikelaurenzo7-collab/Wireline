import React, { useMemo, useState } from "react";
import {
  Bot,
  Brain,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Database,
  FolderOpen,
  Headphones,
  LayoutDashboard,
  Mic,
  MoreVertical,
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
  Zap,
} from "lucide-react";
import "../styles/stitch-studio.css";

interface AgentStudioCanvasProps {
  agentId: string;
  agentName: string;
  onPublish?: () => void;
}

type BoardMode = "architect" | "locker" | "voice";

type DraftField = {
  label: string;
  value: string;
  kind?: "input" | "textarea" | "select";
  options?: string[];
};

type DraftSection = {
  title: string;
  kicker: string;
  icon: React.ElementType;
  fields: DraftField[];
};

const chatTranscript = [
  {
    from: "coach",
    text: "Let's build a new agent. What role should this agent play for your business?",
  },
  {
    from: "user",
    text: "I need a front-desk receptionist for my dental clinic. They should handle appointment scheduling and basic FAQ.",
  },
  {
    from: "coach",
    text: "Got it. I've initialized the drafting board on the right with a clean starter template. Next we name the agent, choose the voice, and connect scheduling.",
    actions: ["Name: Sarah, friendly", "Voice: professional", "Add scheduling API"],
  },
];

const draftSections: DraftSection[] = [
  {
    title: "Identity & Persona",
    kicker: "Who this agent is",
    icon: Bot,
    fields: [
      { label: "Agent Name", value: "Front Desk" },
      { label: "Role / Title", value: "Dental Receptionist" },
      {
        label: "System Prompt / Persona",
        value:
          "You are a helpful, friendly receptionist for a dental clinic. Your primary goal is to help patients schedule appointments and answer basic questions about operating hours, location, insurance, and next steps.",
        kind: "textarea",
      },
    ],
  },
  {
    title: "Logic & Intelligence",
    kicker: "How the agent thinks",
    icon: Brain,
    fields: [
      {
        label: "Base Model",
        value: "GPT-4o optimized for voice",
        kind: "select",
        options: ["GPT-4o optimized for voice", "Gemini Flash", "Grok 4.3", "Claude Sonnet"],
      },
    ],
  },
  {
    title: "Connectivity",
    kicker: "How the agent reaches people",
    icon: Headphones,
    fields: [
      {
        label: "Voice Provider",
        value: "ElevenLabs — Rachel",
        kind: "select",
        options: ["ElevenLabs — Rachel", "OpenAI Voice — Nova", "Vapi Default"],
      },
      { label: "Inbound Number", value: "Assign phone number" },
    ],
  },
];

const coreIntents = [
  { icon: CalendarDays, label: "Schedule appointment", badge: "API linked" },
  { icon: Database, label: "Answer FAQ", badge: "Knowledge base" },
  { icon: ShieldCheck, label: "Escalate urgent request", badge: "Safety" },
];

const roster = [
  { name: "Nova", role: "Sales", state: "Live", load: "84%" },
  { name: "Atlas", role: "Support", state: "Training", load: "62%" },
  { name: "Echo", role: "Front Desk", state: "Draft", load: "31%" },
];

function StudioButton({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? "inline-flex items-center gap-2 rounded-xl border border-[#5d5cff]/45 bg-[#5d5cff]/12 px-4 py-2 text-sm font-medium text-white shadow-[0_0_30px_rgba(93,92,255,0.18)]"
          : "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-[#c7c4d8] transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white"
      }
    >
      {children}
    </button>
  );
}

function FieldControl({ field }: { field: DraftField }) {
  const baseClass =
    "w-full rounded-xl border border-white/10 bg-[#131315] px-3.5 py-3 text-sm text-[#f4f2f7] outline-none transition placeholder:text-[#747374] focus:border-[#5d5cff]/70 focus:ring-2 focus:ring-[#5d5cff]/20";

  if (field.kind === "textarea") {
    return <textarea className={`${baseClass} min-h-[96px] resize-none leading-relaxed`} defaultValue={field.value} />;
  }

  if (field.kind === "select") {
    return (
      <div className="relative">
        <select className={`${baseClass} appearance-none pr-10`} defaultValue={field.value}>
          {(field.options ?? [field.value]).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#908fa1]" />
      </div>
    );
  }

  return <input className={baseClass} defaultValue={field.value} />;
}

function DraftCard({ section }: { section: DraftSection }) {
  const Icon = section.icon;

  return (
    <section className="rounded-3xl border border-white/10 bg-[#1b1b1d]/72 p-6 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)] backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-[#c1c1ff]">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#908fa1]">{section.kicker}</p>
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-white">{section.title}</h3>
          </div>
        </div>
        <button type="button" className="rounded-lg p-2 text-[#908fa1] transition hover:bg-white/[0.06] hover:text-white">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {section.fields.map((field) => (
          <label key={field.label} className={field.kind === "textarea" ? "md:col-span-2" : ""}>
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-[#b1b5bf]">
              {field.label}
            </span>
            <FieldControl field={field} />
          </label>
        ))}
      </div>

      {section.title === "Logic & Intelligence" && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-[#131315]/90 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#908fa1]">Core intents</p>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-[#c1c1ff] hover:text-white">
              <Plus className="h-3.5 w-3.5" /> Add intent
            </button>
          </div>
          <div className="space-y-2">
            {coreIntents.map((intent) => {
              const IntentIcon = intent.icon;
              return (
                <div key={intent.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                  <div className="flex items-center gap-3 text-sm text-[#f4f2f7]">
                    <IntentIcon className="h-4 w-4 text-[#c1c1ff]" />
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

export default function AgentStudioCanvas({ agentId, agentName, onPublish }: AgentStudioCanvasProps) {
  const [mode, setMode] = useState<BoardMode>("architect");

  const boardTitle = useMemo(() => {
    if (mode === "locker") return "Locker Room";
    if (mode === "voice") return "Voice Lab";
    return "Drafting Board";
  }, [mode]);

  return (
    <div className="relative h-full min-h-[720px] overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0c] text-[#e4e2e4] shadow-[0_40px_120px_-70px_rgba(0,0,0,0.95)]">
      <div className="wireline-stitch-grid absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(93,92,255,0.16),transparent_62%)]" aria-hidden="true" />

      <div className="relative z-10 flex h-full flex-col">
        <header className="flex min-h-20 items-center justify-between border-b border-white/5 bg-[#0a0a0c]/72 px-5 backdrop-blur-xl lg:px-8">
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
            <StudioButton selected={mode === "locker"} onClick={() => setMode("locker")}>
              <FolderOpen className="h-4 w-4" /> Locker
            </StudioButton>
            <StudioButton selected={mode === "architect"} onClick={() => setMode("architect")}>
              <Workflow className="h-4 w-4" /> Workflow
            </StudioButton>
            <button type="button" onClick={() => setMode("voice")} className="inline-flex items-center gap-2 rounded-xl border border-[#5d5cff]/55 bg-[#5d5cff] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_38px_-18px_rgba(93,92,255,0.9)] transition hover:bg-[#4643e9]">
              <Play className="h-4 w-4" /> Test Voice
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <aside className="hidden w-20 shrink-0 flex-col items-center border-r border-white/10 bg-[#131315]/80 py-5 lg:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#5d5cff]/35 bg-[#5d5cff]/10 text-[#c1c1ff]">
              <Sparkles className="h-5 w-5" />
            </div>
            <nav className="mt-8 flex flex-1 flex-col gap-3">
              {[
                { icon: LayoutDashboard, label: "Architect", active: mode === "architect" },
                { icon: Users, label: "Roster", active: mode === "locker" },
                { icon: Mic, label: "Voice", active: mode === "voice" },
                { icon: Zap, label: "Automation", active: false },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.label} type="button" className={item.active ? "flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] text-[#c1c1ff]" : "flex h-12 w-12 items-center justify-center rounded-2xl text-[#908fa1] transition hover:bg-white/[0.05] hover:text-white"} aria-label={item.label}>
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </nav>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5d5cff] text-xs font-bold text-white">ML</div>
          </aside>

          <main className="grid flex-1 min-w-0 grid-cols-1 lg:grid-cols-[minmax(360px,0.42fr)_minmax(560px,0.58fr)]">
            <section className="flex min-h-0 flex-col border-r border-white/10 bg-[#131315]/68 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 lg:px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-[#c1c1ff]">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">The Coach</h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#908fa1]">AI architect assistant</p>
                  </div>
                </div>
                <button type="button" className="rounded-lg p-2 text-[#908fa1] transition hover:bg-white/[0.06] hover:text-white">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>

              <div className="wireline-stitch-scroll flex-1 space-y-6 overflow-y-auto p-5 lg:p-6">
                <div className="flex flex-col items-center text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[#747374]">
                  <span>Session started</span>
                  <span className="mt-1 normal-case tracking-normal">Today, 9:41 AM</span>
                </div>

                {chatTranscript.map((message, index) => {
                  const isUser = message.from === "user";
                  return (
                    <div key={`${message.from}-${index}`} className={isUser ? "flex justify-end" : "flex justify-start"}>
                      <div className={isUser ? "flex max-w-[92%] flex-row-reverse gap-3" : "flex max-w-[92%] gap-3"}>
                        <div className={isUser ? "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5d5cff] text-xs font-bold text-white" : "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[#c1c1ff]"}>
                          {isUser ? "ML" : <Bot className="h-4 w-4" />}
                        </div>
                        <div className={isUser ? "rounded-2xl rounded-tr-md border border-[#5d5cff]/28 bg-[#5d5cff]/16 p-4 text-sm leading-relaxed text-white" : "rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.06] p-4 text-sm leading-relaxed text-[#f4f2f7] shadow-[0_18px_60px_-45px_rgba(0,0,0,0.95)]"}>
                          <p className="max-w-none">{message.text}</p>
                          {message.actions && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {message.actions.map((action) => (
                                <button key={action} type="button" className="inline-flex items-center gap-1 rounded-full border border-[#5d5cff]/35 bg-[#5d5cff]/8 px-3 py-1.5 text-xs font-medium text-[#c1c1ff] transition hover:bg-[#5d5cff]/18 hover:text-white">
                                  <Plus className="h-3.5 w-3.5" /> {action}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-white/5 bg-[#0f0f12]/92 p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {["Add intent", "Set voice", "Link API"].map((label) => (
                    <button key={label} type="button" className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-[#c7c4d8] hover:text-white">
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-[0_18px_55px_-36px_rgba(0,0,0,0.95)]">
                  <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[#c1c1ff] hover:bg-white/[0.06]">
                    <Plus className="h-4 w-4" />
                  </button>
                  <input className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-[#747374]" placeholder="Tell Coach what to build..." />
                  <button type="button" className="text-[#c7c4d8] hover:text-white" aria-label="Voice input">
                    <Mic className="h-4 w-4" />
                  </button>
                  <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c1c1ff] text-[#1500a8] shadow-[0_12px_30px_-12px_rgba(193,193,255,0.8)]" aria-label="Send message">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>

            <section className="wireline-stitch-scroll min-h-0 overflow-y-auto bg-[#131315]/45 p-5 backdrop-blur-sm lg:p-8">
              <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <h1 className="text-3xl font-bold tracking-[-0.04em] text-white">{boardTitle}</h1>
                    <span className="rounded-md border border-white/10 bg-white/[0.07] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#b1b5bf]">Draft</span>
                  </div>
                  <p className="max-w-none text-sm text-[#c7c4d8]">
                    Configuring: <span className="text-white">{agentName || "New Agent"}</span>
                    <span className="ml-2 font-mono text-[11px] text-[#747374]">{agentId}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" className="rounded-xl border border-white/10 bg-[#0a0a0c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.06]">Discard</button>
                  <button type="button" onClick={onPublish} className="inline-flex items-center gap-2 rounded-xl border border-[#5d5cff]/55 bg-[#5d5cff] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_45px_-20px_rgba(93,92,255,0.95)] transition hover:bg-[#4643e9]">
                    <Rocket className="h-4 w-4" /> Deploy Agent
                  </button>
                </div>
              </div>

              {mode === "voice" ? (
                <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
                  <section className="rounded-3xl border border-white/10 bg-[#1b1b1d]/72 p-6 backdrop-blur-xl">
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-[#c1c1ff]">
                        <Mic className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#908fa1]">Voice test</p>
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
                  </section>
                  <DraftCard section={draftSections[2]} />
                </div>
              ) : mode === "locker" ? (
                <div className="grid gap-4 xl:grid-cols-3">
                  {roster.map((agent) => (
                    <article key={agent.name} className="rounded-3xl border border-white/10 bg-[#1b1b1d]/72 p-5 backdrop-blur-xl">
                      <div className="mb-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#5d5cff]/25 bg-[#5d5cff]/10 text-[#c1c1ff]">
                            <Bot className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-white">{agent.name}</h3>
                            <p className="text-sm text-[#908fa1]">{agent.role}</p>
                          </div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-[#c7c4d8]">{agent.state}</span>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#0a0a0c] p-4">
                        <div className="mb-2 flex items-center justify-between text-xs text-[#908fa1]">
                          <span>Readiness</span>
                          <span>{agent.load}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                          <div className="h-full w-2/3 rounded-full bg-[#5d5cff]" />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {draftSections.map((section) => (
                    <DraftCard key={section.title} section={section} />
                  ))}

                  <section className="rounded-3xl border border-white/10 bg-[#1b1b1d]/72 p-6 backdrop-blur-xl">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-[#c1c1ff]">
                          <Workflow className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#908fa1]">Workflow path</p>
                          <h3 className="text-lg font-semibold text-white">Call Flow</h3>
                        </div>
                      </div>
                      <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm text-[#f4f2f7] hover:bg-white/[0.08]">
                        <Save className="h-4 w-4" /> Save Snapshot
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      {["Greeting", "Qualify need", "Schedule", "Confirm + log"].map((step, index) => (
                        <div key={step} className="relative rounded-2xl border border-white/10 bg-[#0a0a0c] p-4">
                          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#5d5cff]/14 text-[#c1c1ff]">{index + 1}</div>
                          <p className="font-semibold text-white">{step}</p>
                          <p className="mt-1 max-w-none text-xs leading-relaxed text-[#908fa1]">Coach-reviewed default for safe, useful voice calls.</p>
                          {index < 3 && <ChevronRight className="absolute -right-5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-[#5d5cff] md:block" />}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
