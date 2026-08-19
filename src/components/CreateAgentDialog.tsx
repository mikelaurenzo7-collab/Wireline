import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Loader2, WandSparkles, X, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

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
import { customerAgentLanguage } from "../lib/product-copy";

const ROLE_TEMPLATES = [
  {
    value: "ceo",
    label: "Lead Agent",
    prompt: "Own the line. Answer, qualify, book, follow up, and hand off only what needs you.",
  },
  {
    value: "sales",
    label: "Sales",
    prompt: "Qualify inbound demand, capture buying context, and route hot opportunities.",
  },
  {
    value: "receptionist",
    label: "Receptionist",
    prompt: "Answer the line, capture caller intent, and route each handoff cleanly.",
  },
  {
    value: "customer_service",
    label: "Support",
    prompt: "Answer support questions, verify context, and escalate urgent work.",
  },
  {
    value: "scheduler",
    label: "Scheduler",
    prompt: "Book meetings, confirm appointments, and text every update.",
  },
  {
    value: "collections",
    label: "Collections",
    prompt: "Follow up on invoices, recover payments, and log every outcome.",
  },
  {
    value: "personal_assistant",
    label: "Concierge",
    prompt: "Answer unknown callers, book appointments, take messages, and text what happened.",
  },
  {
    value: "custom",
    label: "Custom",
    prompt: "Handle a custom workflow and log every outcome.",
  },
] as const;

const FAST_START_SELECTED =
  "border-primary bg-[var(--wireline-color-action-primary-containerStrong)] text-[var(--wireline-color-text-primary)]";
const FAST_START_IDLE =
  "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground";

type Role = (typeof ROLE_TEMPLATES)[number]["value"];

const language = customerAgentLanguage("business");

/**
 * Map create-agent server responses to user-safe strings. Raw error strings
 * from provider APIs (Vapi quota codes, Postgres constraint messages, stack
 * fragments) must never land in the first-run Studio dialog.
 */
function safeCreateAgentError(
  status: number,
  code: string | null | undefined,
  raw: string | null | undefined,
): string {
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
    return "Wireline is having a hiccup. Try again in a moment. Nothing was billed.";
  }
  if (typeof raw === "string" && raw.trim() && raw.trim().length <= 160 && !/[({]/.test(raw)) {
    return raw.trim();
  }
  return `Something got stuck creating this ${noun}. Try again in a moment.`;
}

function defaultAgentName(role: Role) {
  if (role === "ceo") return "Lead Agent";
  if (role === "sales") return "Revenue Desk";
  if (role === "customer_service") return "Support Desk";
  if (role === "scheduler") return "Scheduling Desk";
  if (role === "receptionist") return "Front Desk";
  if (role === "collections") return "Collections Desk";
  if (role === "personal_assistant") return "Concierge";
  return "Voice Agent";
}

const DEFAULT_ROLE: Role = "ceo";

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
  /** @deprecated One workspace. Ignored; kept so older callers compile. */
  business?: boolean;
}) {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const { refresh } = useAgents();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [brief, setBrief] = useState(initialBrief);
  // True while the brief still holds chip-inserted (or initial) text. The
  // moment the customer types, the brief is theirs — a role chip may then
  // re-aim the role but must not clobber their words.
  const briefIsChipTextRef = useRef(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalFocusTrap(dialogRef, { active: open, onEscape: close });
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setRole(DEFAULT_ROLE);
    setName("");
    setBrief(initialBrief);
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
    const finalBrief = brief.trim();
    const finalName = name.trim() || defaultAgentName(role);
    setCreating(true);
    setError("");
    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: finalName,
          role,
          is_business_agent: true,
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
              message: [`Role: ${role}.`, `First brief: ${finalBrief}`].join("\n"),
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
          },
        });
        emitProductEvent({
          event: "launch_readiness_reached",
          agentId: body.id,
          metadata: { source: "fast_start_brief", has_training: true },
        });
      } else if (finalBrief) {
        stashCreateWarning(
          `${finalName} was created, but the starting brief didn't fully apply. Open Studio and paste it into the Set up tab to try again.`,
        );
      }
      emitProductEvent({
        event: "agent_draft_created",
        agentId: body.id,
        metadata: { role, source: "web_fast_start" },
      });
      emitProductEvent({
        event: "agent_created",
        agentId: body.id,
        metadata: { role, phone_provisioned: false },
      });
      const salesRoles = new Set(["sales", "sales_sdr", "sdr", "outbound_sales"]);
      if (salesRoles.has(role.toLowerCase()) || role.toLowerCase().includes("sales")) {
        emitProductEvent({
          event: "sales_agent_created",
          audience: "sales",
          agentId: body.id,
          metadata: { role },
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
                  data-slot="dialog-title"
                  className="wl-preserve-case font-[var(--wireline-font-family-display)] text-2xl font-normal leading-tight tracking-[-.025em] text-foreground"
                >
                  {language.setupPrompt}
                </h2>
                <p id="create-agent-description" className="sr-only">
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
          <label className="block">
            <span className="sr-only">{language.singular} brief</span>
            <Textarea
              ref={briefRef}
              value={brief}
              onChange={(event) => {
                briefIsChipTextRef.current = false;
                setBrief(event.target.value);
              }}
              placeholder="e.g. Qualify inbound demos, answer support questions, and book appointments"
              className="min-h-[112px] text-[15px]"
              resize="none"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Role">
            {ROLE_TEMPLATES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setRole(item.value);
                  if (briefIsChipTextRef.current || !brief.trim()) {
                    briefIsChipTextRef.current = true;
                    setBrief(item.prompt);
                  }
                }}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  role === item.value ? FAST_START_SELECTED : FAST_START_IDLE
                }`}
                aria-pressed={role === item.value}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="mt-6 grid gap-1.5">
            <span className="text-xs font-semibold text-foreground">
              {language.nameLabel}{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={defaultAgentName(role)}
              autoComplete="off"
            />
          </label>

          {error ? (
            <StatusNotice tone="destructive" title="Could not create agent" className="mt-5">
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
              Not now
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
