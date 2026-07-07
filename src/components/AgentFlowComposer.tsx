/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
// AgentFlowComposer — neural-aligned linear stage progression editor.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  Trash2,
  ArrowRight,
  Save,
  Settings2,
  GripVertical,
  CheckCircle2,
  Workflow,
  Loader2,
  Copy,
  Sparkles,
  AlertTriangle,
  MessageSquareQuote,
} from "lucide-react";
import { AnimatePresence, Reorder } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { WL_OPS_CLASSES } from "../lib/wireline-ops-design";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

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

/**
 * Starter templates — account holders pick one to skip the blank-slate barrier.
 * Each template models a real conversation arc the four demo agents on the
 * landing page follow. Customizable after load — these are starting points
 * not constraints. Templates compose into the same FlowStep[] shape the
 * editor saves, so picking a template just seeds the steps array.
 */
/**
 * Reusable snippets the Account Holder can paste into a stage's instructions.
 * Smaller-grained than FLOW_TEMPLATES (which seed an entire flow) —
 * these are individual building blocks: an objection handler, a
 * discovery question, a soft close. Click → append to active step.
 */
const FLOW_SNIPPETS: { id: string; label: string; category: string; text: string }[] = [
  {
    id: "objection-price",
    category: "Objections",
    label: "Price pushback",
    text: "If the caller pushes back on price, ask one question to understand the comparison: 'What's the alternative you're weighing us against?' Then anchor on outcome value before discussing the number. NEVER lead with a discount.",
  },
  {
    id: "objection-busy",
    category: "Objections",
    label: "Not a good time",
    text: "If the caller says it's not a good time, ask: 'What time tomorrow works better — morning or afternoon?' Offer two specific windows. If still resistant, schedule a callback at their preferred time and confirm by SMS.",
  },
  {
    id: "discovery-pain",
    category: "Discovery",
    label: "Pain-point question",
    text: "Ask one open-ended question to surface the pain: 'Walk me through what's not working with [their current solution] today — where do you feel the friction most?' Listen for cost, time, or quality words; reflect back what you heard before proposing next steps.",
  },
  {
    id: "discovery-budget",
    category: "Discovery",
    label: "Budget probe",
    text: "Probe budget without asking directly. 'When companies your size solve this, they typically invest somewhere between $X and $Y per month — does that frame match what you've planned for?' Capture the response into customer_profile.",
  },
  {
    id: "close-soft",
    category: "Closing",
    label: "Soft close to next step",
    text: "Soft close: 'Based on what you shared, the natural next step is a 20-minute walkthrough with one of our specialists. I can book it for tomorrow morning or Thursday afternoon — which works?' Use book_appointment immediately on yes.",
  },
  {
    id: "close-trial",
    category: "Closing",
    label: "Conversation Balance offer",
    text: "Offer Conversation Balance: 'Create and train for free, then add balance when you are ready for live calls — you only pay for the minutes you use.' Send the signup link via SMS while still on the call. Confirm receipt.",
  },
  {
    id: "compliance-tcpa",
    category: "Compliance",
    label: "TCPA opt-out reminder",
    text: "If the caller asks to be removed: thank them, confirm 'I'll add you to our Do Not Call list immediately,' then use add_to_dnc. Do not attempt to retain. End the call respectfully within 30 seconds.",
  },
  {
    id: "compliance-payment",
    category: "Compliance",
    label: "Payment-promise line",
    text: "When the caller commits to a payment date, repeat it back verbatim: 'Just to confirm — you're committing to pay $X by [date], correct?' Wait for explicit 'yes' before using log_payment_promise. Tell them they'll receive a confirmation SMS within 2 minutes.",
  },
  {
    id: "transfer-frustrated",
    category: "Escalation",
    label: "Escalate angry caller",
    text: "If sentiment turns negative or the caller raises voice: 'I hear you, and I want to make sure this gets handled by a human teammate right now.' Use escalate_to_human immediately. Do NOT try to defuse or re-pitch — escalate first, defuse later via the supervisor.",
  },
];

const FLOW_TEMPLATES: Record<
  string,
  { label: string; description: string; steps: Omit<FlowStep, "id">[] }
