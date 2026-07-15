import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Loader2, Check, Phone, WandSparkles, X, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Textarea,
} from "./atoms";
import { StatusNotice } from "./molecules";
import CreateAgentCatalogFacePicker, {
  type FacePickerValue,
} from "./create-agent/CreateAgentCatalogFacePicker";
import VoicePickerField, { type VoicePickerValue } from "./create-agent/VoicePickerField";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { authFetch, safeJson } from "../lib/api";
import { stashPostCreateWizard, type PostCreateWizardPayload } from "../lib/wireline-create-flow";
import { setPostSignupFlowActive } from "../lib/post-signup-onboarding";
import { emitProductEvent } from "../lib/product-event-client";
import { defaultPresenterPhoneVoicePayload } from "../lib/voice-catalog";
import { WL_APP_CLASSES } from "../lib/wireline-design-system";

const ROLE_TEMPLATES = [
  {
    value: "scheduler",
    label: "Scheduler",
    personalPrompt: "Book, confirm, and reschedule my appointments.",
    businessPrompt: "Book meetings, confirm appointments, and text every update.",
  },
  {
    value: "receptionist",
    label: "Receptionist",
    personalPrompt: "Screen unknown callers, take messages, and only interrupt me when needed.",
    businessPrompt: "Answer the line, capture caller intent, and route each handoff cleanly.",
  },
  {
    value: "customer_service",
    label: "Support",
    personalPrompt: "Wait on hold, ask for updates, and send me the resolution.",
    businessPrompt: "Answer support questions, verify context, and escalate urgent work.",
  },
  {
    value: "sales",
    label: "Sales",
    personalPrompt: "Qualify side-hustle inquiries, capture details, and text me the next step.",
    businessPrompt: "Qualify inbound demand, capture buying context, and route hot opportunities.",
  },
  {
    value: "custom",
    label: "Custom",
    personalPrompt: "Handle a custom personal workflow and text me what happened.",
    businessPrompt: "Handle a custom business workflow and log every outcome.",
  },
] as const;

const PERSONALITY_OPTIONS = ["Clear", "Warm", "Direct", "Polished"] as const;

const FAST_START_SELECTED =
  "border-primary bg-[var(--wireline-color-action-primary-container)] text-primary";
const FAST_START_IDLE =
  "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground";

type Role = (typeof ROLE_TEMPLATES)[number]["value"];
type Personality = (typeof PERSONALITY_OPTIONS)[number];
type Posture = "personal" | "business";

function defaultAgentName(posture: Posture, role: Role) {
  if (posture === "personal") return "Sarah";
  if (role === "sales") return "Revenue Desk";
  if (role === "customer_service") return "Support Desk";
  if (role === "scheduler") return "Scheduling Desk";
  if (role === "custom") return "Wireline Employee";
  return "Front Desk";
}

function defaultBrief(posture: Posture) {
  return posture === "business"
    ? "Qualify inbound demand, answer support questions, route urgent calls, and text every outcome."
    : "Answer unknown callers, book appointments, take messages, and text me what happened.";
}

function defaultRole(posture: Posture): Role {
  return posture === "business" ? "sales" : "scheduler";
}

