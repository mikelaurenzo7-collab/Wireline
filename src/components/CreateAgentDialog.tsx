import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, ChevronRight, Loader2, WandSparkles, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { Button, Input, NativeSelect, Textarea } from "./atoms";
import BotMarkPicker from "./BotMarkPicker";
import { StatusNotice } from "./molecules";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import {
  CREATE_BRIEF_MAX_CHARS,
  clearCreateBrief,
  isCreateBriefRecoveryOwner,
  rememberCreateBrief,
} from "../lib/create-brief-recovery";
import { extractionPersistedSomething } from "../lib/training-extraction-result";
import { authFetch, safeJson } from "../lib/api";
import { isBusinessTemplateCategory } from "../lib/agent-create-defaults";
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
import { BOT_CHANNELS, BOT_ROLE_TEMPLATES } from "../lib/bot-product";
import {
  BOT_MARK_CHOICES,
  defaultBotMarkKey,
  firstAvailableBotMarkKey,
  isBotMarkKey,
  type BotMarkKey,
} from "../lib/bot-mark";

type TemplateKey = (typeof BOT_ROLE_TEMPLATES)[number]["key"];
type TechnicalRole =
  | "receptionist"
  | "sales"
  | "customer_service"
  | "scheduler"
  | "lead_qualifier"
  | "personal_assistant"
  | "custom";

const TECHNICAL_ROLE_BY_TEMPLATE: Record<TemplateKey, TechnicalRole> = {
  "front-desk": "receptionist",
  "sales-rep": "sales",
  "appointment-setter": "scheduler",
  "customer-support": "customer_service",
  "lead-qualifier": "lead_qualifier",
  recruiter: "custom",
  "property-manager": "custom",
  "personal-assistant": "personal_assistant",
  "family-concierge": "personal_assistant",
  custom: "custom",
};

function templateForKey(value: string | null | undefined) {
  return (
    BOT_ROLE_TEMPLATES.find((template) => template.key === value) ??
    BOT_ROLE_TEMPLATES.find((template) => template.key === "custom")!
  );
}

