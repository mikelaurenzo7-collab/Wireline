import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, Loader2, WandSparkles, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { Button, Input, Textarea } from "./atoms";
import BotMarkPicker from "./BotMarkPicker";
import { StatusNotice } from "./molecules";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import {
  CREATE_BRIEF_MAX_CHARS,
  beginCreateBriefTraining,
  clearCreateBrief,
  isCreateBriefRecoveryOwner,
  rememberCreateBrief,
} from "../lib/create-brief-recovery";
import { extractionPersistedSomething } from "../lib/training-extraction-result";
import { authFetch, safeJson } from "../lib/api";
import { stashPostCreateWizard, type PostCreateWizardPayload } from "../lib/wireline-create-flow";
import { useModalFocusTrap } from "../lib/use-modal-focus-trap";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { setPostSignupFlowActive } from "../lib/post-signup-onboarding";
import { emitProductEvent } from "../lib/product-event-client";
import { customerAgentLanguage } from "../lib/product-copy";
import { BOT_CHANNELS, BOT_ROLE_TEMPLATES } from "../lib/bot-product";
import {
  defaultBotMarkKey,
  firstAvailableBotMarkKey,
  isBotMarkKey,
  type BotMarkKey,
} from "../lib/bot-mark";

type TemplateKey = (typeof BOT_ROLE_TEMPLATES)[number]["key"];

/**
 * One Bot handles everything, so a starter no longer picks a role or a
 * personality. It only prefills the first brief and the suggested name; the
 * Bot that gets created is the same either way.
 */
const STARTER_KEYS: TemplateKey[] = [
  "front-desk",
  "sales-rep",
  "appointment-setter",
  "customer-support",
  "recruiter",
];

/**
 * Personal starters seed the privacy-first posture instead of the business
 * one. This is a posture, not a role: the toolbox and prompt are otherwise
 * identical.
 */
const PERSONAL_STARTER_KEYS = new Set<TemplateKey>(["personal-assistant", "family-concierge"]);

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

