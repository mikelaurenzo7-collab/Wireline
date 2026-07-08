import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Loader2, Check, Phone, WandSparkles, X, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button, Input, Textarea } from "./atoms";
import { StatusNotice } from "./molecules";
import CreateAgentCatalogFacePicker, {
  type FacePickerValue,
} from "./create-agent/CreateAgentCatalogFacePicker";
import VoicePickerField, { type VoicePickerValue } from "./create-agent/VoicePickerField";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { authFetch, safeJson } from "../lib/api";
import { stashCreateWarning, stashPostCreateWizard } from "../lib/wireline-create-flow";
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
  if (role === "custom") return "Wireline Agent";
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
  initialBrief = "",
  business = false,
}: {
  open: boolean;
  onClose: () => void;
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
      const search = voiceSectionRef.current?.querySelector<HTMLInputElement>(
        'input[type="search"], input[placeholder*="Search"]',
      );
      search?.focus();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
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
        setError(body?.error || "Agent could not be created.");
        return;
      }

      let postCreateWarning: string | null = null;

      if (voice.mode === "custom") {
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
          postCreateWarning = "Voice could not be saved — pick one in Studio.";
        }
      }

      if (activePosture === "business" && face.mode === "catalog") {
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
          postCreateWarning =
            postCreateWarning ??
            "Presenter face could not be saved — pick one under Agent presence in Studio.";
        }
      }

      const personalityText = `${personality}. Concise. Useful. ${activePosture === "business" ? "Business-ready." : "Personal and discreet."}`;
      await authFetch(`/api/agent-config/${encodeURIComponent(body.id)}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "personality", content: personalityText }),
      });

      await authFetch("/api/train/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: body.id,
          message: [
            `Role: ${role}.`,
            `Posture: ${activePosture}.`,
            `Personality: ${personalityText}`,
            `First brief: ${finalBrief}`,
          ].join("\n"),
        }),
      });

      let phoneProvisioned = false;
      if (provisionNumber) {
        const provisionResponse = await authFetch("/api/phone-numbers/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: body.id }),
        });
        phoneProvisioned = provisionResponse.ok;
      }

      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      emitProductEvent({
        event: "training_asset_added",
        agentId: body.id,
        metadata: { source: "fast_start_brief", role, posture: activePosture },
      });
      emitProductEvent({
        event: "launch_readiness_reached",
        agentId: body.id,
        metadata: { source: "fast_start_brief", has_training: true },
      });
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
      if (postCreateWarning) stashCreateWarning(postCreateWarning);
      stashPostCreateWizard({
        agentId: body.id,
        agentName: finalName,
        phoneProvisionRequested: provisionNumber,
        phoneProvisioned,
      });
      setPostSignupFlowActive(true);
      navigate(`/studio?agent=${encodeURIComponent(body.id)}`, { replace: true });
      onClose();
    } catch {
      setError("Agent could not be created. Try again.");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  const previewName = name.trim() || defaultAgentName(activePosture, role);
  const briefPlaceholder =
    activePosture === "business"
      ? "e.g. Qualify inbound demos, answer support questions, and route urgent calls"
      : "e.g. Answer my unknown callers and book my haircut appointments";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/58 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[1px]"
      role="presentation"
    >
      <form
        onSubmit={create}
        onKeyDown={onKeyDown}
        className="wl-paper wl-paper-elevated my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden p-0 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-agent-title"
        aria-describedby="create-agent-description"
      >
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
                <Zap size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2
                  id="create-agent-title"
                  className="font-[var(--wireline-font-family-display)] text-2xl font-normal leading-tight tracking-[-.025em] text-foreground"
                >
                  Fast Start
                </h2>
                <p
                  id="create-agent-description"
                  className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                >
                  ~3 minutes to your first agent
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="Close create agent dialog"
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
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: step === 1 ? "40%" : "80%" }}
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

              <div className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Agent type">
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
                <span className="sr-only">Agent brief</span>
                <Textarea
                  ref={briefRef}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder={briefPlaceholder}
                  className="min-h-[112px] text-[15px]"
                  resize="none"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2" aria-label="Quick briefs">
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

              <label className="mt-6 grid gap-1.5">
                <span className="text-xs font-semibold text-foreground">Agent name</span>
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
              <p className={WL_APP_CLASSES.wiredEyebrow}>Step 2 · Voice, face, and line</p>
              <h3 className="mt-3 font-[var(--wireline-font-family-display)] text-[clamp(1.75rem,3.5vw,2.25rem)] font-normal leading-none tracking-[-0.035em] text-foreground">
                Sound and presence
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Pick how {previewName} answers — you can change everything later in Studio.
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
                <label
                  className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-2 text-left transition-colors ${provisionNumber ? "border-primary/35 bg-accent" : "border-border bg-card hover:bg-muted"}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={provisionNumber}
                    onChange={(event) => setProvisionNumber(event.target.checked)}
                  />
                  <Phone size={15} aria-hidden="true" className="text-primary" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">
                      Provision Wireline number
                    </span>
                    <span className="block text-[10px] font-normal leading-4 text-muted-foreground">
                      Dedicated line after create
                    </span>
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                    {provisionNumber ? "Now" : "Later"}
                  </span>
                </label>
              </div>
            </>
          )}

          {error ? <StatusNotice tone="destructive" className="mt-4" title={error} /> : null}
        </div>

        <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-end gap-2 border-t border-border bg-[var(--wireline-color-surface-default)] px-6 py-4">
          {step === 2 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={creating}
              onClick={() => {
                setError("");
                setStep(1);
              }}
            >
              Back
            </Button>
          ) : null}
          {step === 1 ? (
            <Button
              type="button"
              disabled={creating}
              className="min-w-[140px] justify-center"
              onClick={continueToVoice}
            >
              Continue →
            </Button>
          ) : (
            <Button type="submit" disabled={creating} className="min-w-[140px] justify-center">
              {creating ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <WandSparkles aria-hidden="true" size={16} />
              )}
              Create agent
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
