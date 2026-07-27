import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Check, Loader2, WandSparkles, X, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button, Input, Textarea } from "./atoms";
import { StatusNotice } from "./molecules";
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
import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import { customerAgentLanguage } from "../lib/product-copy";

const ROLE_TEMPLATES = [
  {
    value: "personal_assistant",
    label: "Concierge",
    personalPrompt:
      "Answer unknown callers, book appointments, take messages, and text me what happened.",
    businessPrompt: "Handle personal admin for the owner alongside business coverage.",
    personalOnly: true,
  },
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
  "border-primary bg-[var(--wireline-color-action-primary-containerStrong)] text-[var(--wireline-color-text-primary)]";
const FAST_START_IDLE =
  "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground";

type Role = (typeof ROLE_TEMPLATES)[number]["value"];
type Posture = "personal" | "business";

function rolesForPosture(posture: Posture) {
  return ROLE_TEMPLATES.filter((template) =>
    posture === "personal" ? true : !("personalOnly" in template && template.personalOnly),
  );
}

/**
 * Map create-agent server responses to user-safe strings. Raw error strings
 * from provider APIs (Vapi quota codes, Postgres constraint messages, stack
 * fragments) must never land in the first-run Studio dialog.
 */
function safeCreateAgentError(
  status: number,
  code: string | null | undefined,
  raw: string | null | undefined,
  posture: Posture,
): string {
  const language = customerAgentLanguage(posture);
  const noun = language.singular;
  const normalized = code?.toLowerCase();
  if (status === 401 || status === 403) {
    return "Your session expired. Please sign in again to keep building.";
  }
  if (status === 402 || normalized === "plan_capacity_reached") {
    return `Your current plan is at its live-agent capacity. Upgrade or archive an existing ${noun} to make room.`;
  }
  if (status === 409 || normalized === "name_conflict") {
    return `${language.indefiniteSingular.replace(/^./, (letter) => letter.toUpperCase())} with that name already exists. Pick a different name to continue.`;
  }
  if (status === 429 || normalized === "rate_limited") {
    return "You're going a bit fast. Take a breath and try again in a moment.";
  }
  if (status >= 500) {
    return "Wireline is having a hiccup. Try again in a moment — nothing was billed.";
  }
  if (typeof raw === "string" && raw.trim() && raw.trim().length <= 160 && !/[({]/.test(raw)) {
    return raw.trim();
  }
  return `Something got stuck creating this ${noun}. Try again in a moment.`;
}

function defaultAgentName(posture: Posture, role: Role) {
  if (posture === "personal") return "Sarah";
  if (role === "sales") return "Revenue Desk";
  if (role === "customer_service") return "Support Desk";
  if (role === "scheduler") return "Scheduling Desk";
  if (role === "custom") return "Wireline Voice Agent";
  return "Front Desk";
}

function defaultBrief(posture: Posture) {
  return posture === "business"
    ? "Qualify inbound demand, answer support questions, route urgent calls, and text every outcome."
    : "Answer unknown callers, book appointments, take messages, and text me what happened.";
}

function defaultRole(posture: Posture): Role {
  return posture === "business" ? "sales" : "personal_assistant";
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
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalFocusTrap(dialogRef, { active: open, onEscape: close });
  useBodyScrollLock(open);
  const activePosture: Posture = posture;
  const language = customerAgentLanguage(activePosture);

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
    // Escape is handled globally by useModalFocusTrap so it works regardless of
    // where focus sits; this handler owns the submit shortcut only.
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
    // Server create already seeds role + template personality. Do not overwrite
    // that depth with a one-line tone stub from the client.
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
        code?: string;
      } | null;
      if (!response.ok || !body?.id) {
        setError(safeCreateAgentError(response.status, body?.code, body?.error, activePosture));
        return;
      }

      // The agent now exists with server-seeded personality. Applying the first
      // brief is best-effort: if extract fails, keep the created agent and
      // surface a truthful warning instead of prompting a duplicate retry.
      let trainingApplied = true;
      try {
        const extractRes = await authFetch("/api/train/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: body.id,
            message: [
              `Role: ${role}.`,
              `Posture: ${activePosture}.`,
              `First brief: ${finalBrief}`,
            ].join("\n"),
          }),
        });
        if (!extractRes.ok) trainingApplied = false;
      } catch {
        trainingApplied = false;
      }

      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      if (trainingApplied) {
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
      } else {
        stashCreateWarning(
          `${finalName} was created, but the starting brief didn't fully apply. Open Studio and paste it into the Set up tab to try again.`,
        );
      }
      emitProductEvent({
        event: "agent_draft_created",
        agentId: body.id,
        metadata: { role, posture: activePosture, source: "web_fast_start" },
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
      setError(`${language.singular} could not be created. Try again.`);
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
        ref={dialogRef}
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
                  {language.setupLabel}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              disabled={creating}
              aria-label={`Close ${language.singular} setup`}
              className="shrink-0"
            >
              <X aria-hidden="true" size={16} />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <p className={WL_APP_CLASSES.wiredEyebrow}>One job</p>
          <h3 className="mt-3 font-[var(--wireline-font-family-display)] text-[clamp(2rem,4vw,2.5rem)] font-normal leading-none tracking-[-0.035em] text-foreground">
            {language.setupPrompt}
          </h3>
          <p className="mt-3 text-sm text-muted-foreground">
            {language.setupDescription} One sentence is enough.
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2" role="group" aria-label="Use case">
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
                    const previousDefault = defaultBrief(activePosture);
                    setPosture(value);
                    setRole(defaultRole(value));
                    setBrief((current) => {
                      if (!current.trim() || current === previousDefault) {
                        return defaultBrief(value);
                      }
                      return current;
                    });
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
            <span className="sr-only">{language.singular} brief</span>
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
            {rolesForPosture(activePosture).map((item) => {
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
              {language.nameLabel}{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
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
            <button
              type="button"
              onClick={close}
              disabled={creating}
              className="text-left text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
            >
              I&apos;ll explore first
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