async function applyStartingBrief({
  userId,
  agentId,
  brief,
  template,
  signal,
  reportTraining,
}: {
  userId: string;
  agentId: string;
  brief: string;
  template: ReturnType<typeof templateForKey>;
  signal: AbortSignal;
  reportTraining: boolean;
}) {
  if (!rememberCreateBrief(userId, agentId, brief)) return;
  const finish = beginCreateBriefTraining(userId, agentId);
  try {
    const response = await authFetch("/api/train/extract", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        message: [
          `Starter: ${template.name}.`,
          `Conversation direction: ${template.direction}.`,
          `Configurable channels: ${BOT_CHANNELS.filter((channel) => channel.key !== "text")
            .map((channel) => channel.label)
            .join(", ")}.`,
          `First brief: ${brief}`,
        ].join("\n"),
      }),
    });
    const applied = await extractionPersistedSomething(response);
    if (!applied || !isCreateBriefRecoveryOwner(userId) || signal.aborted) return;
    clearCreateBrief(userId, agentId, brief);
    if (reportTraining) {
      emitProductEvent({
        event: "training_asset_added",
        agentId,
        metadata: {
          source: "fast_start_brief",
          template: template.key,
          workspace_model: "one_workspace",
          object: "bot",
        },
      });
      emitProductEvent({
        event: "launch_readiness_reached",
        agentId,
        metadata: { source: "fast_start_brief", has_training: true },
      });
    }
  } catch {
    // Setup can recover the original brief if the automatic pass fails.
  } finally {
    finish();
  }
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
  const { agents, rememberCreatedAgent } = useAgents();
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
  const [brief, setBrief] = useState(initialBrief);
  const briefIsTemplateTextRef = useRef(true);
  const markWasChosenRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [customizing, setCustomizing] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const conflictFocusRef = useRef<"mark" | "name" | null>(null);
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
    conflictFocusRef.current = null;
    // Keep the whole form in view without opening the mobile keyboard.
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [initialBrief, initialTemplateKey, open]);

  useLayoutEffect(() => {
    if (!open || creating || !customizing || !conflictFocusRef.current) return;
    const target =
      conflictFocusRef.current === "mark"
        ? dialogRef.current?.querySelector<HTMLButtonElement>(
            '[data-bot-mark-picker] [role="radio"][aria-checked="true"]:not(:disabled)',
          )
        : nameRef.current;
    target?.focus();
    conflictFocusRef.current = null;
  }, [open, creating, customizing, error]);

  useEffect(() => {
    if (!open || !unavailableMarkKeys.has(markKey)) return;
    const next = firstAvailableBotMarkKey(templateKey, unavailableMarkKeys);
    if (next) setMarkKey(next);
  }, [markKey, open, templateKey, unavailableMarkKeys]);

  function close() {
    if (creating) return;
    dismiss();
  }

  function dismiss() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("create");
        next.delete("another");
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
    const selectedTemplate = templateForKey(templateKey);
    const finalBrief = brief.trim() || selectedTemplate.summary;
    if (finalBrief.length > CREATE_BRIEF_MAX_CHARS) {
      setError(
        "Keep the starting brief under 10,000 characters. Add longer materials in Knowledge after creation.",
      );
      return;
    }
    const finalName = name.trim() || defaultName(templateKey);
    // Business or personal posture. It never creates a second customer-facing
    // workspace and never changes which Bot gets created.
    const legacyCapabilityProfile = !PERSONAL_STARTER_KEYS.has(templateKey);

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
          is_business_agent: legacyCapabilityProfile,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const body = (await safeJson(response)) as {
        id?: string;
        name?: string;
        mark_key?: unknown;
        channel?: WorkspaceAgentSummary["channel"];
        is_business_agent?: boolean;
        error?: string;
        code?: string;
      } | null;
      if (!isCreateBriefRecoveryOwner(creationUserId) || controller.signal.aborted) return;
      if (!response.ok || typeof body?.id !== "string" || !body.id) {
        if (isCurrentAccount()) {
          // The Bot limit opens the account-wide limit dialog, which states the
          // plan's real cap and links to Studio. Left open beneath it, this form
          // would outlive that link and keep covering the Bot the user must edit.
          if (body?.code === "AGENT_CAPACITY_REACHED") {
            dismiss();
            return;
          }
          setError(safeCreateAgentError(response.status, body?.code, body?.error));
          const markConflict = body?.code?.toLowerCase() === "bot_mark_conflict";
          if (response.status === 409 || markConflict) {
            conflictFocusRef.current = markConflict ? "mark" : "name";
            setCustomizing(true);
          }
        }
        return;
      }

      const savedAgent: WorkspaceAgentSummary = {
        id: body.id,
        name: body.name || finalName,
        mark_key: isBotMarkKey(body.mark_key) ? body.mark_key : null,
        channel: body.channel ?? "voice",
        is_business_agent: body.is_business_agent ?? legacyCapabilityProfile,
      };
      const stillOpen = isCurrentAccount();
      if (finalBrief) {
        void applyStartingBrief({
          userId: creationUserId,
          agentId: body.id,
          brief: finalBrief,
          template: selectedTemplate,
          signal: controller.signal,
          reportTraining: stillOpen,
        });
      }
      rememberCreatedAgent(savedAgent);
      if (!stillOpen) return;
      emitProductEvent({
        event: "agent_draft_created",
        agentId: body.id,
        metadata: {
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
          template: templateKey,
          workspace_model: "one_workspace",
          object: "bot",
          phone_provisioned: false,
        },
      });
      const wizardPayload: PostCreateWizardPayload = {
        agentId: body.id,
        agentName: savedAgent.name,
        markKey: savedAgent.mark_key ?? null,
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
          {agents.length > 0 ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Most businesses need one Bot: give it more tasks instead. Add another only for a
              separate business identity. Channels depend on your plan.
            </p>
          ) : null}
          <div className="grid min-w-0 grid-cols-1 gap-5">
            <div>
              <span className="text-sm font-semibold text-foreground">
                What should it handle first?
              </span>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Starting briefs">
                {STARTER_KEYS.map((key) => {
                  const preset = templateForKey(key);
                  const selected = templateKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={creating}
                      aria-pressed={selected}
                      onClick={() => {
                        setTemplateKey(key);
                        setMarkKey(
                          firstAvailableBotMarkKey(key, unavailableMarkKeysRef.current) ??
                            defaultBotMarkKey(key),
                        );
                        if (!brief.trim() || briefIsTemplateTextRef.current) {
                          setBrief(preset.summary);
                          briefIsTemplateTextRef.current = true;
                        }
                      }}
                      className={`min-h-11 rounded-full border px-3.5 text-sm transition-colors wl-focus-ring-halo ${
                        selected
                          ? "border-primary bg-primary/10 font-semibold text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

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
                placeholder="e.g. Nora or Alex"
                autoComplete="off"
              />
            </label>

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
                  <span className="block text-xs text-muted-foreground">Appearance</span>
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
                <BotMarkPicker
                  value={markKey}
                  onChange={(nextMarkKey) => {
                    markWasChosenRef.current = true;
                    setMarkKey(nextMarkKey);
                  }}
                  seed={`new:${templateKey}`}
                  name={name.trim() || defaultName(templateKey)}
                  compact
                  disabled={creating}
                  unavailableKeys={unavailableMarkKeys}
                />
              </div>
            </div>
          </div>

          {creating ? (
            <p aria-live="polite" className="mt-5 text-sm text-muted-foreground">
              Creating your Bot…
            </p>
          ) : null}

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
              disabled={creating}
              aria-busy={creating}
              className="h-auto min-h-11 gap-2 whitespace-normal px-3 py-2 sm:px-5"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <WandSparkles size={15} aria-hidden="true" />
              )}
              {creating ? "Creating Your Bot…" : language.createCta}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