function defaultName(templateKey: TemplateKey) {
  const template = templateForKey(templateKey);
  if (template.key === "custom") return "My Bot";
  if (template.key === "front-desk") return "Front Desk";
  return `${template.name} Bot`;
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
    return "Your current plan is at its live Bot capacity. Add capacity or contact support.";
  }
  if (normalized === "bot_mark_conflict") {
    return "That identity is already used by another Bot. Choose another mark or color.";
  }
  if (normalized === "bot_mark_capacity_reached") {
    return "Every available Bot identity is already in use. Contact support before adding another Bot.";
  }
  if (status === 409 || normalized === "name_conflict") {
    return "A Bot with that name already exists. Pick a different name to continue.";
  }
  if (status === 429 || normalized === "rate_limited") {
    return "You're going a bit fast. Try again in a moment.";
  }
  if (status >= 500) {
    return "BotBound is having a hiccup. Try again in a moment. Nothing was billed.";
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
  initialTemplateKey,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (payload: PostCreateWizardPayload) => void;
  initialBrief?: string;
  initialTemplateKey?: string | null;
}) {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const { agents, refresh } = useAgents();
  const { user } = useAuth();
  const activeUserIdRef = useRef(user?.id ?? null);
  const createAbortRef = useRef<AbortController | null>(null);
  const initialTemplate = useMemo(() => templateForKey(initialTemplateKey), [initialTemplateKey]);
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState<TemplateKey>(initialTemplate.key);
  const [markKey, setMarkKey] = useState<BotMarkKey>(defaultBotMarkKey(initialTemplate.key));
  const unavailableMarkKeys = useMemo(
    () =>
      new Set<BotMarkKey>(
        agents
          .map((agent) => agent.mark_key)
          .filter((candidate): candidate is BotMarkKey => isBotMarkKey(candidate)),
      ),
    [agents],
  );
  const unavailableMarkKeysRef = useRef(unavailableMarkKeys);
  unavailableMarkKeysRef.current = unavailableMarkKeys;
  const markCapacityReached = unavailableMarkKeys.size >= BOT_MARK_CHOICES.length;
  const [brief, setBrief] = useState(initialBrief);
  const briefIsTemplateTextRef = useRef(true);
  const markWasChosenRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [customizing, setCustomizing] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const language = customerAgentLanguage();

  useModalFocusTrap(dialogRef, { active: open, onEscape: close });
  useBodyScrollLock(open);

  useLayoutEffect(() => {
    activeUserIdRef.current = user?.id ?? null;
    return () => {
      activeUserIdRef.current = null;
      // Navigation may leave a committed Bot behind; finish its brief for the
      // same account, while account changes cancel any further training.
      if (!isCreateBriefRecoveryOwner(user?.id ?? "")) createAbortRef.current?.abort();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    const nextTemplate = templateForKey(initialTemplateKey);
    setTemplateKey(nextTemplate.key);
    setMarkKey(
      firstAvailableBotMarkKey(nextTemplate.key, unavailableMarkKeysRef.current) ??
        defaultBotMarkKey(nextTemplate.key),
    );
    markWasChosenRef.current = false;
    setName("");
    setBrief(initialBrief || (nextTemplate.key === "custom" ? "" : nextTemplate.summary));
    briefIsTemplateTextRef.current = !initialBrief.trim();
    setError("");
    setCustomizing(false);
    // Keep the whole form in view without opening the mobile keyboard.
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [initialBrief, initialTemplateKey, open]);

  useEffect(() => {
    if (!open || !unavailableMarkKeys.has(markKey)) return;
    const next = firstAvailableBotMarkKey(templateKey, unavailableMarkKeys);
    if (next) setMarkKey(next);
  }, [markKey, open, templateKey, unavailableMarkKeys]);

  function close() {
    if (creating) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("create");
        next.delete("brief");
        next.delete("template");
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
    if (creating || createAbortRef.current) return;
    const creationUserId = user?.id;
    if (!creationUserId) {
      setError("Your session expired. Sign in again to keep building.");
      return;
    }
    const isCurrentAccount = () =>
      activeUserIdRef.current === creationUserId && isCreateBriefRecoveryOwner(creationUserId);
    if (markCapacityReached) {
      setError(
        "Every available Bot identity is already in use. Contact support before adding another Bot.",
      );
      return;
    }
    const selectedTemplate = templateForKey(templateKey);
    const finalBrief = brief.trim() || selectedTemplate.summary;
    if (finalBrief.length > CREATE_BRIEF_MAX_CHARS) {
      setError(
        "Keep the starting brief under 10,000 characters. Add longer materials in Knowledge after creation.",
      );
      return;
    }
    const finalName = name.trim() || defaultName(templateKey);
    const role = TECHNICAL_ROLE_BY_TEMPLATE[templateKey];
    // Compatibility only: legacy records and provider defaults still store a
    // capability profile. It never creates a second customer-facing workspace.
    const legacyCapabilityProfile = isBusinessTemplateCategory(selectedTemplate.category);

    setCreating(true);
    setError("");
    const controller = new AbortController();
    createAbortRef.current = controller;

    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: finalName,
          mark_key: markKey,
          role,
          is_business_agent: legacyCapabilityProfile,
        }),
      });
      const body = (await safeJson(response)) as {
        id?: string;
        mark_key?: unknown;
        error?: string;
        code?: string;
      } | null;
      if (!isCreateBriefRecoveryOwner(creationUserId) || controller.signal.aborted) return;
      if (!response.ok || !body?.id) {
        if (isCurrentAccount()) {
          setError(safeCreateAgentError(response.status, body?.code, body?.error));
          const markConflict = body?.code?.toLowerCase() === "bot_mark_conflict";
          if (response.status === 409 || markConflict) {
            setCustomizing(true);
            requestAnimationFrame(() => {
              if (markConflict) {
                dialogRef.current
                  ?.querySelector<HTMLButtonElement>(
                    '[data-bot-mark-picker] [role="radio"][aria-checked="true"]:not(:disabled)',
                  )
                  ?.focus();
              } else nameRef.current?.focus();
            });
          }
        }
        return;
      }

      let trainingApplied = false;
      if (finalBrief) {
        rememberCreateBrief(creationUserId, body.id, finalBrief);
        try {
          const extractRes = await authFetch("/api/train/extract", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: body.id,
              message: [
                `Role starter: ${selectedTemplate.name}.`,
                `Conversation direction: ${selectedTemplate.direction}.`,
                `Configurable channels: ${BOT_CHANNELS.map((channel) => channel.label).join(", ")}.`,
                `First brief: ${finalBrief}`,
              ].join("\n"),
            }),
          });
          trainingApplied = await extractionPersistedSomething(extractRes);
        } catch {
          trainingApplied = false;
        }
      }

      if (!isCreateBriefRecoveryOwner(creationUserId) || controller.signal.aborted) return;
      if (trainingApplied) clearCreateBrief(creationUserId, body.id, finalBrief);
      if (!isCurrentAccount()) return;
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      refresh();
      if (trainingApplied) {
        emitProductEvent({
          event: "training_asset_added",
          agentId: body.id,
          metadata: {
            source: "fast_start_brief",
            template: templateKey,
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
          `${finalName} was created. Your starting brief is preserved in Tone & knowledge. Review it and save changes to try again.`,
        );
      }
      emitProductEvent({
        event: "agent_draft_created",
        agentId: body.id,
        metadata: {
          role,
          template: templateKey,
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
          template: templateKey,
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
          metadata: {
            role,
            template: templateKey,
            workspace_model: "one_workspace",
            object: "bot",
          },
        });
      }
      const wizardPayload: PostCreateWizardPayload = {
        agentId: body.id,
        agentName: finalName,
        markKey: isBotMarkKey(body.mark_key) ? body.mark_key : null,
        phoneProvisionRequested: false,
        phoneProvisioned: false,
      };
      stashPostCreateWizard(wizardPayload);
      onCreated?.(wizardPayload);
      setPostSignupFlowActive(true);
      navigate(`/studio?agent=${encodeURIComponent(body.id)}&section=setup`, { replace: true });
      onClose();
    } catch {
      if (isCurrentAccount() && !controller.signal.aborted)
        setError("Bot could not be created. Try again.");
    } finally {
      if (createAbortRef.current === controller) createAbortRef.current = null;
      if (isCurrentAccount()) setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/58 px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[1px] sm:px-4"
      role="presentation"
    >
      <form
        ref={dialogRef}
        data-visual-qa-state="create-dialog"
        onSubmit={create}
        onKeyDown={onKeyDown}
        className="wl-paper wl-paper-elevated my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden p-0 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-busy={creating}
        aria-labelledby="create-agent-title"
      >
        <div className="shrink-0 border-b border-border px-3 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  id="create-agent-title"
                  data-slot="dialog-title"
                  className="wl-preserve-case font-[var(--wireline-font-family-display)] text-2xl font-normal leading-tight tracking-[-.025em] text-foreground"
                >
                  {language.setupPrompt}
                </h2>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              disabled={creating}
              aria-label="Close Bot setup"
              className="size-[44px] shrink-0"
            >
              <X aria-hidden="true" size={16} />
            </Button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
          <div className="grid min-w-0 grid-cols-1 gap-5">
            <label className="block">
              <span className="sr-only">Describe the Job</span>
              <Textarea
                disabled={creating}
                maxLength={CREATE_BRIEF_MAX_CHARS}
                value={brief}
                onChange={(event) => {
                  briefIsTemplateTextRef.current = false;
                  setBrief(event.target.value);
                }}
                placeholder="Answer calls and book appointments."
                className="min-h-[136px] text-base"
                resize="vertical"
              />
            </label>

            <details className="group" open={initialTemplate.key !== "custom"}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md py-3 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  aria-hidden="true"
                />
                Start From a Role
              </summary>
              <NativeSelect
                id="create-bot-role"
                aria-label="Bot role starters"
                value={templateKey}
                disabled={creating}
                onChange={(event) => {
                  const template = templateForKey(event.target.value);
                  setTemplateKey(template.key);
                  if (!markWasChosenRef.current) {
                    setMarkKey(
                      firstAvailableBotMarkKey(template.key, unavailableMarkKeys) ??
                        defaultBotMarkKey(template.key),
                    );
                  }
                  if (briefIsTemplateTextRef.current || !brief.trim()) {
                    briefIsTemplateTextRef.current = true;
                    setBrief(template.key === "custom" ? "" : template.summary);
                  }
                }}
              >
                {BOT_ROLE_TEMPLATES.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.name}
                  </option>
                ))}
              </NativeSelect>
            </details>

            <div className="rounded-xl border border-border">
              <button
                type="button"
                aria-expanded={customizing}
                aria-controls="create-bot-identity"
                disabled={creating}
                onClick={() => setCustomizing((current) => !current)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-left wl-focus-ring-halo"
              >
                <span className="min-w-0 flex-1">
                  <span className="wl-preserve-case block truncate text-sm font-semibold text-foreground">
                    {name.trim() || defaultName(templateKey)}
                  </span>
                  <span className="block text-xs text-muted-foreground">Name & appearance</span>
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${customizing ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              <div
                id="create-bot-identity"
                hidden={!customizing}
                className="space-y-5 border-t border-border p-4"
              >
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {language.nameLabel}{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </span>
                  <Input
                    ref={nameRef}
                    disabled={creating}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={defaultName(templateKey)}
                    autoComplete="off"
                  />
                </label>
                <BotMarkPicker
                  value={markKey}
                  onChange={(nextMarkKey) => {
                    markWasChosenRef.current = true;
                    setMarkKey(nextMarkKey);
                  }}
                  seed={`new:${templateKey}`}
                  name={name.trim() || defaultName(templateKey)}
                  compact
                  disabled={creating || markCapacityReached}
                  unavailableKeys={unavailableMarkKeys}
                />
              </div>
            </div>
          </div>

          {error ? (
            <StatusNotice tone="destructive" title="Could Not Create Bot" className="mt-5">
              {error}
            </StatusNotice>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <button
              type="button"
              onClick={close}
              disabled={creating}
              className="min-h-11 rounded-lg px-2 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50 wl-focus-ring-halo"
            >
              Cancel
            </button>
            <Button
              type="submit"
              disabled={creating || markCapacityReached}
              className="h-auto min-h-11 gap-2 whitespace-normal px-3 py-2 sm:px-5"
            >
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
