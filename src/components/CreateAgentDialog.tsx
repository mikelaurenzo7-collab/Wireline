import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Check, Loader2, WandSparkles, X, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { Button, Input, Textarea } from "./atoms";
import { StatusNotice } from "./molecules";
import { useAccount } from "../contexts/AccountContext";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { authFetch, safeJson } from "../lib/api";
import {
  stashCreateWarning,
  stashPostCreateWizard,
  type PostCreateWizardPayload,
} from "../lib/wireline-create-flow";
import { useModalFocusTrap } from "../lib/use-modal-focus-trap";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { setPostSignupFlowActive } from "../lib/post-signup-onboarding";
import { emitProductEvent } from "../lib/product-event-client";
import { customerAgentLanguage } from "../lib/product-copy";

const ROLE_TEMPLATES = [
  {
    value: "receptionist",
    label: "Receptionist",
    description: "Answer, qualify, route, and take messages.",
    prompt:
      "Answer calls, understand what each person needs, route urgent requests, and continue by text or email when useful.",
    defaultName: "Front Desk",
  },
  {
    value: "sales",
    label: "Sales Associate",
    description: "Qualify demand, follow up, and book meetings.",
    prompt:
      "Qualify inbound and outbound opportunities, handle common objections, book the next step, and log the outcome.",
    defaultName: "Sales Bot",
  },
  {
    value: "customer_service",
    label: "Support Specialist",
    description: "Resolve questions and escalate with context.",
    prompt:
      "Answer support questions across voice, text, and email, use approved knowledge, and escalate urgent work with context.",
    defaultName: "Support Bot",
  },
  {
    value: "scheduler",
    label: "Scheduler",
    description: "Book, confirm, remind, and reschedule.",
    prompt:
      "Book, confirm, remind, and reschedule appointments, then send clear confirmations and updates.",
    defaultName: "Scheduling Bot",
  },
  {
    value: "lead_qualifier",
    label: "Intake Coordinator",
    description: "Collect details and move requests forward.",
    prompt:
      "Collect the right details, determine fit and urgency, route the request, and record the next action.",
    defaultName: "Intake Bot",
  },
  {
    value: "personal_assistant",
    label: "Personal Assistant",
    description: "Handle calls, appointments, follow-ups, and admin.",
    prompt:
      "Screen calls, book appointments, handle follow-ups, and send me a concise record of what happened.",
    defaultName: "Concierge",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Describe any repeatable communication workflow.",
    prompt: "Handle this workflow exactly as described and keep a clear outcome record.",
    defaultName: "My Bot",
  },
] as const;

const CHANNELS = ["Voice", "Text", "Email"] as const;
const SELECTED =
  "border-primary bg-[var(--wireline-color-action-primary-containerStrong)] text-[var(--wireline-color-text-primary)]";
const IDLE = "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground";

type Role = (typeof ROLE_TEMPLATES)[number]["value"];

function templateForRole(role: Role) {
  return ROLE_TEMPLATES.find((template) => template.value === role) ?? ROLE_TEMPLATES.at(-1)!;
}

