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
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { clientLog } from "../lib/client-log";
import { authFetch } from "../lib/api";
import { formatDate } from "../lib/safe-date";
import SupervisedAgentTuner from "./SupervisedAgentTuner";
import { HelpTooltip } from "./HelpTooltip";
import { useToast } from "../contexts/ToastContext";
import AgentFlowComposer from "./AgentFlowComposer";
import VoiceLibraryPanel from "./admin/VoiceLibraryPanel";
import PronunciationDictionaryPanel from "./PronunciationDictionaryPanel";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { EmptyState } from "./ui/EmptyState";
import { InlineEmpty } from "./ui/InlineEmpty";
import {
  OPS_TRAINING_PANEL,
  OPS_TRAINING_ASSISTS,
  OPS_TRAINING_ASSISTS_COPY,
  directorAssistHref,
} from "../lib/wireline-ops-design";
import RoleplaySandbox from "./RoleplaySandbox";
import IntegrationDirectivePresets from "./IntegrationDirectivePresets";

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
  /** Always rendered inside an agent's chat workspace - receives the agent ID
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
  const [_agentRole, setAgentRole] = useState("customer_service");

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
      if (data.role) setAgentRole(data.role);
    } catch {
      /* training fetch failures are non-fatal - UI shows empty state */
    }
  };

  const deleteItem = async (id: string, type: "knowledge" | "directive") => {
    try {
      await authFetch(`/api/agent-config/${selectedAgentId}/${type}/${id}`, { method: "DELETE" });
      fetchKnowledge();
    } catch {
      /* swallow - UI will reflect server state on next fetch */
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
      clientLog.error("agent-training:save-entry", e);
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
      clientLog.error("agent-training:optimize", e);
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
      <header className="shrink-0 px-3 md:px-4 py-2 sticky top-0 z-30 backdrop-blur-xl bg-card/80 border-b border-border">
        <div className="max-w-[1400px] mx-auto w-full flex items-center gap-1.5 overflow-x-auto tab-strip-scroll tab-strip-scroll--fade scrollbar-hide py-0.5">
          <span className="shrink-0 inline-flex items-center gap-1.5 pr-1">
            <span className="w-5 h-5 rounded bg-brand flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 text-on-brand" strokeWidth={2.5} />
            </span>
            <span className="wl-label text-brand whitespace-nowrap">
              {OPS_TRAINING_ASSISTS_COPY.eyebrow}
            </span>
            <span className="hidden sm:inline text-[var(--wireline-typography-overline-size)] text-[var(--wireline-color-text-secondary)]/60 whitespace-nowrap">
              &middot; {OPS_TRAINING_ASSISTS_COPY.hint}
            </span>
          </span>
          {OPS_TRAINING_ASSISTS.map((assist) => (
            <Link
              key={assist.label}
              to={directorAssistHref(selectedAgentId, assist.prompt)}
              className="shrink-0 inline-flex items-center px-2.5 py-1.5 rounded-md wl-panel border border-border hover:border-brand/30 wl-label text-muted hover:text-brand transition-colors touch-press hit-area-44"
            >
              {assist.label}
            </Link>
          ))}
        </div>

        <nav
          role="tablist"
          aria-label="Training views"
          className="flex flex-wrap gap-1.5 max-w-[1400px] mx-auto w-full mt-1.5 pt-1.5 border-t border-border/50"
        >
          {[
            {
              id: "database",
              label: "Knowledge",
              icon: Database,
              help: "View and edit the facts, personality, instructions, Training entries, and uploaded files this agent can use.",
            },
            {
              id: "voices",
              label: "Voice",
              icon: Mic,
              help: "Voice library and cloning. Every agent's identity starts with the voice they speak in.",
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
              help: "Define linear conversation stages and transitions. Most agents work well without this until the job becomes complex.",
            },
          ].map((tab) => (
            <ShadButton
              key={tab.id}
              type="button"
              variant="ghost"
              disableAnimations
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`training-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id as TrainingTab)}
              className={cn(
                "h-auto px-2.5 py-1.5 rounded-md border wl-label gap-1.5",
                activeTab === tab.id
                  ? "bg-brand/15 border-brand/40 text-brand hover:bg-brand/15 hover:text-brand"
                  : "wl-panel border-border text-muted hover:border-brand/25 hover:text-foreground",
              )}
            >
              <tab.icon className="w-3 h-3" />
              <span>{tab.label}</span>
              <HelpTooltip content={tab.help} placement="top">
                <span className="w-4 h-4 rounded-full border border-current/30 wl-micro-badge flex items-center justify-center opacity-70 hover:opacity-100">
                  ?
                </span>
              </HelpTooltip>
            </ShadButton>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-h-0 relative overflow-hidden">
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
              className="h-full overflow-y-auto p-4 md:p-5 space-y-5"
            >
              {selectedAgentId !== "default-agent" && (
                <SupervisedAgentTuner agentId={selectedAgentId} />
              )}

              {/* Analysis Engine */}
              <section className="rounded-md wl-panel-elevated border border-border p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md wl-panel border border-brand/30 text-brand flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-display italic text-xl text-foreground">
                        Analysis engine
                      </h3>
                      <p className="wl-label text-foreground/55">
                        Find improvement opportunities from your calls
                      </p>
                    </div>
                  </div>
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={handleOptimize}
                    disabled={isOptimizing}
                    className="h-8 rounded-md border-brand/40 bg-brand/8 text-brand wl-label hover:bg-brand/15"
                  >
                    {isOptimizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" />
                    )}
                    {isOptimizing ? "Analyzing..." : "Analyze calls"}
                  </ShadButton>
                </div>
                {optSuggestions && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-3"
                  >
                    <div className="rounded-md bg-muted/40 border border-border p-4">
                      <h4 className="wl-label text-foreground/55 mb-2">Analysis</h4>
                      <p className="font-display italic text-lg text-foreground leading-snug">
                        "{optSuggestions.analysis}"
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                      <AnimatePresence>
                        {optSuggestions.suggestions?.length > 0 ? (
                          optSuggestions.suggestions.map((s: string, idx: number) => (
                            <motion.div
                              key={idx}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="rounded-md wl-panel border border-border p-3 flex flex-col justify-between gap-3"
                            >
                              <p className="text-sm text-foreground/90 leading-relaxed">"{s}"</p>
                              <ShadButton
                                type="button"
                                variant="outline"
                                size="sm"
                                disableAnimations
                                onClick={() => applySuggestion(s)}
                                className="w-full h-8 rounded-md bg-brand/15 border-brand/40 text-brand wl-label hover:bg-brand/25"
                              >
                                Apply
                              </ShadButton>
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

              {/* Integration Directive Presets */}
              <IntegrationDirectivePresets
                agentId={selectedAgentId}
                directives={directives}
                onUpdate={fetchKnowledge}
              />

              {/* Neural Identity */}
              <section className="rounded-md wl-panel-elevated border border-border p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md wl-panel border border-brand/30 text-brand flex items-center justify-center shrink-0">
                      <Target className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-display italic text-xl text-foreground">Personality</h3>
                      <p className="wl-label text-foreground/55">
                        Base behavioral heuristics and tone
                      </p>
                    </div>
                  </div>
                  {editingPersonality ? (
                    <div className="flex gap-2">
                      <ShadButton
                        type="button"
                        variant="outline"
                        size="sm"
                        disableAnimations
                        onClick={() => {
                          setEditingPersonality(false);
                          setPersonalityDraft(personality);
                        }}
                        className="h-8 rounded-md wl-label text-muted"
                      >
                        Cancel
                      </ShadButton>
                      <ShadButton
                        type="button"
                        variant="outline"
                        size="sm"
                        disableAnimations
                        onClick={() => saveManualEntry("personality", personalityDraft)}
                        className="h-8 rounded-md bg-brand/15 border-brand/40 text-brand wl-label hover:bg-brand/25"
                      >
                        Save
                      </ShadButton>
                    </div>
                  ) : (
                    <ShadButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disableAnimations
                      onClick={() => setEditingPersonality(true)}
                      className="h-8 rounded-md wl-label text-muted/80"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </ShadButton>
                  )}
                </div>
                <div>
                  {editingPersonality ? (
                    <textarea
                      value={personalityDraft}
                      onChange={(e) => setPersonalityDraft(e.target.value)}
                      className="w-full min-h-[180px] p-3 rounded-md bg-muted/20 border border-border text-sm text-foreground outline-none focus:border-brand/50 resize-none leading-relaxed placeholder:text-foreground/55"
                      placeholder="Define the core identity heuristics..."
                    />
                  ) : (
                    <div className="p-4 rounded-md bg-muted/40 border border-border">
                      <p className="font-display italic text-xl md:text-2xl text-foreground leading-snug">
                        {personality ? (
                          `"${personality}"`
                        ) : (
                          <span className="text-foreground/55 not-italic text-base">
                            No personality set yet - click Edit to describe how your agent should
                            speak and behave.
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Directives + Training */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {/* Rules */}
                <section className="rounded-md wl-panel-elevated border border-border p-3 flex flex-col">
                  <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-border/60">
                    <div>
                      <h3 className="font-display italic text-lg text-foreground leading-none">
                        Rules
                      </h3>
                      <p className="wl-label text-foreground/55 mt-0.5">
                        Lines your agent never crosses
                      </p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-500 wl-label leading-none">
                      Always-on
                    </span>
                  </header>
                  <div className="space-y-2 mb-3">
                    <AnimatePresence mode="popLayout">
                      {directives.length === 0 ? (
                        <InlineEmpty label={OPS_TRAINING_PANEL.rules} className="py-8" />
                      ) : (
                        directives.map((d) => (
                          <motion.div
                            layout
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={d.id}
                            className="rounded-md bg-rose-500/8 border border-rose-500/20 p-3 group touch-press"
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
                                  className="w-full text-sm bg-muted/20 border border-border rounded-md px-3 py-2 outline-none focus:border-rose-400/50 text-foreground min-h-[80px] resize-none"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <ShadButton
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disableAnimations
                                    onClick={() => setEditingDirective(null)}
                                    className="h-7 px-2.5 wl-label text-muted"
                                  >
                                    Cancel
                                  </ShadButton>
                                  <ShadButton
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disableAnimations
                                    onClick={() =>
                                      saveManualEntry("directive", editingDirective!.content, d.id)
                                    }
                                    disabled={isSavingEntry}
                                    className="h-7 px-2.5 bg-brand/15 border-brand/40 text-brand wl-label hover:bg-brand/25"
                                  >
                                    {isSavingEntry ? "Saving..." : "Save"}
                                  </ShadButton>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2 items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="mb-1.5">
                                    <span
                                      className={cn(
                                        "wl-label inline-flex items-center gap-1 px-2 py-0.5 rounded-full tracking-[0.16em] border",
                                        d.priority <= 2
                                          ? "bg-rose-500/10 border-rose-500/30 text-rose-600"
                                          : d.priority <= 4
                                            ? "bg-brand/10 border-brand/30 text-brand"
                                            : "bg-black/[0.04] border-border text-muted",
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "w-1 h-1 rounded-full",
                                          d.priority <= 2
                                            ? "bg-rose-500"
                                            : d.priority <= 4
                                              ? "bg-brand"
                                              : "bg-muted",
                                        )}
                                      />
                                      P{d.priority}
                                    </span>
                                  </div>
                                  <div className="text-sm text-foreground/90 leading-relaxed">
                                    {d.content}
                                  </div>
                                </div>
                                <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity flex gap-1 shrink-0">
                                  <ShadButton
                                    variant="outline"
                                    size="icon"
                                    disableAnimations
                                    onClick={() =>
                                      setEditingDirective({ id: d.id, content: d.content })
                                    }
                                    aria-label="Edit directive"
                                    className="w-6 h-6 rounded-full"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </ShadButton>
                                  <ShadButton
                                    variant="outline"
                                    size="icon"
                                    disableAnimations
                                    onClick={() => deleteItem(d.id, "directive")}
                                    aria-label="Delete directive"
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
                  <div className="mt-auto pt-3 border-t border-border/60 space-y-1.5">
                    <label className="wl-label text-foreground/55">Add directive</label>
                    <div className="flex gap-1.5">
                      <Input
                        type="text"
                        value={newDirective}
                        onChange={(e) => setNewDirective(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && saveManualEntry("directive", newDirective)
                        }
                        placeholder="e.g. Never discuss competitor pricing"
                        className="flex-1 text-sm bg-muted/20 border border-border rounded-md px-3 py-2 outline-none focus:border-rose-400/50 text-foreground placeholder:text-foreground/55"
                      />
                      <ShadButton
                        type="button"
                        variant="outline"
                        size="icon"
                        disableAnimations
                        onClick={() => saveManualEntry("directive", newDirective)}
                        disabled={!newDirective || isSavingEntry}
                        aria-label="Add directive"
                        className="w-9 h-9 rounded-full bg-rose-500/15 border-rose-500/30 text-rose-500 hover:bg-rose-500/25"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </ShadButton>
                    </div>
                  </div>
                </section>

                {/* Fact Archive */}
                <section className="rounded-md wl-panel-elevated border border-border p-3 flex flex-col">
                  <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-border/60">
                    <div>
                      <h3 className="font-display italic text-lg text-foreground leading-none">
                        Fact archive
                      </h3>
                      <p className="wl-label text-foreground/55 mt-0.5">Training entries</p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-md bg-brand/15 border border-brand/30 text-brand wl-label leading-none">
                      Factual
                    </span>
                  </header>
                  <div className="space-y-2 mb-3">
                    <AnimatePresence mode="popLayout">
                      {knowledge.length === 0 ? (
                        <EmptyState
                          icon={BookOpen}
                          eyebrow={OPS_TRAINING_PANEL.knowledge.eyebrow}
                          title={OPS_TRAINING_PANEL.knowledge.title}
                          description={OPS_TRAINING_PANEL.knowledge.description}
                          density="compact"
                          withHalo={false}
                          className="py-6"
                        />
                      ) : (
                        knowledge.map((k) => (
                          <motion.div
                            layout
                            initial={{ opacity: 0, x: 6 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={k.id}
                            className="rounded-md bg-brand/8 border border-brand/20 p-3 group touch-press"
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
                                  className="w-full text-sm bg-muted/20 border border-border rounded-md px-3 py-2 outline-none focus:border-brand/50 text-foreground min-h-[80px] resize-none"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <ShadButton
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disableAnimations
                                    onClick={() => setEditingKnowledge(null)}
                                    className="h-7 px-2.5 wl-label text-muted"
                                  >
                                    Cancel
                                  </ShadButton>
                                  <ShadButton
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disableAnimations
                                    onClick={() =>
                                      saveManualEntry("knowledge", editingKnowledge!.content, k.id)
                                    }
                                    disabled={isSavingEntry}
                                    className="h-7 px-2.5 bg-brand/15 border-brand/40 text-brand wl-label hover:bg-brand/25"
                                  >
                                    {isSavingEntry ? "Saving..." : "Save"}
                                  </ShadButton>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2 items-start justify-between">
                                <div className="flex-1 text-sm text-foreground/90 leading-relaxed">
                                  {k.content}
                                </div>
                                <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity flex gap-1 shrink-0">
                                  <ShadButton
                                    variant="outline"
                                    size="icon"
                                    disableAnimations
                                    onClick={() =>
                                      setEditingKnowledge({ id: k.id, content: k.content })
                                    }
                                    aria-label="Edit Training entry"
                                    className="w-6 h-6 rounded-full"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </ShadButton>
                                  <ShadButton
                                    variant="outline"
                                    size="icon"
                                    disableAnimations
                                    onClick={() => deleteItem(k.id, "knowledge")}
                                    aria-label="Delete Training entry"
                                    className="w-6 h-6 rounded-full hover:text-brand hover:border-brand/30"
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
                  <div className="mt-auto pt-3 border-t border-border/60 space-y-1.5">
                    <label className="wl-label text-foreground/55">Add fact</label>
                    <div className="flex gap-1.5">
                      <Input
                        type="text"
                        value={newKnowledge}
                        onChange={(e) => setNewKnowledge(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && saveManualEntry("knowledge", newKnowledge)
                        }
                        placeholder="e.g. Our return policy is 30 days, no questions"
                        className="flex-1 text-sm bg-muted/20 border border-border rounded-md px-3 py-2 outline-none focus:border-brand/50 text-foreground placeholder:text-foreground/55"
                      />
                      <ShadButton
                        type="button"
                        variant="outline"
                        size="icon"
                        disableAnimations
                        onClick={() => saveManualEntry("knowledge", newKnowledge)}
                        disabled={!newKnowledge || isSavingEntry}
                        aria-label="Add Training entry"
                        className="w-9 h-9 rounded-full bg-brand/15 border-brand/30 text-brand hover:bg-brand/25"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </ShadButton>
                    </div>
                  </div>
                </section>
              </div>

              {/* AI Auto-Calibration */}
              {lessons.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-md wl-panel-elevated border border-border p-4"
                >
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-7 h-7 rounded-md bg-brand flex items-center justify-center shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-on-brand" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="font-display italic text-lg text-foreground leading-none">
                        AI auto-calibration
                      </h3>
                      <p className="wl-label text-brand">Synthetic learning engine active</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className="rounded-md bg-brand/8 border border-brand/20 p-3"
                      >
                        <div className="wl-label text-brand mb-2">Pattern learned from calls</div>
                        <p className="text-sm text-foreground/90 leading-relaxed">
                          {lesson.lesson}
                        </p>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/60">
                          <Clock className="w-3 h-3 text-foreground/55" />
                          <span className="wl-label text-foreground/55">
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
              <div className="min-h-full max-w-[1200px] mx-auto p-6 space-y-8 flex flex-col items-center">
                <div className="max-w-[560px] w-full text-center space-y-6">
                  <div className="relative w-20 h-20 rounded-md wl-panel-elevated border border-border flex items-center justify-center mx-auto">
                    <PlayCircle className="w-10 h-10 text-brand" strokeWidth={1.25} />
                  </div>
                  <div>
                    <h2 className="font-display italic text-4xl text-foreground mb-2">Test call</h2>
                    <p className="text-foreground/55 text-sm leading-relaxed max-w-md mx-auto">
                      Test how your agent responds in a safe practice run before it takes real
                      calls.
                    </p>
                  </div>
                  <div className="rounded-md wl-panel border border-border p-5 text-left space-y-4 max-w-sm mx-auto w-full">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-brand" />
                      <h4 className="font-display italic text-base text-foreground">Voice call</h4>
                    </div>
                    <p className="text-[var(--wireline-typography-caption-size)] text-[var(--wireline-color-text-secondary)]/55 leading-relaxed">
                      Speak directly with your agent through your browser microphone. Tests the
                      exact voice and persona your callers will hear.
                    </p>
                    <ShadButton
                      type="button"
                      variant={simConnected ? "destructive" : "editorial"}
                      disableAnimations
                      onClick={startTestCall}
                      disabled={simConnecting}
                      className={cn(
                        "w-full h-auto rounded-full text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.3em] py-2.5",
                        simConnected &&
                          "bg-rose-500/15 border border-rose-500/40 text-rose-500 hover:bg-rose-500/25 shadow-none",
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
                        ? "Connecting..."
                        : simConnected
                          ? "End call"
                          : "Start voice test"}
                    </ShadButton>
                    {simConnected && (
                      <div className="flex items-center justify-center gap-1.5 wl-label text-brand">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                        Live - speak now
                      </div>
                    )}
                  </div>
                </div>

                <hr className="w-full border-border my-6" />

                <div className="w-full max-w-[1000px]">
                  <RoleplaySandbox agentId={selectedAgentId} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
