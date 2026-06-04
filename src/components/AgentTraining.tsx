/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  Database,
  PlayCircle,
  Trash2,
  Phone,
  Activity,
  Plus,
  Pencil,
  Sparkles,
  ChevronDown,
  Zap,
  Target,
  Clock,
  Workflow,
  PhoneCall,
  PhoneOff,
  Mic,
  BookOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { formatDate } from "../lib/safe-date";
import SupervisedAgentTuner from "./SupervisedAgentTuner";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import { HelpTooltip } from "./HelpTooltip";
import { useToast } from "../contexts/ToastContext";
import AgentFlowComposer from "./AgentFlowComposer";
import VoiceLibraryPanel from "./admin/VoiceLibraryPanel";
import PronunciationDictionaryPanel from "./PronunciationDictionaryPanel";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

type TrainingTab = "database" | "voices" | "pronunciation" | "simulator" | "flow";

const VALID_TRAINING_TABS: TrainingTab[] = [
  "database",
  "voices",
  "pronunciation",
  "simulator",
  "flow",
];

type VapiInstance = {
  on: (event: string, cb: () => void) => void;
  removeAllListeners: (event: string) => void;
  start: (assistant: unknown) => Promise<unknown>;
  stop: () => void;
};

interface AgentTrainingProps {
  /** Always rendered inside an agent's chat workspace — receives the agent ID
   *  directly and skips the page-level chrome (there is no standalone /train). */
  embeddedAgentId: string;
  /** The Training sub-tab to open on mount (driven by the ?sub= URL param the
   *  parent workspace owns). */
  initialSubTab?: string;
  /** Notifies the parent workspace when the sub-tab changes so it can mirror it
   *  into the URL as /chat/:id?tab=training&sub=<name>. */
  onSubTabChange?: (sub: string) => void;
}