/** Keep provider and infrastructure errors out of the first-run experience. */
function safeCreateAgentError(
  status: number,
  code: string | null | undefined,
  raw: string | null | undefined,
): string {
  const normalized = code?.toLowerCase();
  if (status === 401 || status === 403) {
    return "Your session expired. Please sign in again to keep building.";
  }
  if (status === 402 || normalized === "plan_capacity_reached") {
    return "Your current plan is at its live Bot capacity. Upgrade or archive an existing Bot to make room.";
  }
  if (status === 409 || normalized === "name_conflict") {
    return "A Bot with that name already exists. Pick a different name to continue.";
  }
  if (status === 429 || normalized === "rate_limited") {
    return "You're going a bit fast. Try again in a moment.";
  }
  if (status >= 500) {
    return "Wireline is having a hiccup. Try again in a moment. Nothing was billed.";
  }
  if (typeof raw === "string" && raw.trim() && raw.trim().length <= 160 && !/[({]/.test(raw)) {
    return raw.trim();
  }
  return "Something got stuck creating this Bot. Try again in a moment.";
}

export default function CreateAgentDialog({
  open,
  onClose,
  onCreated,
  initialBrief = "",
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (payload: PostCreateWizardPayload) => void;
  initialBrief?: string;
}) {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const { accountType } = useAccount();
  const { refresh } = useAgents();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("custom");
  const [brief, setBrief] = useState(initialBrief);
  const briefIsTemplateTextRef = useRef(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const language = customerAgentLanguage(accountType);
  // The database flag remains a compatibility and entitlement profile. It is
  // deliberately not a customer choice and never creates a second workspace.
  const legacyCapabilityProfile = accountType === "business";

  useModalFocusTrap(dialogRef, { active: open, onEscape: close });
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setRole("custom");
    setName("");
    setBrief(initialBrief);
    briefIsTemplateTextRef.current = true;
    setError("");
    const frame = requestAnimationFrame(() => briefRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [initialBrief, open]);

  function close() {
    if (creating) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("create");
        next.delete("brief");
        // Remove old deep-link posture parameters during the compatibility window.
        next.delete("posture");
        return next;
      },
      { replace: true },
    );
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !creating) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    const selectedTemplate = templateForRole(role);
    const finalBrief = brief.trim();
    const finalName = name.trim() || selectedTemplate.defaultName;
    setCreating(true);
    setError("");

    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: finalName,
          role,
          is_business_agent: legacyCapabilityProfile,
        }),
      });
      const body = (await safeJson(response)) as {
        id?: string;
        error?: string;
        code?: string;
      } | null;
      if (!response.ok || !body?.id) {
        setError(safeCreateAgentError(response.status, body?.code, body?.error));
        return;
      }

      let trainingApplied = false;
      if (finalBrief) {
        trainingApplied = true;
        try {
          const extractRes = await authFetch("/api/train/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: body.id,
              message: [
                `Role starter: ${selectedTemplate.label}.`,
                "Available channels: voice, text, and email.",
                `First brief: ${finalBrief}`,
              ].join("\n"),
            }),
          });
          if (!extractRes.ok) trainingApplied = false;
        } catch {
          trainingApplied = false;
        }
      }

      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      if (trainingApplied) {
        emitProductEvent({
          event: "training_asset_added",
          agentId: body.id,
          metadata: {
            source: "fast_start_brief",
            role,
            workspace_model: "one_workspace",
            object: "bot",
          },
        });
        emitProductEvent({
          event: "launch_readiness_reached",
          agentId: body.id,
          metadata: { source: "fast_start_brief", has_training: true },
        });
      } else if (finalBrief) {
        stashCreateWarning(
          `${finalName} was created, but the starting brief didn't fully apply. Open Studio and paste it into the Set Up tab to try again.`,
        );
      }
      emitProductEvent({
        event: "agent_draft_created",
        agentId: body.id,
        metadata: {
          role,
          workspace_model: "one_workspace",
          object: "bot",
          source: "web_fast_start",
        },
      });
      emitProductEvent({
        event: "agent_created",
        agentId: body.id,
        metadata: {
          role,
          workspace_model: "one_workspace",
          object: "bot",
          phone_provisioned: false,
        },
      });
      if (role === "sales") {
        emitProductEvent({
          event: "sales_agent_created",
          audience: "sales",
          agentId: body.id,
          metadata: { role, workspace_model: "one_workspace", object: "bot" },
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
      navigate(`/studio?agent=${encodeURIComponent(body.id)}`, { replace: true });
      onClose();
    } catch {
      setError("Bot could not be created. Try again.");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/58 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[1px]"
      role="presentation"
    >
      <form
        ref={dialogRef}
        onSubmit={create}
        onKeyDown={onKeyDown}
        className="wl-paper wl-paper-elevated my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden p-0 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-busy={creating}
        aria-labelledby="create-agent-title"
        aria-describedby="create-agent-description"
      >
        <div className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
                <Zap size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2
                  id="create-agent-title"
                  data-slot="dialog-title"
                  className="wl-preserve-case font-[var(--wireline-font-family-display)] text-2xl font-normal leading-tight tracking-[-.025em] text-foreground"
                >
                  {language.setupPrompt}
                </h2>
                <p
                  id="create-agent-description"
                  className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground"
                >
                  {language.setupDescription}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              disabled={creating}
              aria-label="Close Bot setup"
              className="shrink-0"
            >
              <X aria-hidden="true" size={16} />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <section aria-labelledby="role-starters-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id="role-starters-heading" className="text-sm font-semibold text-foreground">
                  Start With a Role
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  A starting playbook, not a permanent limit.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label="Available Bot channels">
                {CHANNELS.map((channel) => (
                  <span
                    key={channel}
                    className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                  >
                    {channel}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Role starters">
              {ROLE_TEMPLATES.map((item) => {
                const selected = role === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setRole(item.value);
                      if (briefIsTemplateTextRef.current || !brief.trim()) {
                        briefIsTemplateTextRef.current = true;
                        setBrief(item.prompt);
                      }
                    }}
                    className={`rounded-[12px] border px-4 py-3 text-left transition-colors ${
                      selected ? SELECTED : IDLE
                    }`}
                    aria-pressed={selected}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">{item.label}</span>
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
                      {item.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <label className="mt-6 block">
            <span className="mb-2 block text-xs font-semibold text-foreground">Describe the Job</span>
            <Textarea
              ref={briefRef}
              value={brief}
              onChange={(event) => {
                briefIsTemplateTextRef.current = false;
                setBrief(event.target.value);
              }}
              placeholder="e.g. Answer calls, qualify requests, book appointments, text confirmations, and email follow-ups"
              className="min-h-[120px] text-[15px]"
              resize="none"
            />
          </label>

          <label className="mt-5 grid gap-1.5">
            <span className="text-xs font-semibold text-foreground">
              {language.nameLabel}{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={templateForRole(role).defaultName}
              autoComplete="off"
            />
          </label>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            After creation, configure the voice, connected channels, knowledge, tools, guardrails,
            approvals, and handoffs in Studio.
          </p>

          {error ? (
            <StatusNotice tone="destructive" title="Could Not Create Bot" className="mt-5">
              {error}
            </StatusNotice>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={close}
              disabled={creating}
              className="text-left text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
            >
              Not Now
            </button>
            <Button type="submit" disabled={creating} className="gap-2 sm:shrink-0">
              {creating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <WandSparkles size={15} aria-hidden="true" />
              )}
              {creating ? "Creating…" : language.createCta}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
