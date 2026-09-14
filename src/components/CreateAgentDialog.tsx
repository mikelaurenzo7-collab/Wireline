import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, WandSparkles, X, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { Button, Input, Textarea } from "./atoms";
import BotMarkPicker from "./BotMarkPicker";
import { StatusNotice } from "./molecules";
import { AGENTS_CHANGED_EVENT, useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { authFetch, safeJson } from "../lib/api";
import { trainingExtractionWasSaved } from "../lib/training-extraction-result";
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

const SELECTED =
  "border-primary bg-[var(--wireline-color-action-primary-containerStrong)] text-[var(--wireline-color-text-primary)]";
const IDLE =
  "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground";

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
  const [showRoles, setShowRoles] = useState(!initialTemplateKey);
  const briefIsTemplateTextRef = useRef(true);
  const markWasChosenRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [error, setError] = useState("");
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const language = customerAgentLanguage();

  useModalFocusTrap(dialogRef, { active: open, onEscape: close });
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const nextTemplate = templateForKey(initialTemplateKey);
    setTemplateKey(nextTemplate.key);
    setShowRoles(!BOT_ROLE_TEMPLATES.some((template) => template.key === initialTemplateKey));
    setMarkKey(
      firstAvailableBotMarkKey(nextTemplate.key, unavailableMarkKeysRef.current) ??
        defaultBotMarkKey(nextTemplate.key),
    );
    markWasChosenRef.current = false;
    setName("");
    setBrief(initialBrief || (nextTemplate.key === "custom" ? "" : nextTemplate.summary));
    briefIsTemplateTextRef.current = !initialBrief.trim();
    setError("");
    const frame = requestAnimationFrame(() => briefRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [initialBrief, initialTemplateKey, open]);

  useEffect(() => {
    if (!open || !unavailableMarkKeys.has(markKey)) return;
    const next = firstAvailableBotMarkKey(templateKey, unavailableMarkKeys);
    if (next) setMarkKey(next);
  }, [markKey, open, templateKey, unavailableMarkKeys]);

  function close() {
    if (creatingRef.current) return;
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
    if (creatingRef.current) return;
    if (!user?.id) {
      setError("Sign in again to keep building your Bot.");
      return;
    }
    if (markCapacityReached) {
      setError(
        "Every available Bot identity is already in use. Contact support before adding another Bot.",
      );
      return;
    }
    const selectedTemplate = templateForKey(templateKey);
    const finalBrief = brief.trim() || selectedTemplate.summary;
    const finalName = name.trim() || defaultName(templateKey);
    const role = TECHNICAL_ROLE_BY_TEMPLATE[templateKey];
    // Compatibility only: legacy records and provider defaults still store a
    // capability profile. It never creates a second customer-facing workspace.
    const legacyCapabilityProfile = isBusinessTemplateCategory(selectedTemplate.category);

    creatingRef.current = true;
    setCreating(true);
    setError("");

    try {
      const response = await authFetch("/api/agents", {
        method: "POST",
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
      if (!response.ok || !body?.id) {
        setError(safeCreateAgentError(response.status, body?.code, body?.error));
        return;
      }

      let trainingApplied = false;
      if (finalBrief) {
        try {
          const extractRes = await authFetch("/api/train/extract", {
            method: "POST",
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
          trainingApplied = extractRes.ok && trainingExtractionWasSaved(await safeJson(extractRes));
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
          `${finalName} was created. Your starting brief still needs to be saved; edit or retry it in the setup guide.`,
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
        ownerId: user.id,
        markKey: isBotMarkKey(body.mark_key) ? body.mark_key : null,
        phoneProvisionRequested: false,
        phoneProvisioned: false,
        ...(trainingApplied ? {} : { pendingBrief: finalBrief }),
      };
      stashPostCreateWizard(wizardPayload);
      onCreated?.(wizardPayload);
      setPostSignupFlowActive(true);
      navigate(`/studio?agent=${encodeURIComponent(body.id)}&section=setup`, { replace: true });
      onClose();
    } catch {
      setError("Bot could not be created. Try again.");
    } finally {
      creatingRef.current = false;
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
        data-visual-qa-state="create-dialog"
        onSubmit={create}
        onKeyDown={onKeyDown}
        className="wl-paper wl-paper-elevated my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden p-0 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-busy={creating}
        aria-labelledby="create-agent-title"
        aria-describedby="create-agent-description"
      >
        <div className="shrink-0 border-b border-border px-5 py-5 sm:px-6">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <section aria-labelledby="role-starters-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="role-starters-heading" className="text-sm font-semibold text-foreground">
                  Start With a Role
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose a starting point, then make it yours.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label="Available Bot channels">
                {BOT_CHANNELS.map((channel) => (
                  <span
                    key={channel.key}
                    className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                  >
                    {channel.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {templateForKey(templateKey).name}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {templateForKey(templateKey).summary}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={creating}
                aria-expanded={showRoles}
                aria-controls="create-role-options"
                onClick={() => setShowRoles((current) => !current)}
                className="shrink-0"
              >
                {showRoles ? "Hide roles" : "Change role"}
              </Button>
            </div>

            {showRoles ? (
              <div
                id="create-role-options"
                className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                role="group"
                aria-label="Bot role starters"
              >
                {BOT_ROLE_TEMPLATES.map((template) => {
                  const selected = templateKey === template.key;
                  return (
                    <button
                      key={template.key}
                      type="button"
                      disabled={creating}
                      onClick={() => {
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
                        setShowRoles(false);
                        requestAnimationFrame(() => briefRef.current?.focus());
                      }}
                      className={`rounded-[12px] border px-4 py-3 text-left transition-colors ${selected ? SELECTED : IDLE}`}
                      aria-pressed={selected}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-foreground">
                          {template.name}
                        </span>
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
                      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                        {template.direction}
                      </span>
                      <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
                        {template.summary}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-semibold text-foreground">
              Describe the Job
            </span>
            <Textarea
              ref={briefRef}
              value={brief}
              onChange={(event) => {
                briefIsTemplateTextRef.current = false;
                setBrief(event.target.value);
              }}
              disabled={creating}
              maxLength={10000}
              aria-describedby="create-brief-help"
              placeholder="We help local businesses with website design. Ask about their goals, budget, and timing. Offer a consultation; send custom pricing questions to me."
              className="min-h-[150px] text-[15px]"
              resize="vertical"
            />
          </label>
          <p id="create-brief-help" className="mt-2 text-xs leading-5 text-muted-foreground">
            What do you offer? Who should it help? What should happen next? Include any prices,
            limits, or questions that need you.
          </p>

          <details className="mt-5 rounded-xl border border-border px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Customize name &amp; mark
            </summary>
            <label className="mt-4 grid gap-1.5">
              <span className="text-xs font-semibold text-foreground">
                {language.nameLabel}{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={creating}
                placeholder={defaultName(templateKey)}
                autoComplete="off"
              />
            </label>
            <section className="mt-5" aria-labelledby="bot-mark-heading">
              <div className="mb-3">
                <h3 id="bot-mark-heading" className="text-sm font-semibold text-foreground">
                  Choose a Mark
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This symbol identifies your Bot everywhere in BotBound.
                </p>
              </div>
              <BotMarkPicker
                value={markKey}
                onChange={(nextMarkKey) => {
                  markWasChosenRef.current = true;
                  setMarkKey(nextMarkKey);
                }}
                seed={`new:${templateKey}`}
                name={name.trim() || defaultName(templateKey)}
                disabled={creating || markCapacityReached}
                unavailableKeys={unavailableMarkKeys}
              />
            </section>
          </details>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Create your Bot, then try a private test in Studio.
          </p>

          {error ? (
            <StatusNotice tone="destructive" title="Could Not Create Bot" className="mt-5">
              {error}
            </StatusNotice>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={close}
              disabled={creating}
              className="text-left text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
            >
              Not Now
            </button>
            <Button
              type="submit"
              disabled={creating || markCapacityReached}
              className="gap-2 sm:shrink-0"
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