> = {
  sales: {
    label: "Outbound Sales",
    description:
      "Cold-call SDR flow: open, qualify fit, handle the first objection, book a discovery call.",
    steps: [
      {
        name: "Open & Disarm",
        instructions:
          'Open warm and confident. Name yourself + the company in the first sentence. Earn the next 30 seconds with a permission-based ask: "Mind if I take 30 seconds to explain why I\'m calling?"',
        transitionCondition: "The prospect grants permission to continue OR pushes back politely.",
      },
      {
        name: "Qualify Fit",
        instructions:
          "Three quick discovery questions in plain English: team size, how they handle this today, biggest pain. Listen for pain signals. Don't pitch yet.",
        transitionCondition:
          "You have a clear read on team size + current setup + at least one pain point.",
      },
      {
        name: "Handle First Objection",
        instructions:
          "When the prospect raises a concern (timing, budget, status quo) — acknowledge it, reframe with a real customer parallel, then redirect to the next-step ask. Never argue.",
        transitionCondition:
          "Objection acknowledged and reframed. Prospect is open to a follow-up or has firmly declined.",
      },
      {
        name: "Book the Discovery Call",
        instructions:
          "Offer two specific time slots in their timezone. Confirm email for the calendar invite. Tell them what to expect (15 minutes, no slides, just their stack).",
        transitionCondition: "",
        isEndNode: true,
      },
    ],
  },
  cs: {
    label: "Inbound Customer Service",
    description:
      "Tier-1 support flow: greet, identify issue, triage to fix-now vs. escalate, confirm resolution.",
    steps: [
      {
        name: "Greet & Listen",
        instructions:
          'Open with the company name + your name. Ask the open-ended question: "How can I help you today?" Then shut up and listen.',
        transitionCondition: "The caller has stated their reason for calling in their own words.",
      },
      {
        name: "Identify & Triage",
        instructions:
          "Classify the issue internally: billing / outage / how-to / refund / escalation. Ask ONE clarifying question if intent is unclear by default, but you may ask multiple questions at once if you need more context to answer sufficiently. Confirm understanding back to the caller.",
        transitionCondition: "You've classified the bucket and confirmed back to the caller.",
      },
      {
        name: "Resolve or Escalate",
        instructions:
          'If you can answer from the knowledge base — do it. If it needs a human or a record lookup, set the expectation: "I\'m going to hand this to [team] who can pull your account up in real time." Use escalate_to_human if needed.',
        transitionCondition:
          "Either you've delivered the answer OR you've handed off to a human / scheduled callback.",
      },
      {
        name: "Confirm & Close",
        instructions:
          'Recap what was decided in one sentence. Offer to send the recap by email or text. Thank them. End warm: "Anything else before I let you go?"',
        transitionCondition: "",
        isEndNode: true,
      },
    ],
  },
  scheduler: {
    label: "Appointment Scheduler",
    description:
      "Patient / customer booking flow: identify caller, find a fit slot, confirm, send reminder.",
    steps: [
      {
        name: "Identify Caller",
        instructions:
          'Open with the business name + your name. Ask "Are you booking a new appointment or following up on an existing one?" Capture full name + phone if booking new.',
        transitionCondition:
          "You have caller's name + know whether this is a new or existing appointment.",
      },
      {
        name: "Capture Need",
        instructions:
          'Ask what they\'re booking for (the service type) and any time-of-day preference. Note any urgency cues ("I\'m in pain", "this is for tomorrow").',
        transitionCondition: "You have the service type + time preference.",
      },
      {
        name: "Offer Slots & Book",
        instructions:
          "Use the calendar tool to find 2-3 available slots that match their preference. Offer the soonest match first. Book with book_calendar_event once they pick.",
        transitionCondition:
          "An appointment has been booked OR they've declined every offered slot.",
      },
      {
        name: "Confirm & Send Reminder",
        instructions:
          "Recap the appointment: date, time, location, what to bring. Send the confirmation via send_text_message or send_email per their preference.",
        transitionCondition: "",
        isEndNode: true,
      },
    ],
  },
  receptionist: {
    label: "Front-Desk Receptionist",
    description:
      "Call routing flow: greet, identify who they need, route or take a message, log everything.",
    steps: [
      {
        name: "Greet & Direct",
        instructions:
          'Answer with the company name + your name + "How may I direct your call?" Listen for the person they\'re asking for OR the type of help they need.',
        transitionCondition: "Caller has told you who or what they're trying to reach.",
      },
      {
        name: "Route or Take a Message",
        instructions:
          "If the right person is available, transfer the call. If they're not, offer to take a detailed message OR schedule a callback. Capture full name, phone, reason for call, and urgency.",
        transitionCondition: "Call was transferred OR a message was captured with all four fields.",
      },
      {
        name: "Flag Urgent Items",
        instructions:
          "If the caller indicated urgency (legal, medical, billing-overdue, opportunity-loss), use escalate_to_human to notify the on-call person via Slack immediately, then continue.",
        transitionCondition: "Urgency has been assessed and escalated if warranted.",
      },
      {
        name: "Close",
        instructions:
          "Confirm what will happen next: \"I've left [name] a detailed message with your number, and they'll be in touch by [time].\" Thank them warmly.",
        transitionCondition: "",
        isEndNode: true,
      },
    ],
  },
};

