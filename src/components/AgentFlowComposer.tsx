import React, { useState, useEffect } from "react";
import { Plus, Trash2, ArrowRight, Save, Play, Settings2, GripVertical, CheckCircle2, ChevronRight, Workflow, Loader2 } from "lucide-react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

// Linear step definition for the agent flow
export interface FlowStep {
  id: string;
  name: string;
  instructions: string;
  transitionCondition: string;
  isEndNode?: boolean;
}

interface AgentFlowComposerProps {
  agentId: string;
}

export default function AgentFlowComposer({ agentId }: AgentFlowComposerProps) {
  const { error: toastError, success: toastSuccess } = useToast();
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeStepId, setActiveStepId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchFlow = async () => {
      setIsLoading(true);
      try {
        const res = await authFetch(`/api/agent-config/${agentId}`);
        const data = await res.json();
        if (!active) return;
        
        if (data.flowConfig && Array.isArray(data.flowConfig)) {
          setSteps(data.flowConfig);
          setActiveStepId(data.flowConfig[0]?.id || "");
        } else {
          // Default empty or starter state (only if null/undefined)
          const initialSteps = [
            {
              id: "step-1",
              name: "Greeting & Verification",
              instructions: "Greet the user warmly. Verify you are speaking with the decision maker. Introduce the reason for the call.",
              transitionCondition: "User confirms their identity and expresses willingness to continue.",
            }
          ];
          setSteps(initialSteps);
          setActiveStepId(initialSteps[0].id);
        }
      } catch (err) {
        if (active) toastError("Failed to load agent flow configuration");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchFlow();
    return () => { active = false; };
  }, [agentId, toastError]);

  const activeStepIndex = steps.findIndex(s => s.id === activeStepId);
  const activeStep = steps[activeStepIndex];

  const handleAddStep = () => {
    const newId = `step-${Date.now()}`;
    setSteps([...steps, {
      id: newId,
      name: "New Stage",
      instructions: "",
      transitionCondition: "",
    }]);
    setActiveStepId(newId);
  };

  const handleRemoveStep = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSteps = steps.filter(s => s.id !== id);
    setSteps(newSteps);
    if (activeStepId === id && newSteps.length > 0) {
      setActiveStepId(newSteps[0].id);
    }
  };

  const handleUpdateStep = (id: string, field: keyof FlowStep, value: any) => {
    setSteps(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    
    try {
      const res = await authFetch(`/api/agent-config/${agentId}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "flow",
          content: steps,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      
      setSaveSuccess(true);
      toastSuccess("Flow configuration saved");
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      toastError("Failed to save flow configuration");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-brand">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-[10px] uppercase tracking-[0.3em]">Loading Neural Flow...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col xl:flex-row gap-4 p-4 lg:p-6 overflow-hidden">
      {/* Left Column: Linear Visualizer / List */}
      <div className="w-full xl:w-1/3 flex flex-col gap-3 min-h-0">
        <div className="glass border border-white/10 rounded-2xl p-4 shrink-0 flex items-center justify-between">
          <div>
            <h3 className="font-display italic text-xl text-ink flex items-center gap-2">
              <Workflow className="w-5 h-5 text-brand" />
              Conversation Flow
            </h3>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-1">
              Linear stage progression
            </p>
          </div>
          <button 
            onClick={handleAddStep}
            className="w-8 h-8 rounded-full glass border border-brand/30 text-brand flex items-center justify-center hover:bg-brand/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide rounded-2xl border border-white/5 bg-black/10 p-2">
          {steps.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50 p-6 text-center">
              <Workflow className="w-8 h-8 text-muted mb-3" />
              <p className="text-sm text-muted">No stages defined.</p>
            </div>
          ) : (
            <Reorder.Group 
              axis="y" 
              values={steps} 
              onReorder={setSteps} 
              className="space-y-2"
            >
              <AnimatePresence>
                {steps.map((step, index) => (
                  <Reorder.Item
                    key={step.id}
                    value={step}
                    className="relative"
                  >
                    {/* Connecting line */}
                    {index < steps.length - 1 && (
                      <div className="absolute left-6 top-10 bottom-[-16px] w-0.5 bg-brand/20 z-0" />
                    )}

                    <div 
                      onClick={() => setActiveStepId(step.id)}
                      className={cn(
                        "relative z-10 flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group",
                        activeStepId === step.id 
                          ? "bg-brand/10 border-brand/40 shadow-[0_0_15px_rgba(10,200,212,0.1)]" 
                          : "glass border-white/10 hover:border-white/30"
                      )}
                    >
                      <div className="cursor-grab active:cursor-grabbing text-muted/40 hover:text-ink/60 transition-colors shrink-0">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 border text-[10px] font-mono",
                        activeStepId === step.id 
                          ? "bg-brand text-paper border-brand" 
                          : "bg-black/20 text-muted border-white/20"
                      )}>
                        {index + 1}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "text-sm font-medium truncate",
                          activeStepId === step.id ? "text-brand" : "text-ink/80"
                        )}>
                          {step.name || "Unnamed Stage"}
                        </div>
                        {step.isEndNode && (
                          <div className="text-[9px] uppercase tracking-[0.2em] text-rose-400 mt-0.5">
                            Terminal Node
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={(e) => handleRemoveStep(step.id, e)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-muted/40 hover:text-rose-500 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
          )}
        </div>
      </div>

      {/* Right Column: Stage Editor */}
      <div className="w-full xl:w-2/3 flex flex-col min-h-0">
        <div className="flex-1 glass border border-white/10 rounded-2xl flex flex-col overflow-hidden">
          {activeStep ? (
            <div className="flex-1 flex flex-col h-full overflow-y-auto scrollbar-hide">
              <div className="p-5 md:p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 sticky top-0 bg-paper/80 backdrop-blur-xl z-20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand font-display italic text-xl shrink-0">
                    {activeStepIndex + 1}
                  </div>
                  <div>
                    <input
                      type="text"
                      value={activeStep.name}
                      onChange={(e) => handleUpdateStep(activeStep.id, "name", e.target.value)}
                      placeholder="Stage Name"
                      className="bg-transparent text-xl font-display italic text-ink outline-none placeholder:text-muted/40 w-full"
                    />
                    <div className="text-[10px] uppercase tracking-[0.3em] text-muted/60 mt-0.5">
                      Stage definition
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={!!activeStep.isEndNode}
                      onChange={(e) => handleUpdateStep(activeStep.id, "isEndNode", e.target.checked)}
                      className="sr-only"
                    />
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      activeStep.isEndNode ? "bg-rose-500 border-rose-500" : "glass border-white/20 group-hover:border-rose-500/50"
                    )}>
                      {activeStep.isEndNode && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted group-hover:text-ink transition-colors">
                      Terminal stage (Ends call)
                    </span>
                  </label>
                  
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-9 px-4 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-all flex items-center gap-2 ml-2"
                  >
                    {isSaving ? (
                      <div className="w-3.5 h-3.5 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                    ) : saveSuccess ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {saveSuccess ? "Saved" : "Save Flow"}
                  </button>
                </div>
              </div>

              <div className="p-5 md:p-6 space-y-6">
                {/* Agent Instructions */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-brand">
                    <Settings2 className="w-4 h-4" />
                    <h4 className="text-[11px] uppercase tracking-[0.3em]">Agent Instructions</h4>
                  </div>
                  <p className="text-[11px] text-muted/70 leading-relaxed max-w-2xl">
                    What should the agent say and do while in this stage? Be specific about the goals, questions to ask, and tone to maintain.
                  </p>
                  <textarea
                    value={activeStep.instructions}
                    onChange={(e) => handleUpdateStep(activeStep.id, "instructions", e.target.value)}
                    placeholder="e.g. You are now qualifying the lead. Ask about their budget and timeline. Do not mention specific pricing yet."
                    className="w-full h-40 bg-black/10 border border-white/10 rounded-xl p-4 text-sm text-ink leading-relaxed resize-none focus:outline-none focus:border-brand/40 transition-colors placeholder:text-muted/30"
                  />
                </div>

                <div className="h-px bg-white/5 w-full" />

                {/* Transition Condition */}
                {!activeStep.isEndNode ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-emerald-500">
                      <ArrowRight className="w-4 h-4" />
                      <h4 className="text-[11px] uppercase tracking-[0.3em]">Transition Condition</h4>
                    </div>
                    <p className="text-[11px] text-muted/70 leading-relaxed max-w-2xl">
                      When should the agent naturally progress to the next stage? The LLM evaluates this condition continuously.
                    </p>
                    <div className="relative">
                      <div className="absolute left-4 top-4 text-emerald-500/50">
                        IF:
                      </div>
                      <textarea
                        value={activeStep.transitionCondition}
                        onChange={(e) => handleUpdateStep(activeStep.id, "transitionCondition", e.target.value)}
                        placeholder="e.g. The user has provided their email address and expressed interest in a demo."
                        className="w-full h-24 bg-black/10 border border-emerald-500/20 rounded-xl pl-12 pr-4 py-4 text-sm text-ink leading-relaxed resize-none focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-muted/30"
                      />
                    </div>
                    
                    {/* Visual indicator of next step */}
                    {activeStepIndex < steps.length - 1 && (
                      <div className="flex items-center gap-3 mt-4 opacity-70">
                        <div className="h-px flex-1 bg-white/10" />
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted">
                          Proceeds to: <span className="text-ink font-medium">{steps[activeStepIndex + 1].name}</span>
                        </div>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-6 h-6 text-rose-500" />
                    </div>
                    <h4 className="text-sm font-medium text-ink mb-1">Terminal Stage</h4>
                    <p className="text-[11px] text-muted/70 max-w-md mx-auto">
                      The call will gracefully end when the instructions in this stage have been fulfilled. 
                      No transition condition is required.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl glass border border-white/10 flex items-center justify-center mb-4">
                <Workflow className="w-8 h-8 text-muted/30" />
              </div>
              <h3 className="font-display italic text-2xl text-ink/80 mb-2">Select a Stage</h3>
              <p className="text-sm text-muted max-w-md">
                Click on a stage from the flow on the left to edit its instructions and transition logic.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