export default function CreateAgentDialog({
  open,
  onClose,
  onCreated,
  initialBrief = "",
  business = false,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (payload: PostCreateWizardPayload) => void;
  initialBrief?: string;
  business?: boolean;
}) {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const { refresh } = useAgents();
  const [posture, setPosture] = useState<Posture>(business ? "business" : "personal");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>(defaultRole(business ? "business" : "personal"));
  const [voice, setVoice] = useState<VoicePickerValue>({ mode: "auto" });
  const [matchedPresenterVoice, setMatchedPresenterVoice] = useState<{
    voiceId: string;
    name: string;
  } | null>(null);
  const [face, setFace] = useState<FacePickerValue>({ mode: "wireline" });
  const [personality, setPersonality] = useState<Personality>("Warm");
  const [brief, setBrief] = useState(initialBrief);
  const [provisionNumber, setProvisionNumber] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const voiceSectionRef = useRef<HTMLDivElement>(null);
  const activePosture: Posture = posture;

  useEffect(() => {
    if (!open) return;
    const nextPosture = business ? "business" : "personal";
    setPosture(nextPosture);
    setRole(defaultRole(nextPosture));
    setName("");
    setVoice({ mode: "auto" });
    setMatchedPresenterVoice(null);
    setFace({ mode: "wireline" });
    setPersonality("Warm");
    setProvisionNumber(false);
    setBrief(initialBrief || defaultBrief(nextPosture));
    setStep(1);
    setError("");
    const frame = requestAnimationFrame(() => briefRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [business, initialBrief, open]);

  function close() {
    if (creating) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("create");
        next.delete("brief");
        next.delete("posture");
        return next;
      },
      { replace: true },
    );
    onClose();
  }

  function continueToVoice() {
    const trimmedBrief = brief.trim() || defaultBrief(activePosture);
    if (!trimmedBrief.trim()) {
      setError("Add a brief so Wireline knows what to handle.");
      briefRef.current?.focus();
      return;
    }
    setError("");
    setStep(2);
    requestAnimationFrame(() => {
      const firstOptionalControl = voiceSectionRef.current?.querySelector<HTMLElement>(
        "#voice-picker-details-toggle",
      );
      firstOptionalControl?.focus();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !creating) {
      event.preventDefault();
      if (step === 1) {
        continueToVoice();
      } else {
        event.currentTarget.requestSubmit();
      }
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (step === 1 || creating) return;
    const finalBrief = brief.trim() || defaultBrief(activePosture);
    const finalName = name.trim() || defaultAgentName(activePosture, role);
    setCreating(true);
    setError("");
    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: finalName,
          role,
          is_business_agent: activePosture === "business",
        }),
      });
      const body = (await safeJson(response)) as { id?: string; error?: string } | null;
      if (!response.ok || !body?.id) {
        setError(body?.error || "AI employee could not be created.");
        return;
      }

      const postCreateWarnings: string[] = [];
      const addPostCreateWarning = (warning: string) => {
        if (!postCreateWarnings.includes(warning)) postCreateWarnings.push(warning);
      };

      const personalityText = `${personality}. Concise. Useful. ${activePosture === "business" ? "Business-ready." : "Personal and discreet."}`;
      let essentialsSaved = false;
      try {
        const essentialsResponse = await authFetch(
          `/api/agent-config/${encodeURIComponent(body.id)}/essentials`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              job: finalBrief.slice(0, 160),
              personality: personalityText,
              greeting: `Hi, this is ${finalName}. How can I help?`,
              knowledge: finalBrief,
            }),
          },
        );
        essentialsSaved = essentialsResponse.ok;
      } catch {
        essentialsSaved = false;
      }
      if (!essentialsSaved) {
        addPostCreateWarning(
          "The AI employee was created, but its brief did not finish saving. Review Essentials in Studio.",
        );
      }

      if (voice.mode === "custom") {
        try {
          const defaultPhoneVoice = defaultPresenterPhoneVoicePayload();
          const voicePayload =
            voice.provider === "presenter"
              ? {
                  voiceId: voice.voiceId,
                  provider: voice.provider,
                  phoneVoiceId: defaultPhoneVoice.phoneVoiceId,
                  phoneVoiceProvider: defaultPhoneVoice.phoneVoiceProvider,
                }
              : { voiceId: voice.voiceId, provider: voice.provider };
          const voiceResponse = await authFetch(
            `/api/agent-config/${encodeURIComponent(body.id)}/voice`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(voicePayload),
            },
          );
          if (!voiceResponse.ok) {
            addPostCreateWarning("The voice did not save. Choose one in Studio before going live.");
          }
        } catch {
          addPostCreateWarning("The voice did not save. Choose one in Studio before going live.");
        }
      }

      if (activePosture === "business" && face.mode === "catalog") {
        try {
          const faceResponse = await authFetch(
            `/api/agents/${encodeURIComponent(body.id)}/video-presenter`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                avatarId: face.avatarId,
                consentStatus: "approved",
              }),
            },
          );
          if (!faceResponse.ok) {
            addPostCreateWarning(
              "The presenter did not save. The standard in-app identity remains active.",
            );
          }
        } catch {
          addPostCreateWarning(
            "The presenter did not save. The standard in-app identity remains active.",
          );
        }
      }

      let phoneProvisioned = false;
      if (provisionNumber) {
        try {
          const provisionResponse = await authFetch("/api/phone-numbers/provision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent_id: body.id }),
          });
          phoneProvisioned = provisionResponse.ok;
        } catch {
          phoneProvisioned = false;
        }
        if (!phoneProvisioned) {
          addPostCreateWarning(
            "The phone number was not connected. Browser testing is still available.",
          );
        }
      }

      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      if (essentialsSaved) {
        emitProductEvent({
          event: "launch_readiness_reached",
          agentId: body.id,
          metadata: { source: "fast_start_brief", has_training: true },
        });
      }
      emitProductEvent({
        event: "agent_created",
        agentId: body.id,
        metadata: { role, posture: activePosture, phone_provisioned: phoneProvisioned },
      });
      const salesRoles = new Set(["sales", "sales_sdr", "sdr", "outbound_sales"]);
      if (salesRoles.has(role.toLowerCase()) || role.toLowerCase().includes("sales")) {
        emitProductEvent({
          event: "sales_agent_created",
          audience: "sales",
          agentId: body.id,
          metadata: { role, posture: activePosture },
        });
      }
      const postCreateWarning = postCreateWarnings.join(" ") || null;
      const wizardPayload: PostCreateWizardPayload = {
        agentId: body.id,
        agentName: finalName,
        phoneProvisionRequested: provisionNumber,
        phoneProvisioned,
        warning: postCreateWarning,
      };
      stashPostCreateWizard(wizardPayload);
      onCreated?.(wizardPayload);
      setPostSignupFlowActive(true);
      navigate(`/studio?agent=${encodeURIComponent(body.id)}`, { replace: true });
      onClose();
    } catch {
      setError("AI employee could not be created. Try again.");
    } finally {
      setCreating(false);
    }
  }

  const previewName = name.trim() || defaultAgentName(activePosture, role);
  const briefPlaceholder =
    activePosture === "business"
      ? "e.g. Qualify inbound demos, answer support questions, and route urgent calls"
      : "e.g. Answer my unknown callers and book my haircut appointments";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !creating) close();
      }}
    >
      <DialogContent
        showClose={false}
        overlayClassName="bg-black/58 backdrop-blur-[1px]"
        className="z-[70] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden bg-background p-0 shadow-2xl"
        aria-labelledby="create-agent-title"
        aria-describedby="create-agent-description"
      >
        <form
          onSubmit={create}
          onKeyDown={onKeyDown}
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
          aria-labelledby="create-agent-title"
        >
          <div className="shrink-0 border-b border-border px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
                  <Zap size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <DialogTitle
                    id="create-agent-title"
                    className="font-[var(--wireline-font-family-display)] text-2xl font-normal leading-tight tracking-[-.025em] text-foreground"
                  >
                    Fast Start
                  </DialogTitle>
                  <DialogDescription
                    id="create-agent-description"
                    className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    About three minutes to your first AI employee
                  </DialogDescription>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={close}
                disabled={creating}
                aria-label="Close AI employee dialog"
                className="shrink-0"
              >
                <X aria-hidden="true" size={16} />
              </Button>
            </div>
            <div
              className="mt-4 h-1 rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={step === 1 ? 40 : 80}
              aria-label={`Fast Start step ${step} of 2`}
            >
              <div
                className={`h-full rounded-full bg-primary transition-all duration-300 ${step === 1 ? "w-2/5" : "w-4/5"}`}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {step === 1 ? (
              <>
                <p className={WL_APP_CLASSES.wiredEyebrow}>Step 1 · Brief and name</p>
                <h3 className="mt-3 font-[var(--wireline-font-family-display)] text-[clamp(2rem,4vw,2.5rem)] font-normal leading-none tracking-[-0.035em] text-foreground">
                  What do you need handled?
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  One sentence is enough — Wireline fills in the rest.
                </p>

                <div className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="AI employee type">
                  {(
                    [
                      ["personal", "Personal", "Unknown callers, errands, appointments"],
                      ["business", "Business", "Sales, support, scheduling, overflow"],
                    ] as const
                  ).map(([value, label, detail]) => {
                    const selected = activePosture === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setPosture(value);
                          setRole(defaultRole(value));
                          setBrief(defaultBrief(value));
                        }}
                        className={`rounded-[12px] border px-4 py-3 text-left transition-colors ${selected ? "border-primary bg-[var(--wireline-color-action-primary-container)]" : "border-border bg-card hover:border-primary/30"}`}
                        aria-pressed={selected}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-foreground">{label}</span>
                          <span
                            className={`grid size-5 place-items-center rounded-full border text-[10px] ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent"}`}
                          >
                            <Check size={12} aria-hidden="true" />
                          </span>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {detail}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <label className="mt-5 block">
                  <span className="mb-2 block text-xs font-semibold text-foreground">
                    What should this employee do?
                  </span>
                  <Textarea
                    ref={briefRef}
                    value={brief}
                    onChange={(event) => setBrief(event.target.value)}
                    maxLength={4000}
                    placeholder={briefPlaceholder}
                    className="min-h-[112px] text-[15px]"
                    resize="none"
                  />
                  {brief.length >= 3200 ? (
                    <span className="mt-1 block text-right text-xs text-muted-foreground">
                      {brief.length.toLocaleString()} / 4,000
                    </span>
                  ) : null}
                </label>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Quick starts</p>
                  <div className="flex flex-wrap gap-2" aria-label="Quick starts">
                    {ROLE_TEMPLATES.slice(0, 4).map((item) => {
                      const prompt =
                        activePosture === "business" ? item.businessPrompt : item.personalPrompt;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            setRole(item.value);
                            setBrief(prompt);
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${role === item.value ? FAST_START_SELECTED : FAST_START_IDLE}`}
                          aria-pressed={role === item.value}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="mt-6 grid gap-1.5">
                  <span className="text-xs font-semibold text-foreground">AI employee name</span>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={defaultAgentName(activePosture, role)}
                    autoComplete="off"
                  />
                </label>
              </>
            ) : (
              <>
                <p className={WL_APP_CLASSES.wiredEyebrow}>Step 2 · Optional details</p>
                <h3 className="mt-3 font-[var(--wireline-font-family-display)] text-[clamp(1.75rem,3.5vw,2.25rem)] font-normal leading-none tracking-[-0.035em] text-foreground">
                  Ready to create
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  {previewName} already has a polished voice, badge, and response style. Create now,
                  or personalize any detail below.
                </p>

                <div
                  ref={voiceSectionRef}
                  className="mt-6 rounded-[12px] border border-border bg-card/40 p-4 sm:p-5"
                >
                  <VoicePickerField
                    value={voice}
                    onChange={setVoice}
                    suggestedPresenterVoice={matchedPresenterVoice}
                  />
                </div>

                <div className="mt-5 rounded-[12px] border border-border bg-card/40 p-4 sm:p-5">
                  <CreateAgentCatalogFacePicker
                    agentName={previewName}
                    role={role}
                    isBusinessAgent={activePosture === "business"}
                    value={face}
                    onChange={setFace}
                    onMatchedVoiceChange={setMatchedPresenterVoice}
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Response style</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {PERSONALITY_OPTIONS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setPersonality(item)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${personality === item ? FAST_START_SELECTED : FAST_START_IDLE}`}
                          aria-pressed={personality === item}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProvisionNumber((current) => !current)}
                    className={`flex items-center gap-2 rounded-[12px] border px-3 py-2 text-left text-xs transition-colors ${provisionNumber ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30"}`}
                    aria-pressed={provisionNumber}
                  >
                    <Phone size={14} aria-hidden="true" />
                    {provisionNumber ? "Number requested" : "Provision a number"}
                  </button>
                </div>

                <StatusNotice tone="info" title="Launch safely" className="mt-4">
                  Training can wait. Connect a number only when you are ready to make or receive
                  real calls.
                </StatusNotice>
              </>
            )}

            {error ? (
              <StatusNotice tone="destructive" title="Fast Start issue" className="mt-5">
                {error}
              </StatusNotice>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-border px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {step === 1
                  ? "Brief first. Sound, badge, and line next."
                  : "Creates your AI employee and opens Studio. Optional settings can wait."}
              </p>
              <div className="flex gap-2 sm:justify-end">
                {step === 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(1)}
                    disabled={creating}
                  >
                    Back
                  </Button>
                ) : null}
                {step === 1 ? (
                  <Button type="button" onClick={continueToVoice} className="gap-2">
                    <WandSparkles size={15} aria-hidden="true" />
                    Continue
                  </Button>
                ) : (
                  <Button type="submit" disabled={creating} className="gap-2">
                    {creating ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Create AI employee
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