export default function AgentTraining({
  embeddedAgentId,
  initialSubTab,
  onSubTabChange,
}: AgentTrainingProps) {
  const { error: toastError } = useToast();
  // The active sub-tab is seeded from the URL-driven prop and reported back up
  // to the parent workspace, which owns the canonical URL. The training surface
  // never navigates on its own (the old /train?tab= sync broke embedded mode).
  const initialTab: TrainingTab = VALID_TRAINING_TABS.includes(initialSubTab as TrainingTab)
    ? (initialSubTab as TrainingTab)
    : "database";
  const [activeTab, setActiveTabState] = useState<TrainingTab>(initialTab);

  const setActiveTab = (next: TrainingTab) => {
    setActiveTabState(next);
    onSubTabChange?.(next);
  };

  // Keep the local tab in sync if the parent changes the ?sub= param (e.g. a
  // deep-link arrives while the panel is already mounted).
  useEffect(() => {
    if (VALID_TRAINING_TABS.includes(initialSubTab as TrainingTab)) {
      setActiveTabState(initialSubTab as TrainingTab);
    }
  }, [initialSubTab]);
  const [simConnecting, setSimConnecting] = useState(false);
  const [simConnected, setSimConnected] = useState(false);
  const simVapiRef = useRef<VapiInstance | null>(null);
  const simMountedRef = useRef(true);
  // Scoped to the agent whose chat workspace hosts this panel.
  const selectedAgentId = embeddedAgentId;

  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [directives, setDirectives] = useState<any[]>([]);
  const [personality, setPersonality] = useState("");
  const [lessons, setLessons] = useState<any[]>([]);

  const [editingDirective, setEditingDirective] = useState<{ id: string; content: string } | null>(
    null,
  );
  const [editingKnowledge, setEditingKnowledge] = useState<{ id: string; content: string } | null>(
    null,
  );
  const [editingPersonality, setEditingPersonality] = useState(false);
  const [personalityDraft, setPersonalityDraft] = useState("");
  const [newDirective, setNewDirective] = useState("");
  const [newKnowledge, setNewKnowledge] = useState("");
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optSuggestions, setOptSuggestions] = useState<any>(null);

  useEffect(() => {
    simMountedRef.current = true;
    fetchKnowledge();
    return () => {
      simMountedRef.current = false;
      if (simVapiRef.current) {
        simVapiRef.current.removeAllListeners("call-start");
        simVapiRef.current.removeAllListeners("call-end");
        try {
          simVapiRef.current.stop();
        } catch {
          /* not in a call */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-syncs on agent switch by design
  }, [selectedAgentId]);

  const startTestCall = async () => {
    if (simConnected) {
      simVapiRef.current?.stop();
      return;
    }
    if (!import.meta.env.VITE_VAPI_PUBLIC_KEY) {
      toastError("Voice not configured", "Browser voice key is not set. Contact support.");
      return;
    }
    setSimConnecting(true);
    try {
      if (!simVapiRef.current) {
        const { default: Vapi } = await import("@vapi-ai/web");
        if (!simMountedRef.current) return;
        const v = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY) as unknown as VapiInstance;
        v.on("call-start", () => {
          if (simMountedRef.current) {
            setSimConnecting(false);
            setSimConnected(true);
          }
        });
        v.on("call-end", () => {
          if (simMountedRef.current) {
            setSimConnecting(false);
            setSimConnected(false);
          }
        });
        simVapiRef.current = v;
      }
      if (!simMountedRef.current) return;
      const res = await authFetch(`/api/vapi-webhook?agentId=${selectedAgentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: { type: "assistant-request" } }),
      });
      if (!simMountedRef.current) return;
      const data = await res.json();
      if (data.assistant) {
        await simVapiRef.current!.start(data.assistant);
      } else {
        toastError("Agent not ready", data.error || "Could not load voice config for this agent.");
        setSimConnecting(false);
      }
    } catch (e: any) {
      if (simMountedRef.current) {
        setSimConnecting(false);
        toastError("Call failed", e?.message || "Could not start test call.");
      }
    }
  };

  const fetchKnowledge = async () => {
    try {
      const res = await authFetch(`/api/agent-config/${selectedAgentId}`);
      const data = await res.json();
      setKnowledge(data.knowledge || []);
      setDirectives(data.directives || []);
      setPersonality(data.personality || "");
      setPersonalityDraft(data.personality || "");
      setLessons(data.lessons || []);
    } catch {
      /* training fetch failures are non-fatal — UI shows empty state */
    }
  };

  const deleteItem = async (id: string, type: "knowledge" | "directive") => {
    try {
      await authFetch(`/api/agent-config/${selectedAgentId}/${type}/${id}`, { method: "DELETE" });
      fetchKnowledge();
    } catch {
      /* swallow — UI will reflect server state on next fetch */
    }
  };

  const saveManualEntry = async (
    type: "directive" | "knowledge" | "personality",
    content: string,
    overrideId?: string,
  ) => {
    if (!content.trim()) return;
    setIsSavingEntry(true);
    try {
      const resp = await authFetch(`/api/agent-config/${selectedAgentId}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content, overrideId }),
      });
      if (resp.ok) {
        if (type === "personality") {
          setPersonality(content);
          setEditingPersonality(false);
        } else {
          await fetchKnowledge();
          if (type === "directive") {
            setEditingDirective(null);
            setNewDirective("");
          }
          if (type === "knowledge") {
            setEditingKnowledge(null);
            setNewKnowledge("");
          }
        }
      }
    } catch (e) {
      console.error(e);
      toastError("Save failed", "Could not save this entry. Please try again.");
    }
    setIsSavingEntry(false);
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);
    setOptSuggestions(null);
    try {
      const res = await authFetch(`/api/agents/${selectedAgentId}/optimize`, { method: "POST" });
      const data = await res.json();
      setOptSuggestions(data);
    } catch (e) {
      console.error(e);
      toastError(
        "Optimization failed",
        "Could not generate optimization suggestions. Please try again.",
      );
    }
    setIsOptimizing(false);
  };

  const applySuggestion = async (suggestion: string) => {
    await saveManualEntry("directive", suggestion);
    setOptSuggestions((prev: any) => ({
      ...prev,
      suggestions: prev.suggestions.filter((s: string) => s !== suggestion),
    }));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 px-3 md:px-4 py-2 sticky top-0 z-30 backdrop-blur-xl bg-paper/70 border-b-0">
        {/* AI assists — collapsed by default to declutter; expand to see recipe
            shortcuts. Each is scoped to this agent. */}
        <details className="max-w-[1400px] mx-auto w-full group">
          <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-1.5 rounded-xl glass border border-white/10 hover:border-brand/30 transition-colors">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ background: "#8B3FD6" }}
            >
              <Sparkles className="w-3 h-3 text-on-brand" strokeWidth={2.5} />
            </div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-brand">AI assists</span>
            <span className="text-[11px] text-ink/70">— one-click recipes</span>
            <ChevronDown className="ml-auto w-3.5 h-3.5 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 p-3 rounded-xl glass border border-white/10 flex flex-wrap items-center gap-1.5">
            <ClaudeRecipeButton
              variant="ghost"
              recipe="agent-review"
              agentId={selectedAgentId}
              label="Performance Review"
            />
            <ClaudeRecipeButton
              variant="ghost"
              recipe="persona-clone"
              agentId={selectedAgentId}
              label="Clone Persona"
            />
            <ClaudeRecipeButton
              variant="ghost"
              recipe="knowledge-from-url"
              agentId={selectedAgentId}
              label="Ingest URL"
            />
            <ClaudeRecipeButton
              variant="ghost"
              recipe="knowledge-from-document"
              agentId={selectedAgentId}
              label="Ingest PDF"
            />
            <ClaudeRecipeButton
              variant="ghost"
              recipe="objection-drill"
              agentId={selectedAgentId}
              label="Objection Drills"
            />
            <ClaudeRecipeButton
              variant="ghost"
              recipe="call-playbook"
              agentId={selectedAgentId}
              label="Call Playbook"
            />
            <ClaudeRecipeButton
              variant="ghost"
              recipe="brief"
              agentId={selectedAgentId}
              label="Pre-Call Brief"
            />
          </div>
        </details>

        <nav
          role="tablist"
          aria-label="Training views"
          className="flex flex-wrap gap-1.5 max-w-[1400px] mx-auto w-full mt-2"
        >
          {[
            {
              id: "database",
              label: "Knowledge",
              icon: Database,
              help: "View and edit everything this agent has learned: personality, directives, knowledge entries, and uploaded files.",
            },
            {
              id: "voices",
              label: "Voices",
              icon: Mic,
              help: "Voice library + cloning. Every agent's identity starts with the voice they speak in.",
            },
            {
              id: "pronunciation",
              label: "Pronunciation",
              icon: BookOpen,
              help: "Teach the voice engine how to pronounce industry jargon, brand names, and abbreviations correctly.",
            },
            {
              id: "simulator",
              label: "Test call",
              icon: PlayCircle,
              help: "Run simulated conversations to see how your agent will respond before customers call.",
            },
            {
              id: "flow",
              label: "Conversation flow",
              icon: Workflow,
              help: "Define linear conversation stages and transitions (advanced — most agents work great without this).",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`training-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id as TrainingTab)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg border text-[10px] uppercase tracking-[0.12em] flex items-center gap-1.5 transition-colors",
                activeTab === tab.id
                  ? "bg-brand/15 border-brand/40 text-brand"
                  : "glass border-black/10 text-muted hover:border-brand/25 hover:text-ink",
              )}
            >
              <tab.icon className="w-3 h-3" />
              <span>{tab.label}</span>
              <HelpTooltip content={tab.help} placement="top">
                <span className="w-4 h-4 rounded-full border border-current/30 text-[8px] flex items-center justify-center opacity-70 hover:opacity-100">
                  ?
                </span>
              </HelpTooltip>
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {activeTab === "database" && (
            <motion.div
              key="database"
              role="tabpanel"
              id="training-panel-database"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="h-full overflow-y-auto p-4 space-y-4"
            >
              {selectedAgentId !== "default-agent" && (
                <SupervisedAgentTuner agentId={selectedAgentId} />
              )}

              {/* Analysis Engine */}
              <section className="rounded-2xl glass border border-white/10 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-display italic lowercase text-xl text-ink">
                        analysis engine
                      </h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70">
                        Find improvement opportunities from your calls
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleOptimize}
                    disabled={isOptimizing}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-brand/40 bg-brand/8 text-brand text-[10px] uppercase tracking-[0.12em] hover:bg-brand/15 transition-all disabled:opacity-50"
                  >
                    {isOptimizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" />
                    )}
                    {isOptimizing ? "Analyzing…" : "Analyze calls"}
                  </button>
                </div>
                {optSuggestions && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-3"
                  >
                    <div className="rounded-xl bg-black/20 border border-white/8 p-4">
                      <h4 className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mb-2">
                        Analysis
                      </h4>
                      <p className="font-display italic text-lg text-ink leading-snug">
                        "{optSuggestions.analysis}"
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <AnimatePresence>
                        {optSuggestions.suggestions?.length > 0 ? (
                          optSuggestions.suggestions.map((s: string, idx: number) => (
                            <motion.div
                              key={idx}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="rounded-xl glass border border-white/10 p-3 flex flex-col justify-between gap-3"
                            >
                              <p className="text-sm text-ink/90 leading-relaxed">"{s}"</p>
                              <button
                                onClick={() => applySuggestion(s)}
                                className="w-full h-8 rounded-lg bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.12em] hover:bg-brand/25 transition-all"
                              >
                                Apply
                              </button>
                            </motion.div>
                          ))
                        ) : (
                          <div className="sm:col-span-3 py-8 text-center app-section-title/60">
                            {optSuggestions.reason || "Strategy optimal. No drift detected."}
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </section>

              {/* Neural Identity */}
              <section className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
                <div
                  className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
                  style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
                />
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl glass border border-brand-3/30 text-brand-3 flex items-center justify-center shrink-0">
                      <Target className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-display italic lowercase text-xl text-ink">
                        personality
                      </h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70">
                        Base behavioral heuristics and tone
                      </p>
                    </div>
                  </div>
                  {editingPersonality ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingPersonality(false);
                          setPersonalityDraft(personality);
                        }}
                        className="h-8 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.12em] text-muted hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveManualEntry("personality", personalityDraft)}
                        className="h-8 px-3 rounded-lg bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.12em] hover:bg-brand/25 transition-all"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingPersonality(true)}
                      className="h-8 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.12em] text-muted/80 hover:text-ink flex items-center gap-1.5 transition-all"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
                <div className="relative z-10">
                  {editingPersonality ? (
                    <textarea
                      value={personalityDraft}
                      onChange={(e) => setPersonalityDraft(e.target.value)}
                      className="w-full min-h-[180px] p-3 rounded-xl bg-black/5 border border-black/10 text-sm text-ink outline-none focus:border-brand/50 resize-none leading-relaxed placeholder:text-muted/70"
                      placeholder="Define the core identity heuristics…"
                    />
                  ) : (
                    <div className="p-4 rounded-xl bg-black/20 border border-white/8">
                      <p className="font-display italic text-xl md:text-2xl text-ink leading-snug">
                        {personality ? (
                          `"${personality}"`
                        ) : (
                          <span className="text-muted/70 not-italic text-base">
                            No personality set yet — click Edit to describe how your agent should
                            speak and behave.
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Directives + Knowledge */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Rules */}
                <section className="rounded-2xl glass border border-white/10 p-3 flex flex-col">
                  <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/8">
                    <div>
                      <h3 className="font-display italic lowercase text-lg text-ink leading-none">
                        rules
                      </h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">
                        Lines your agent never crosses
                      </p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-500 text-[9px] uppercase tracking-[0.12em] leading-none">
                      Always-on
                    </span>
                  </header>
                  <div className="space-y-2 mb-3">
                    <AnimatePresence mode="popLayout">
                      {directives.length === 0 ? (
                        <div className="py-8 text-center text-muted/70 text-[11px] leading-relaxed px-4">
                          No rules yet — add one below to set hard limits your agent always
                          respects.
                        </div>
                      ) : (
                        directives.map((d) => (
                          <motion.div
                            layout
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={d.id}
                            className="rounded-xl bg-rose-500/8 border border-rose-500/20 p-3 group"
                          >
                            {editingDirective && editingDirective.id === d.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingDirective.content}
                                  onChange={(e) =>
                                    setEditingDirective({
                                      id: d.id,
                                      content: e.target.value,
                                    })
                                  }
                                  className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-rose-400/50 text-ink min-h-[80px] resize-none"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setEditingDirective(null)}
                                    className="px-2.5 py-1 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.12em] text-muted hover:text-ink"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() =>
                                      saveManualEntry("directive", editingDirective!.content, d.id)
                                    }
                                    disabled={isSavingEntry}
                                    className="px-2.5 py-1 rounded-lg bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.12em] hover:bg-brand/25 disabled:opacity-50"
                                  >
                                    {isSavingEntry ? "Saving…" : "Save"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2 items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="mb-1.5">
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] uppercase tracking-[0.2em] font-semibold border",
                                        d.priority <= 2
                                          ? "bg-rose-500/10 border-rose-500/30 text-rose-600"
                                          : d.priority <= 4
                                            ? "bg-amber-400/10 border-amber-400/30 text-amber-600"
                                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700",
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "w-1 h-1 rounded-full",
                                          d.priority <= 2
                                            ? "bg-rose-500"
                                            : d.priority <= 4
                                              ? "bg-amber-400"
                                              : "bg-emerald-500",
                                        )}
                                      />
                                      P{d.priority}
                                    </span>
                                  </div>
                                  <div className="text-sm text-ink/90 leading-relaxed">
                                    {d.content}
                                  </div>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
                                  <ShadButton
                                    variant="glass"
                                    size="icon"
                                    onClick={() =>
                                      setEditingDirective({ id: d.id, content: d.content })
                                    }
                                    className="w-6 h-6 rounded-full hover:border-white/30"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </ShadButton>
                                  <ShadButton
                                    variant="glass"
                                    size="icon"
                                    onClick={() => deleteItem(d.id, "directive")}
                                    className="w-6 h-6 rounded-full hover:text-rose-500 hover:border-rose-500/30"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </ShadButton>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="mt-auto pt-3 border-t border-white/8 space-y-1.5">
                    <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                      Add directive
                    </label>
                    <div className="flex gap-1.5">
                      <Input
                        type="text"
                        value={newDirective}
                        onChange={(e) => setNewDirective(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && saveManualEntry("directive", newDirective)
                        }
                        placeholder="e.g. Never discuss competitor pricing"
                        className="flex-1 text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-rose-400/50 text-ink placeholder:text-muted/70"
                      />
                      <button
                        onClick={() => saveManualEntry("directive", newDirective)}
                        disabled={!newDirective || isSavingEntry}
                        className="w-9 h-9 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center hover:bg-rose-500/25 disabled:opacity-50 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </section>

                {/* Fact Archive */}
                <section className="rounded-2xl glass border border-white/10 p-3 flex flex-col">
                  <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/8">
                    <div>
                      <h3 className="font-display italic lowercase text-lg text-ink leading-none">
                        fact archive
                      </h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">
                        Knowledge base
                      </p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-600 text-[9px] uppercase tracking-[0.12em] leading-none">
                      Factual
                    </span>
                  </header>
                  <div className="space-y-2 mb-3">
                    <AnimatePresence mode="popLayout">
                      {knowledge.length === 0 ? (
                        <div className="py-10 flex flex-col items-center text-center">
                          <div className="relative mb-4">
                            <span
                              aria-hidden="true"
                              className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
                            />
                            <span className="relative flex w-11 h-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25">
                              <BookOpen className="w-5 h-5" />
                            </span>
                          </div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70 mb-1">
                            Knowledge base
                          </p>
                          <p className="font-display italic text-lg text-ink mb-1">
                            No entries yet
                          </p>
                          <p className="text-[12px] text-muted max-w-[260px]">
                            Upload a PDF, paste a policy, or add a FAQ below so this agent answers
                            consistently.
                          </p>
                        </div>
                      ) : (
                        knowledge.map((k) => (
                          <motion.div
                            layout
                            initial={{ opacity: 0, x: 6 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={k.id}
                            className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-3 group"
                          >
                            {editingKnowledge && editingKnowledge.id === k.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingKnowledge.content}
                                  onChange={(e) =>
                                    setEditingKnowledge({
                                      id: k.id,
                                      content: e.target.value,
                                    })
                                  }
                                  className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-blue-400/50 text-ink min-h-[80px] resize-none"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setEditingKnowledge(null)}
                                    className="px-2.5 py-1 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.12em] text-muted hover:text-ink"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() =>
                                      saveManualEntry("knowledge", editingKnowledge!.content, k.id)
                                    }
                                    disabled={isSavingEntry}
                                    className="px-2.5 py-1 rounded-lg bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.12em] hover:bg-brand/25 disabled:opacity-50"
                                  >
                                    {isSavingEntry ? "Saving…" : "Save"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2 items-start justify-between">
                                <div className="flex-1 text-sm text-ink/90 leading-relaxed">
                                  {k.content}
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
                                  <ShadButton
                                    variant="glass"
                                    size="icon"
                                    onClick={() =>
                                      setEditingKnowledge({ id: k.id, content: k.content })
                                    }
                                    className="w-6 h-6 rounded-full hover:border-white/30"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </ShadButton>
                                  <ShadButton
                                    variant="glass"
                                    size="icon"
                                    onClick={() => deleteItem(k.id, "knowledge")}
                                    className="w-6 h-6 rounded-full hover:text-blue-600 hover:border-blue-500/30"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </ShadButton>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="mt-auto pt-3 border-t border-white/8 space-y-1.5">
                    <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                      Add fact
                    </label>
                    <div className="flex gap-1.5">
                      <Input
                        type="text"
                        value={newKnowledge}
                        onChange={(e) => setNewKnowledge(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && saveManualEntry("knowledge", newKnowledge)
                        }
                        placeholder="e.g. Our return policy is 30 days, no questions"
                        className="flex-1 text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-blue-400/50 text-ink placeholder:text-muted/70"
                      />
                      <button
                        onClick={() => saveManualEntry("knowledge", newKnowledge)}
                        disabled={!newKnowledge || isSavingEntry}
                        className="w-9 h-9 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-600 flex items-center justify-center hover:bg-blue-500/25 disabled:opacity-50 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              {/* AI Auto-Calibration */}
              {lessons.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl glass border border-white/10 p-4"
                >
                  <div className="flex items-center gap-2.5 mb-4">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "#8B3FD6" }}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-on-brand" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="font-display italic lowercase text-lg text-ink leading-none">
                        ai auto-calibration
                      </h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-500">
                        Synthetic learning engine active
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3"
                      >
                        <div className="text-[9px] uppercase tracking-[0.3em] text-emerald-500 mb-2 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" /> Pattern learned from calls
                        </div>
                        <p className="text-sm text-ink/90 leading-relaxed">{lesson.lesson}</p>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/8">
                          <Clock className="w-3 h-3 text-muted/70" />
                          <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                            {formatDate(lesson.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === "flow" && (
            <motion.div
              key="flow"
              role="tabpanel"
              id="training-panel-flow"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              <AgentFlowComposer agentId={selectedAgentId} />
            </motion.div>
          )}

          {activeTab === "voices" && (
            <motion.div
              key="voices"
              role="tabpanel"
              id="training-panel-voices"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 overflow-y-auto p-4"
            >
              <VoiceLibraryPanel />
            </motion.div>
          )}

          {activeTab === "pronunciation" && (
            <motion.div
              key="pronunciation"
              role="tabpanel"
              id="training-panel-pronunciation"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 overflow-y-auto p-4"
            >
              <PronunciationDictionaryPanel />
            </motion.div>
          )}

          {activeTab === "simulator" && (
            <motion.div
              key="simulator"
              role="tabpanel"
              id="training-panel-simulator"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="h-full overflow-y-auto"
            >
              <div className="min-h-full flex items-center justify-center p-6">
                <div className="max-w-[560px] w-full text-center space-y-6">
                  <div className="relative w-20 h-20 rounded-2xl glass border border-white/10 flex items-center justify-center mx-auto">
                    <div
                      className="absolute inset-0 rounded-2xl opacity-20 blur-xl"
                      style={{ background: "radial-gradient(circle, #8B3FD6, transparent)" }}
                    />
                    <PlayCircle className="w-10 h-10 text-brand relative z-10" strokeWidth={1.25} />
                  </div>
                  <div>
                    <h2 className="font-display italic lowercase text-4xl text-ink mb-2">
                      test call
                    </h2>
                    <p className="text-muted/70 text-sm leading-relaxed max-w-md mx-auto">
                      Test how your agent responds in a safe practice run before it takes real
                      calls.
                    </p>
                  </div>
                  <div className="rounded-xl glass border border-white/10 p-5 text-left space-y-4 max-w-sm mx-auto w-full">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-brand" />
                      <h4 className="font-display italic lowercase text-base text-ink">
                        voice call
                      </h4>
                    </div>
                    <p className="text-[11px] text-muted/70 leading-relaxed">
                      Speak directly with your agent through your browser microphone. Tests the
                      exact voice and persona your callers will hear.
                    </p>
                    <button
                      type="button"
                      onClick={startTestCall}
                      disabled={simConnecting}
                      className={cn(
                        "w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-[11px] uppercase tracking-[0.3em] transition-all disabled:opacity-50",
                        simConnected
                          ? "bg-rose-500/15 border border-rose-500/40 text-rose-500 hover:bg-rose-500/25"
                          : "bg-brand/15 border border-brand/40 text-brand hover:bg-brand/25",
                      )}
                    >
                      {simConnecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : simConnected ? (
                        <PhoneOff className="w-3.5 h-3.5" />
                      ) : (
                        <PhoneCall className="w-3.5 h-3.5" />
                      )}
                      {simConnecting
                        ? "Connecting…"
                        : simConnected
                          ? "End call"
                          : "Start voice test"}
                    </button>
                    {simConnected && (
                      <div className="flex items-center justify-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-emerald-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live — speak now
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