type TemplateKey = keyof typeof FLOW_TEMPLATES;

export default function AgentFlowComposer({ agentId }: AgentFlowComposerProps) {
  const { error: toastError, success: toastSuccess } = useToast();
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeStepId, setActiveStepId] = useState<string>("");
  // Per-step Claude critique cache. Keyed by stepId so flipping
  // between stages doesn't drop the critique you already pulled.
  // Cleared on save (the critique might no longer apply).
  const [stepCritiques, setStepCritiques] = useState<Record<string, string>>({});
  const [coachingStepId, setCoachingStepId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  // Dirty-tracking lets us warn on navigation + drive the autosave
  // debounce. `lastSavedSnapshot` is the JSON the server has on file.
  // Comparing the current `steps` JSON against this snapshot tells us
  // whether the Account Holder has unsaved work. Cleaner than a boolean
  // because it correctly handles "Account Holder edited then reverted" —
  // those don't count as dirty.
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>("");
  const [autosaving, setAutosaving] = useState(false);
  // Mobile-only panel toggle. On <xl viewports the steps list +
  // editor panels would otherwise stack vertically — Account Holder has
  // to scroll past the full step list every time they click a row.
  // We hide the inactive panel and surface a small tab toggle so
  // mobile feels like a real two-pane app. Desktop ignores this
  // state entirely (both panels show side-by-side).
  const [mobilePanel, setMobilePanel] = useState<"steps" | "editor">("steps");

  // Append a reusable snippet to the active step's instructions. If no
  // step is active, append to the first step. Updates instructions
  // (not transitions) — snippets are content blocks the LLM uses
  // mid-stage.
  const insertSnippet = (snippetText: string) => {
    const targetId = activeStepId || steps[0]?.id;
    if (!targetId) return;
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== targetId) return s;
        const sep = s.instructions.trim().length ? "\n\n" : "";
        return { ...s, instructions: `${s.instructions}${sep}${snippetText}` };
      }),
    );
    setShowSnippets(false);
  };

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
          setLastSavedSnapshot(JSON.stringify(data.flowConfig));
        } else {
          // Default empty or starter state (only if null/undefined)
          const initialSteps = [
            {
              id: "step-1",
              name: "Greeting & Verification",
              instructions:
                "Greet the user warmly. Verify you are speaking with the decision maker. Introduce the reason for the call.",
              transitionCondition:
                "User confirms their identity and expresses willingness to continue.",
            },
          ];
          setSteps(initialSteps);
          setActiveStepId(initialSteps[0].id);
          // Starter content is not "the server's view" — it's an
          // unsaved local default. Snapshot stays empty so the
          // Account Holder's first edit (or just letting autosave fire)
          // counts as dirty and gets pushed up.
          setLastSavedSnapshot("");
        }
      } catch {
        if (active) toastError("Failed to load agent flow configuration");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchFlow();
    return () => {
      active = false;
    };
  }, [agentId, toastError]);

  const activeStepIndex = steps.findIndex((s) => s.id === activeStepId);
  const activeStep = steps[activeStepIndex];

  const handleAddStep = () => {
    const newId = `step-${Date.now()}`;
    setSteps([
      ...steps,
      {
        id: newId,
        name: "New Stage",
        instructions: "",
        transitionCondition: "",
      },
    ]);
    setActiveStepId(newId);
  };

  /**
   * Duplicate an existing step — copies the full config (instructions,
   * transition, terminal flag) and inserts the clone right after the
   * source. Common pattern: build a "qualify" stage, then duplicate for
   * a second-round qualifying call with slightly different prompts.
   */
  const handleDuplicateStep = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const source = steps.find((s) => s.id === id);
    if (!source) return;
    const idx = steps.findIndex((s) => s.id === id);
    const clone: FlowStep = {
      ...source,
      id: `step-${Date.now()}`,
      name: `${source.name} (copy)`,
    };
    const next = [...steps.slice(0, idx + 1), clone, ...steps.slice(idx + 1)];
    setSteps(next);
    setActiveStepId(clone.id);
  };

  /**
   * Seed the editor from one of the four starter templates. Idempotent
   * if steps already exist — guard against accidental overwrite by
   * confirming when there's existing content.
   */
  const handleApplyTemplate = (key: TemplateKey) => {
    const t = FLOW_TEMPLATES[key];
    if (!t) return;
    if (
      steps.length > 0 &&
      !window.confirm(
        `Replace ${steps.length} existing stage${steps.length === 1 ? "" : "s"} with the ${t.label} template?`,
      )
    ) {
      return;
    }
    const seeded = t.steps.map((s, i) => ({
      ...s,
      id: `step-${Date.now()}-${i}`,
    }));
    setSteps(seeded);
    setActiveStepId(seeded[0]?.id ?? "");
    toastSuccess(`${t.label} template applied`);
  };

  /**
   * Surface-level validation surfaced as a non-blocking banner. We don't
   * stop the save — account holders may genuinely want to draft a half-finished
   * flow and come back — but we tell them what's incomplete so they can
   * fix it before going live.
   */
  const validationIssues = useMemo(() => {
    const issues: { stepId: string; message: string }[] = [];
    for (const s of steps) {
      if (!s.name.trim()) issues.push({ stepId: s.id, message: "stage is missing a name" });
      if (!s.instructions.trim())
        issues.push({ stepId: s.id, message: `${s.name || "stage"}: instructions are empty` });
      if (!s.isEndNode && !s.transitionCondition.trim())
        issues.push({
          stepId: s.id,
          message: `${s.name || "stage"}: needs a transition condition or terminal flag`,
        });
    }
    return issues;
  }, [steps]);

  const handleRemoveStep = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSteps = steps.filter((s) => s.id !== id);
    setSteps(newSteps);
    if (activeStepId === id && newSteps.length > 0) {
      setActiveStepId(newSteps[0].id);
    }
  };

  const handleUpdateStep = (id: string, field: keyof FlowStep, value: string | boolean) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  // Blocking validation: empty stage name, missing instructions on any
  // step, or a non-terminal step with no transition condition. These
  // make the saved flow useless at runtime because the LLM won't know
  // when to advance — Account Holder MUST fix before save lands.
  const blockingIssues = useMemo(() => validationIssues.filter(() => true), [validationIssues]);

  /**
   * Persist the current step list. Pulled out as a callback so the
   * autosave effect below can fire it without duplicating the POST.
   * `silent` mode suppresses success toasts (used by autosave so the
   * Account Holder doesn't see a toast every 3 seconds of editing).
   */
  const saveFlow = useCallback(
    async (silent = false): Promise<boolean> => {
      if (blockingIssues.length > 0) {
        if (!silent) {
          toastError(
            "Fix flow issues first",
            `${blockingIssues.length} step${blockingIssues.length === 1 ? "" : "s"} need attention before save.`,
          );
        }
        return false;
      }
      if (silent) setAutosaving(true);
      else {
        setIsSaving(true);
        setSaveSuccess(false);
      }
      try {
        const res = await authFetch(`/api/agent-config/${agentId}/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "flow", content: steps }),
        });
        if (!res.ok) throw new Error("Save failed");
        // Update the snapshot — the server now matches `steps`, so the
        // dirty indicator goes quiet until the next edit.
        setLastSavedSnapshot(JSON.stringify(steps));
        if (!silent) {
          setSaveSuccess(true);
          toastSuccess("Flow configuration saved");
          setTimeout(() => setSaveSuccess(false), 2500);
        }
        return true;
      } catch {
        if (!silent) toastError("Failed to save flow configuration");
        return false;
      } finally {
        if (silent) setAutosaving(false);
        else setIsSaving(false);
      }
    },
    [agentId, blockingIssues.length, steps, toastError, toastSuccess],
  );

  const handleSave = () => saveFlow(false);

  // Dirty-state computation. JSON-compare against the snapshot so
  // "edit then undo back to identical" doesn't false-fire warnings.
  const currentSnapshot = useMemo(() => JSON.stringify(steps), [steps]);
  const isDirty = !isLoading && currentSnapshot !== lastSavedSnapshot;

  // Autosave: 3-second idle debounce. Only fires when:
  //   - the flow is dirty
  //   - validation passes (no half-built flow gets pushed)
  //   - we're not already mid-save
  // Silent mode — no toast spam during normal editing flow.
  useEffect(() => {
    if (isLoading) return;
    if (!isDirty) return;
    if (blockingIssues.length > 0) return;
    if (isSaving || autosaving) return;
    const t = setTimeout(() => {
      void saveFlow(true);
    }, 3_000);
    return () => clearTimeout(t);
  }, [currentSnapshot, isDirty, isLoading, blockingIssues.length, isSaving, autosaving, saveFlow]);

  // beforeunload warning when the Account Holder tries to leave with
  // unsaved edits. Browser-native dialog; chrome owns the copy.
  // No-op when clean so we don't false-warn on every tab close.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message but still show a dialog
      // as long as returnValue is set or default is prevented.
      e.returnValue = "You have unsaved flow changes. Leave anyway?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-primary">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="wl-label">Loading Neural Flow...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col xl:flex-row gap-4 p-4 lg:p-6 overflow-hidden">
      {/* Mobile-only panel toggle (hidden on xl+ where both panes
          are visible side-by-side). Sticky tab pill that switches
          between the Steps list and the Editor. Highlights the
          active panel + shows the step count for context. */}
      <div className="xl:hidden flex items-center gap-1 p-1 rounded-md wl-panel border border-border self-start">
        <ShadButton
          type="button"
          variant="ghost"
          size="sm"
          disableAnimations
          onClick={() => setMobilePanel("steps")}
          className={cn(
            "h-auto px-3 py-1.5 rounded-md wl-label font-medium",
            mobilePanel === "steps"
              ? "bg-brand text-on-brand hover:bg-brand hover:text-on-brand"
              : "text-muted hover:text-foreground",
          )}
        >
          Steps · {steps.length}
        </ShadButton>
        <ShadButton
          type="button"
          variant="ghost"
          size="sm"
          disableAnimations
          onClick={() => setMobilePanel("editor")}
          className={cn(
            "h-auto px-3 py-1.5 rounded-md wl-label font-medium",
            mobilePanel === "editor"
              ? "bg-brand text-on-brand hover:bg-brand hover:text-on-brand"
              : "text-muted hover:text-foreground",
          )}
        >
          Editor
        </ShadButton>
      </div>

      {/* Left Column: Linear Visualizer / List */}
      <div
        className={cn(
          "w-full xl:w-1/3 flex flex-col gap-3 min-h-0",
          // On <xl, hide when the editor pane is active. xl+ always shows both.
          mobilePanel === "editor" ? "hidden xl:flex" : "flex",
        )}
      >
        <div className="wl-panel border border-border rounded-md p-4 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display italic text-xl text-foreground flex items-center gap-2">
                <Workflow className="w-5 h-5 text-primary" />
                Conversation Flow
              </h3>
              <p className="wl-label text-foreground/55 mt-1">Linear stage progression</p>
            </div>
            <ShadButton
              type="button"
              variant="outline"
              size="icon"
              disableAnimations
              onClick={handleAddStep}
              aria-label="Add stage"
              className="w-9 h-9 rounded-full border-primary/30 text-primary hover:bg-primary/10"
            >
              <Plus className="w-4 h-4" />
            </ShadButton>
          </div>

          {/* Template picker — account holders rarely want a blank slate.
            Seeded flows for the 4 demo agent archetypes get them to a
            working draft in one click, then they customize. */}
          <div className="pt-3 border-t border-border/50 space-y-2">
            <div className="flex items-center gap-1.5 wl-micro-meta">
              <Sparkles className="w-3 h-3 text-primary" /> Start from a template
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(FLOW_TEMPLATES) as TemplateKey[]).map((key) => (
                <ShadButton
                  key={key}
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  onClick={() => handleApplyTemplate(key)}
                  title={FLOW_TEMPLATES[key].description}
                  className="h-auto w-full justify-start text-left rounded-md border-border px-2.5 py-1.5 wl-micro-meta text-foreground/85 hover:border-primary/40 hover:text-primary truncate"
                >
                  {FLOW_TEMPLATES[key].label}
                </ShadButton>
              ))}
            </div>
          </div>

          {/* Snippet drawer — paste building-block prose into the active
              stage's instructions. Smaller-grained than templates: an
              objection handler, a discovery question, a compliance line.
              Groups by category so account holders can scan for the pattern
              they need. */}
          <div className="pt-3 border-t border-border/50 space-y-2">
            <ShadButton
              type="button"
              variant="ghost"
              disableAnimations
              onClick={() => setShowSnippets((v) => !v)}
              className="w-full h-auto justify-between gap-2 wl-micro-meta hover:text-foreground px-0"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary" />
                Insert a snippet
              </span>
              <span className="text-foreground/55">{showSnippets ? "−" : "+"}</span>
            </ShadButton>
            {showSnippets && (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {Array.from(new Set(FLOW_SNIPPETS.map((s) => s.category))).map((cat) => (
                  <div key={cat} className="space-y-1">
                    <div className="wl-label text-primary/70">{cat}</div>
                    {FLOW_SNIPPETS.filter((s) => s.category === cat).map((snip) => (
                      <ShadButton
                        key={snip.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        disableAnimations
                        onClick={() => insertSnippet(snip.text)}
                        title={snip.text}
                        className="h-auto w-full justify-start text-left rounded-md border-border px-2.5 py-1.5 wl-micro-meta text-foreground/85 hover:border-primary/40 hover:text-primary"
                      >
                        {snip.label}
                      </ShadButton>
                    ))}
                  </div>
                ))}
                <p className="wl-micro-meta leading-relaxed pt-2 border-t border-border/50">
                  Adds the snippet to the currently selected stage's instructions. Edit after
                  pasting.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Validation banner — non-blocking. Shows account holders what's
          incomplete without preventing them from saving a draft. */}
        {validationIssues.length > 0 && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5 shrink-0">
            <div className="flex items-center gap-1.5 wl-label text-primary">
              <AlertTriangle className="w-3 h-3" />
              {validationIssues.length} item{validationIssues.length === 1 ? "" : "s"} to finish
            </div>
            <ul className="text-[var(--wireline-typography-caption-size)] text-[var(--wireline-color-text-secondary)]/70 leading-snug space-y-0.5 max-h-24 overflow-y-auto">
              {validationIssues.slice(0, 6).map((v, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-primary shrink-0">·</span>
                  <span>{v.message}</span>
                </li>
              ))}
              {validationIssues.length > 6 && (
                <li className="wl-micro-meta">+{validationIssues.length - 6} more</li>
              )}
            </ul>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide rounded-md border border-border/50 bg-muted/50 p-2">
          {steps.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50 p-6 text-center">
              <Workflow className="w-8 h-8 text-muted mb-3" />
              <p className="text-sm text-muted">No stages defined.</p>
            </div>
          ) : (
            <Reorder.Group axis="y" values={steps} onReorder={setSteps} className="space-y-2">
              <AnimatePresence>
                {steps.map((step, index) => (
                  <Reorder.Item key={step.id} value={step} className="relative">
                    {/* Connecting line */}
                    {index < steps.length - 1 && (
                      <div className="absolute left-6 top-10 bottom-[-16px] w-0.5 bg-primary/20 z-0" />
                    )}

                    <div
                      role="button"
                      tabIndex={0}
                      aria-current={activeStepId === step.id ? "true" : undefined}
                      aria-label={`Edit stage ${index + 1}: ${step.name || "Unnamed Stage"}`}
                      onClick={() => {
                        setActiveStepId(step.id);
                        // On mobile, clicking a step should jump
                        // straight into the editor pane instead of
                        // leaving the Account Holder stuck on the list.
                        // Desktop ignores this (both panes visible).
                        setMobilePanel("editor");
                      }}
                      onKeyDown={(e) => {
                        // Ignore Enter/Space bubbling up from the inner
                        // duplicate/delete buttons.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveStepId(step.id);
                          setMobilePanel("editor");
                        }
                      }}
                      className={cn(
                        "relative z-10 flex items-center gap-3 p-3 rounded-md border transition-all cursor-pointer group",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                        activeStepId === step.id
                          ? "bg-primary/10 border-primary/40 shadow-[var(--wireline-elevation-sm)]"
                          : "wl-panel border-border hover:border-primary/30",
                      )}
                    >
                      <div className="cursor-grab active:cursor-grabbing text-foreground/55 hover:text-foreground/70 transition-colors shrink-0">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center shrink-0 border wl-micro-badge font-mono",
                          activeStepId === step.id
                            ? "bg-brand text-on-brand border-brand"
                            : "bg-muted/50 text-muted border-border/50",
                        )}
                      >
                        {index + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            "text-sm font-medium truncate",
                            activeStepId === step.id ? "text-primary" : "text-foreground/80",
                          )}
                        >
                          {step.name || "Unnamed Stage"}
                        </div>
                        {step.isEndNode && (
                          <div className="wl-label text-rose-400 mt-0.5">Terminal Node</div>
                        )}
                      </div>

                      <ShadButton
                        type="button"
                        variant="ghost"
                        size="icon"
                        disableAnimations
                        onClick={(e) => handleDuplicateStep(step.id, e)}
                        aria-label="Duplicate stage"
                        title="Duplicate stage"
                        className="w-7 h-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 text-foreground/55 hover:text-primary hover:bg-primary/10"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </ShadButton>
                      <ShadButton
                        type="button"
                        variant="ghost"
                        size="icon"
                        disableAnimations
                        onClick={(e) => handleRemoveStep(step.id, e)}
                        aria-label="Delete stage"
                        title="Delete stage"
                        className="w-7 h-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 text-foreground/55 hover:text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </ShadButton>
                    </div>
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
          )}
        </div>
      </div>

      {/* Right Column: Stage Editor */}
      <div
        className={cn(
          "w-full xl:w-2/3 flex flex-col min-h-0",
          // Hide editor on mobile when steps tab is active. xl+ ignores.
          mobilePanel === "steps" ? "hidden xl:flex" : "flex",
        )}
      >
        <div className="flex-1 wl-panel border border-border rounded-md flex flex-col overflow-hidden">
          {activeStep ? (
            <div className="flex-1 flex flex-col h-full overflow-y-auto scrollbar-hide">
              <div className="p-5 md:p-6 border-b border-border flex flex-wrap items-center justify-between gap-4 sticky top-0 bg-card/80 backdrop-blur-xl z-20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-display italic text-xl shrink-0">
                    {activeStepIndex + 1}
                  </div>
                  <div>
                    <Input
                      type="text"
                      value={activeStep.name}
                      onChange={(e) => handleUpdateStep(activeStep.id, "name", e.target.value)}
                      placeholder="Stage Name"
                      className="bg-transparent text-xl font-display italic text-foreground outline-none placeholder:text-foreground/55 w-full"
                    />
                    <div className="wl-label text-foreground/55 mt-0.5">Stage definition</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <Checkbox
                      checked={!!activeStep.isEndNode}
                      onChange={(e) =>
                        handleUpdateStep(activeStep.id, "isEndNode", e.target.checked)
                      }
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                        activeStep.isEndNode
                          ? "bg-rose-500 border-rose-500"
                          : "wl-panel border-border group-hover:border-rose-500/50",
                      )}
                    >
                      {activeStep.isEndNode && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className="wl-label-muted group-hover:text-foreground transition-colors">
                      Terminal stage (Ends call)
                    </span>
                  </label>

                  {/* Dirty / autosave indicator — sits to the left of
                      the Save button so the Account Holder sees state at a
                      glance. Three states:
                        autosaving   → "Saving…" with spinner
                        dirty        → "Unsaved" amber chip
                        clean        → silent (no chip)
                      We deliberately don't show "Saved ✓" here — the
                      Save button itself already does that. */}
                  {autosaving ? (
                    <span className="inline-flex items-center gap-1.5 wl-label text-muted">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Saving
                    </span>
                  ) : isDirty ? (
                    <span className="inline-flex items-center gap-1.5 wl-label text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                      Unsaved
                    </span>
                  ) : null}
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-9 px-4 rounded-full bg-primary/10 border-primary/30 text-primary wl-label hover:bg-primary/15 ml-2"
                  >
                    {isSaving ? (
                      <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : saveSuccess ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {saveSuccess ? "Saved" : "Save Flow"}
                  </ShadButton>
                </div>
              </div>

              <div className="p-5 md:p-6 space-y-6">
                {/* Agent Instructions */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Settings2 className="w-4 h-4" />
                    <h4 className="text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.3em]">
                      Agent Instructions
                    </h4>
                  </div>
                  <p className="text-[var(--wireline-typography-caption-size)] text-[var(--wireline-color-text-secondary)]/55 leading-relaxed max-w-2xl">
                    What should the agent say and do while in this stage? Be specific about the
                    goals, questions to ask, and tone to maintain.
                  </p>
                  <textarea
                    value={activeStep.instructions}
                    onChange={(e) =>
                      handleUpdateStep(activeStep.id, "instructions", e.target.value)
                    }
                    placeholder="e.g. You are now qualifying the lead. Ask about their budget and timeline. Do not mention specific pricing yet."
                    className="w-full h-40 bg-muted border border-border rounded-md p-4 text-sm text-foreground leading-relaxed resize-none focus:outline-none focus:border-primary/40 transition-colors placeholder:text-muted-foreground"
                  />
                  {/* Pacing / length hints — account holders tend to write
                      either too terse ("be friendly") or too verbose
                      (paragraphs). Surfacing word count + estimated
                      read-aloud time + a soft cap keeps stages in the
                      sweet spot. ~150 words / 60 sec is plenty for
                      most stages; over that and the agent starts to
                      monologue. */}
                  {(() => {
                    const words = activeStep.instructions
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean).length;
                    // ~155 words per minute average TTS rate at
                    // Vapi's default speed; ~12 words ≈ 5 seconds.
                    const seconds = Math.max(0, Math.round((words / 155) * 60));
                    const tooLong = words > 200;
                    const tooShort = words > 0 && words < 8;
                    return (
                      <div className="flex items-center justify-between wl-micro-meta -mt-1 px-1">
                        <span
                          className={cn(tooLong && "text-primary", tooShort && "text-rose-500")}
                        >
                          {words === 0
                            ? "Write what the agent should say in this stage"
                            : `${words} word${words === 1 ? "" : "s"} · ~${seconds}s read-aloud`}
                          {tooLong && " · too long for one stage, consider splitting"}
                          {tooShort && " · too vague, agent will need more guidance"}
                        </span>
                        {words > 0 && (
                          <span className="text-foreground/55">target 30–150 words</span>
                        )}
                      </div>
                    );
                  })()}
                  {/* Per-step Claude critique — Account Holder clicks the
                      button, we POST the stage to /api/claude/coach-step,
                      Claude returns 4-5 bullets covering clarity / edge
                      cases / transition / tone / suggested rewrite.
                      Result is cached per stepId until next save. */}
                  <div className="space-y-2 pt-2">
                    <ShadButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disableAnimations
                      disabled={
                        coachingStepId === activeStep.id ||
                        activeStep.instructions.trim().length < 10
                      }
                      onClick={async () => {
                        setCoachingStepId(activeStep.id);
                        try {
                          const r = await authFetch("/api/claude/coach-step", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              name: activeStep.name,
                              instructions: activeStep.instructions,
                              transitionCondition: activeStep.transitionCondition,
                              isEndNode: activeStep.isEndNode,
                            }),
                          });
                          const data = await r.json();
                          if (r.ok && data.critique) {
                            setStepCritiques((prev) => ({
                              ...prev,
                              [activeStep.id]: data.critique,
                            }));
                            if (typeof window !== "undefined" && (window as any).plausible) {
                              (window as any).plausible("StepCoachUsed");
                            }
                          } else {
                            toastError("Coach unavailable", data.error || "Try again in a moment");
                          }
                        } catch {
                          toastError("Coach failed", "Couldn't reach Wireline AI — try again");
                        } finally {
                          setCoachingStepId(null);
                        }
                      }}
                      className="rounded-full border-primary/30 wl-label text-primary hover:bg-primary/8"
                    >
                      {coachingStepId === activeStep.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Wireline AI is reviewing…
                        </>
                      ) : (
                        <>
                          <MessageSquareQuote className="w-3 h-3" />
                          {stepCritiques[activeStep.id]
                            ? "Re-coach this stage"
                            : "Ask Wireline AI to coach this stage"}
                        </>
                      )}
                    </ShadButton>
                    {stepCritiques[activeStep.id] && (
                      <div className="rounded-md wl-panel border border-brand/15 p-3 text-[var(--wireline-typography-body-size)] text-[var(--wireline-color-text-primary)]/85 leading-relaxed whitespace-pre-wrap">
                        {stepCritiques[activeStep.id]}
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-px bg-white/5 w-full" />

                {/* Transition Condition */}
                {!activeStep.isEndNode ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-primary">
                      <ArrowRight className="w-4 h-4" />
                      <h4 className="text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.3em]">
                        Transition Condition
                      </h4>
                    </div>
                    <p className="text-[var(--wireline-typography-caption-size)] text-[var(--wireline-color-text-secondary)]/55 leading-relaxed max-w-2xl">
                      When should the agent naturally progress to the next stage? The LLM evaluates
                      this condition continuously.
                    </p>
                    <div className="relative">
                      <div className="absolute left-4 top-4 text-primary/50">IF:</div>
                      <textarea
                        value={activeStep.transitionCondition}
                        onChange={(e) =>
                          handleUpdateStep(activeStep.id, "transitionCondition", e.target.value)
                        }
                        placeholder="e.g. The user has provided their email address and expressed interest in a demo."
                        className="w-full h-24 bg-muted border border-border rounded-md pl-12 pr-4 py-4 text-sm text-foreground leading-relaxed resize-none focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground"
                      />
                    </div>

                    {/* Visual indicator of next step */}
                    {activeStepIndex < steps.length - 1 && (
                      <div className="flex items-center gap-3 mt-4 opacity-70">
                        <div className={cn(WL_OPS_CLASSES.divider, "flex-1")} aria-hidden />
                        <div className="flex items-center gap-2 wl-label text-muted">
                          Proceeds to:{" "}
                          <span className="text-[var(--wireline-color-text-primary)] font-medium normal-case tracking-normal text-[var(--wireline-typography-caption-size)]">
                            {steps[activeStepIndex + 1].name}
                          </span>
                        </div>
                        <div className={cn(WL_OPS_CLASSES.divider, "flex-1")} aria-hidden />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-6 h-6 text-rose-500" />
                    </div>
                    <h4 className="text-sm font-medium text-foreground mb-1">Terminal Stage</h4>
                    <p className="text-[var(--wireline-typography-overline-size)] text-foreground/55 max-w-md mx-auto">
                      The call will gracefully end when the instructions in this stage have been
                      fulfilled. No transition condition is required.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-md wl-panel border border-border flex items-center justify-center mb-4">
                <Workflow className="w-8 h-8 text-foreground/55" />
              </div>
              <h3 className="font-display italic text-2xl text-foreground/80 mb-2">
                Select a Stage
              </h3>
              <p className="text-sm text-muted max-w-md">
                Click on a stage from the flow on the left to edit its instructions and transition
                logic.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
