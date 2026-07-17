import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Check, Loader2, WandSparkles, X, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button, Input, Textarea } from "./atoms";
import { StatusNotice } from "./molecules";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { authFetch, safeJson } from "../lib/api";
import { stashPostCreateWizard, type PostCreateWizardPayload } from "../lib/wireline-create-flow";
import { setPostSignupFlowActive } from "../lib/post-signup-onboarding";
import { emitProductEvent } from "../lib/product-event-client";
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

const FAST_START_SELECTED =
  "border-primary bg-[var(--wireline-color-action-primary-container)] text-primary";
const FAST_START_IDLE =
  "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground";

type Role = (typeof ROLE_TEMPLATES)[number]["value"];
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
  const [brief, setBrief] = useState(initialBrief);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const activePosture: Posture = posture;

  useEffect(() => {
    if (!open) return;
    const nextPosture = business ? "business" : "personal";
    setPosture(nextPosture);
    setRole(defaultRole(nextPosture));
    setName("");
    setBrief(initialBrief || defaultBrief(nextPosture));
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

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !creating) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    const finalBrief = brief.trim() || defaultBrief(activePosture);
    const finalName = name.trim() || defaultAgentName(activePosture, role);
    const personalityText = `Warm. Concise. Useful. ${
      activePosture === "business" ? "Business-ready." : "Personal and discreet."
    }`;
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
      const body = (await safeJson(response)) as {
        id?: string;
        error?: string;
      } | null;
      if (!response.ok || !body?.id) {
        setError(body?.error || "AI employee could not be created.");
        return;
      }

      await authFetch(`/api/agent-config/${encodeURIComponent(body.id)}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "personality",
          content: personalityText,
        }),
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
        metadata: { role, posture: activePosture, phone_provisioned: false },
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
      const wizardPayload: PostCreateWizardPayload = {
        agentId: body.id,
        agentName: finalName,
        phoneProvisionRequested: false,
        phoneProvisioned: false,
      };
      stashPostCreateWizard(wizardPayload);
      onCreated?.(wizardPayload);
      setPostSignupFlowActive(true);
      navigate(`/studio?agent=${encodeURIComponent(body.id)}`, {
        replace: true,
      });
      onClose();
    } catch {
      setError("AI employee could not be created. Try again.");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  const briefPlaceholder =
    activePosture === "business"
      ? "e.g. Qualify inbound demos, answer support questions, and route urgent calls"
      : "e.g. Answer unknown callers and book my appointments";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/58 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[1px]"
      role="presentation"
    >
      <form
        onSubmit={create}
        onKeyDown={onKeyDown}
        className="wl-paper wl-paper-elevated my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden p-0 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-busy={creating}
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
                  AI employee in about a minute
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              disabled={creating}
              aria-label="Close AI employee setup"
              className="shrink-0"
            >
              <X aria-hidden="true" size={16} />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <p className={WL_APP_CLASSES.wiredEyebrow}>One job</p>
          <h3 className="mt-3 font-[var(--wireline-font-family-display)] text-[clamp(2rem,4vw,2.5rem)] font-normal leading-none tracking-[-0.035em] text-foreground">
            What should this employee handle?
          </h3>
          <p className="mt-3 text-sm text-muted-foreground">One sentence is enough.</p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2" role="group" aria-label="Employee type">
            {(
              [
                ["personal", "Personal", "Calls and appointments"],
                ["business", "Business", "Sales, support, and scheduling"],
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
                  className={`rounded-[12px] border px-4 py-3 text-left transition-colors ${
                    selected
                      ? "border-primary bg-[var(--wireline-color-action-primary-container)]"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                  aria-pressed={selected}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                    <span
                      className={`grid size-5 place-items-center rounded-full border text-[10px] ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-transparent"
                      }`}
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
            <span className="sr-only">AI employee brief</span>
            <Textarea
              ref={briefRef}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder={briefPlaceholder}
              className="min-h-[112px] text-[15px]"
              resize="none"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick briefs">
            {ROLE_TEMPLATES.map((item) => {
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
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    role === item.value ? FAST_START_SELECTED : FAST_START_IDLE
                  }`}
                  aria-pressed={role === item.value}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <label className="mt-6 grid gap-1.5">
            <span className="text-xs font-semibold text-foreground">
              Employee name <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={defaultAgentName(activePosture, role)}
              autoComplete="off"
            />
          </label>

          {error ? (
            <StatusNotice tone="destructive" title="Fast Start issue" className="mt-5">
              {error}
            </StatusNotice>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Voice, phone, and testing come next in Studio.
            </p>
            <Button type="submit" disabled={creating} className="gap-2 sm:shrink-0">
              {creating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <WandSparkles size={15} aria-hidden="true" />
              )}
              {creating ? "Creating…" : "Create AI employee"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
