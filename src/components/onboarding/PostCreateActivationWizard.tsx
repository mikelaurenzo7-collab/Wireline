import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Cable, Loader2, MessageSquare, Phone, Sparkles, X } from "lucide-react";
import { Link } from "react-router";
import { useModalFocusTrap } from "../../lib/use-modal-focus-trap";
import { useBodyScrollLock } from "../../lib/use-body-scroll-lock";

import RoleplaySandbox from "../RoleplaySandbox";
import { Button } from "../atoms";
import { StatusNotice } from "../molecules";
import { authFetch } from "../../lib/api";
import { AGENTS_CHANGED_EVENT } from "../../contexts/AgentsContext";
import {
  ACTIVATION_PENDING_COPY,
  POST_CREATE_WIZARD_COPY,
} from "../../lib/wireline-onboarding-copy";
import { setPostSignupFlowActive } from "../../lib/post-signup-onboarding";
import {
  clearPostCreateWizard,
  readPostCreateWizardStep,
  stashPostCreateWizardStep,
  type PostCreateWizardPayload,
  type PostCreateWizardStep,
} from "../../lib/wireline-create-flow";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";

type WizardStep = PostCreateWizardStep | "complete";

function isWizardStep(value: string | null): value is PostCreateWizardStep {
  return value === "train" || value === "channels" || value === "wire" || value === "test";
}

/** Keep provision failures owner-safe — never surface ORM/provider internals. */
function safeProvisionError(
  status: number,
  code: string | null | undefined,
  raw: string | null | undefined,
): string {
  const normalized = code?.toLowerCase();
  if (status === 401 || status === 403) {
    return "Your session expired. Sign in again to continue wiring a number.";
  }
  if (status === 402 || normalized === "activation_required") {
    return POST_CREATE_WIZARD_COPY.steps.wire.activationRequired;
  }
  if (status === 429 || normalized === "rate_limited") {
    return "You're going a bit fast. Try provisioning again in a moment.";
  }
  if (status >= 500) {
    return "Number provisioning hit a temporary snag. Try again in a moment.";
  }
  if (typeof raw === "string" && raw.trim() && raw.trim().length <= 160 && !/[({]/.test(raw)) {
    return raw.trim();
  }
  return "Could not provision a number.";
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const domestic = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (domestic.length !== 10) return value;
  return `(${domestic.slice(0, 3)}) ${domestic.slice(3, 6)}-${domestic.slice(6)}`;
}

function formatTel(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:${number}`;
}

type PostCreateActivationWizardProps = {
  payload: PostCreateWizardPayload;
  onClose: () => void;
};

export default function PostCreateActivationWizard({
  payload,
  onClose,
}: PostCreateActivationWizardProps) {
  const [step, setStepState] = useState<WizardStep>(() => {
    const stored = readPostCreateWizardStep();
    if (stored === "channels") return "wire";
    return isWizardStep(stored) ? stored : "train";
  });
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [loadingPhone, setLoadingPhone] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [wireError, setWireError] = useState<string | null>(null);
  const [testStarted, setTestStarted] = useState(false);

  const stepOrder: WizardStep[] = ["train", "wire", "test", "complete"];
  const stepIndex = stepOrder.indexOf(step);

  const setStep = useCallback(
    (next: WizardStep) => {
      setStepState((current) => {
        if (isWizardStep(current) && current !== next) {
          emitProductEvent({
            event: "post_create_wizard_step_completed",
            agentId: payload.agentId,
            metadata: { step: current },
          });
        }
        return next;
      });
      if (isWizardStep(next)) stashPostCreateWizardStep(next);
    },
    [payload.agentId],
  );

  const refreshPhone = useCallback(async (): Promise<boolean> => {
    setLoadingPhone(true);
    try {
      const response = await authFetch("/api/phone-numbers");
      if (!response.ok) {
        setWireError("Couldn't refresh phone lines. Retry before provisioning another number.");
        return false;
      }
      const body = await response.json();
      const numbers = Array.isArray(body?.numbers) ? body.numbers : [];
      const match = numbers.find((row: { agent_id?: string }) => row.agent_id === payload.agentId);
      setPhoneNumber(match?.phone_number ?? null);
      setWireError(null);
      return true;
    } catch {
      setWireError("Couldn't refresh phone lines. Retry before provisioning another number.");
      return false;
    } finally {
      setLoadingPhone(false);
    }
  }, [payload.agentId]);

  useEffect(() => {
    setPostSignupFlowActive(true);
    void refreshPhone();
    return () => {
      setPostSignupFlowActive(false);
    };
  }, [refreshPhone]);

  async function provisionLine() {
    if (provisioning) return;
    setProvisioning(true);
    setWireError(null);
    try {
      const response = await authFetch("/api/phone-numbers/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: payload.agentId }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        code?: string;
      };
      if (response.status === 402 && body?.code === "ACTIVATION_REQUIRED") {
        setWireError(POST_CREATE_WIZARD_COPY.steps.wire.activationRequired);
        return;
      }
      if (!response.ok || body?.ok === false) {
        setWireError(safeProvisionError(response.status, body?.code, body?.error || body?.message));
        return;
      }
      emitProductEventOnce({
        event: "phone_channel_wired",
        agentId: payload.agentId,
        metadata: { channel: "phone", source: "fast_start_provision" },
      });
      emitProductEventOnce({
        event: "number_wired",
        agentId: payload.agentId,
        metadata: { channel: "phone", source: "fast_start_provision" },
      });
      emitProductEventOnce({
        event: "phone_number_provision_completed",
        agentId: payload.agentId,
      });
      emitProductEventOnce({
        event: "wire_started",
        agentId: payload.agentId,
      });
      // Overview, the rail, and Studio all derive live-line state from the
      // roster's agents[].phone_number — tell them about the new line now.
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
      const refreshed = await refreshPhone();
      if (refreshed) setStep("test");
    } catch {
      setWireError("Could not provision a number.");
    } finally {
      setProvisioning(false);
    }
  }

  function finish() {
    setStep("complete");
    emitProductEventOnce({
      event: "agent_launch_completed",
      agentId: payload.agentId,
      metadata: {
        has_line: Boolean(phoneNumber),
        test_started: testStarted,
        source: "post_create_wizard",
      },
    });
  }

  function dismiss() {
    if (provisioning) return;
    if (step === "complete") {
      emitProductEventOnce({
        event: "agent_launch_completed",
        agentId: payload.agentId,
        metadata: {
          has_line: Boolean(phoneNumber),
          test_started: testStarted,
          source: "post_create_wizard_dismiss",
        },
      });
    }
    setPostSignupFlowActive(false);
    clearPostCreateWizard();
    onClose();
  }

  const hasLine = Boolean(phoneNumber);

  const markWireFunnelEvents = useCallback(() => {
    emitProductEventOnce({ event: "wire_started", agentId: payload.agentId });
    if (phoneNumber) {
      emitProductEventOnce({
        event: "phone_channel_wired",
        agentId: payload.agentId,
        metadata: { channel: "phone", source: "fast_start_provision" },
      });
      emitProductEventOnce({
        event: "number_wired",
        agentId: payload.agentId,
        metadata: { channel: "phone", source: "fast_start_provision" },
      });
      emitProductEventOnce({
        event: "phone_number_provision_completed",
        agentId: payload.agentId,
      });
    }
  }, [payload.agentId, phoneNumber]);

  const completeCopy = useMemo(() => {
    if (hasLine && phoneNumber) {
      return {
        title: POST_CREATE_WIZARD_COPY.complete.wiredTitle,
        detail: POST_CREATE_WIZARD_COPY.complete.wiredDetail(
          payload.agentName,
          formatPhone(phoneNumber),
        ),
      };
    }
    return {
      title: POST_CREATE_WIZARD_COPY.complete.deferredTitle,
      detail: POST_CREATE_WIZARD_COPY.complete.deferredDetail(payload.agentName),
    };
  }, [hasLine, phoneNumber, payload.agentName]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(dialogRef, { onEscape: dismiss });
  useBodyScrollLock(true);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[var(--wireline-zIndex-modal,1050)] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-create-wizard-title"
      aria-busy={provisioning}
    >
      <div className="flex max-h-[min(92dvh,880px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[var(--radius-xl)] border border-border bg-background shadow-[var(--wireline-elevation-lg)] sm:rounded-[var(--radius-xl)]">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className={WL_APP_CLASSES.wiredEyebrow}>{POST_CREATE_WIZARD_COPY.eyebrow}</p>
            <h2
              id="post-create-wizard-title"
              data-slot="dialog-title"
              className="mt-1 font-[var(--wireline-font-family-display)] text-xl tracking-[-0.02em] text-foreground sm:text-2xl"
            >
              {POST_CREATE_WIZARD_COPY.title}{" "}
              <span className="wl-preserve-case">{payload.agentName}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={provisioning}
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            aria-label="Close setup guide"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="flex gap-2 border-b border-border px-5 py-3 sm:px-6">
          {(["train", "wire", "test"] as const).map((id, index) => {
            const active = step === id;
            const done = stepIndex > index || step === "complete";
            const labels = POST_CREATE_WIZARD_COPY.steps;
            return (
              <div
                key={id}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                  active
                    ? "border-primary/35 bg-primary/5 text-foreground"
                    : done
                      ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-foreground"
                      : "border-border text-muted-foreground"
                }`}
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Check size={11} aria-hidden="true" /> : index + 1}
                </span>
                <span className="truncate font-semibold">{labels[id].label}</span>
              </div>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === "train" ? (
            <section className="grid gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {POST_CREATE_WIZARD_COPY.steps.train.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {POST_CREATE_WIZARD_COPY.steps.train.detail}
                </p>
                <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-foreground">
                  {POST_CREATE_WIZARD_COPY.steps.train.salesHint}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/knowledge?agent=${encodeURIComponent(payload.agentId)}`}>
                    {POST_CREATE_WIZARD_COPY.steps.train.primary}
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    emitProductEventOnce({
                      event: "launch_readiness_reached",
                      agentId: payload.agentId,
                      metadata: { source: "wizard_train_step" },
                    });
                    setStep("wire");
                  }}
                >
                  {POST_CREATE_WIZARD_COPY.steps.train.secondary}
                </Button>
              </div>
            </section>
          ) : null}

          {step === "channels" ? (
            <section className="grid gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {POST_CREATE_WIZARD_COPY.steps.channels.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {POST_CREATE_WIZARD_COPY.steps.channels.detail}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Phone size={15} aria-hidden="true" className="text-primary" />
                    {POST_CREATE_WIZARD_COPY.steps.channels.phoneTitle}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {POST_CREATE_WIZARD_COPY.steps.channels.phoneDetail}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Cable size={15} aria-hidden="true" className="text-primary" />
                    {POST_CREATE_WIZARD_COPY.steps.channels.connectionsTitle}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {POST_CREATE_WIZARD_COPY.steps.channels.connectionsDetail}
                  </p>
                  <Button asChild variant="secondary" size="sm" className="mt-3">
                    <Link to="/connections" onClick={() => stashPostCreateWizardStep("channels")}>
                      {POST_CREATE_WIZARD_COPY.steps.channels.connectionsCta}
                    </Link>
                  </Button>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Opens Wire in this tab — return to Studio to resume this guide.
              </p>
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <MessageSquare
                  size={14}
                  className="mt-0.5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                Studio is your chat-first run surface — test voice and script before you wire more
                channels.
              </p>
              <Button type="button" size="sm" onClick={() => setStep("wire")}>
                {POST_CREATE_WIZARD_COPY.steps.channels.continue}
              </Button>
            </section>
          ) : null}

          {step === "wire" ? (
            <section className="grid gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {POST_CREATE_WIZARD_COPY.steps.wire.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {POST_CREATE_WIZARD_COPY.steps.wire.detail}
                </p>
              </div>

              {loadingPhone ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Checking your line…
                </div>
              ) : hasLine && phoneNumber ? (
                <div className="rounded-xl border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-4 py-3">
                  <p className="text-xs font-semibold text-primary">
                    {ACTIVATION_PENDING_COPY.phoneLabel}
                  </p>
                  <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
                    {formatPhone(phoneNumber)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {payload.phoneProvisioned
                      ? "Your line is connected from Fast Start."
                      : "This number is connected to this voice agent."}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  No live line yet. Connect one to receive real calls on this voice agent.
                </div>
              )}

              {wireError ? <StatusNotice tone="destructive" title={wireError} /> : null}

              <div className="flex flex-wrap gap-2">
                {hasLine ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      markWireFunnelEvents();
                      setStep("test");
                    }}
                  >
                    Continue to test
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={provisioning}
                      onClick={() => void provisionLine()}
                    >
                      {provisioning ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Phone size={14} aria-hidden="true" />
                      )}
                      {POST_CREATE_WIZARD_COPY.steps.wire.primary}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setStep("test")}
                    >
                      {POST_CREATE_WIZARD_COPY.steps.wire.skip}
                    </Button>
                  </>
                )}
              </div>
            </section>
          ) : null}

          {step === "test" ? (
            <section className="grid gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {POST_CREATE_WIZARD_COPY.steps.test.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {POST_CREATE_WIZARD_COPY.steps.test.detail}
                </p>
              </div>
              <RoleplaySandbox
                agentId={payload.agentId}
                agentName={payload.agentName}
                onTestStarted={() => {
                  setTestStarted(true);
                  emitProductEventOnce({
                    event: "first_test_call_started",
                    agentId: payload.agentId,
                    metadata: { channel: "roleplay" },
                  });
                }}
                onTestCompleted={() => {
                  emitProductEventOnce({
                    event: "test_call_completed",
                    agentId: payload.agentId,
                    metadata: { channel: "roleplay", result: "assistant_response_completed" },
                  });
                }}
              />
              {hasLine && phoneNumber ? (
                <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
                  <p className="text-xs font-semibold text-foreground">
                    {ACTIVATION_PENDING_COPY.phoneLabel}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {ACTIVATION_PENDING_COPY.subtitle(payload.agentName)}
                  </p>
                  <a
                    href={formatTel(phoneNumber)}
                    onClick={() => {
                      setTestStarted(true);
                      emitProductEventOnce({
                        event: "first_test_call_started",
                        agentId: payload.agentId,
                        metadata: { channel: "phone" },
                      });
                      emitProductEventOnce({
                        event: "test_call_started",
                        agentId: payload.agentId,
                        metadata: { channel: "phone" },
                      });
                    }}
                    className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    <Phone size={13} aria-hidden="true" />
                    {ACTIVATION_PENDING_COPY.dialCta}
                  </a>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === "complete" ? (
            <section className="grid gap-4 text-center sm:text-left">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)] sm:mx-0">
                <Sparkles size={22} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{completeCopy.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {completeCopy.detail}
                </p>
              </div>
              {hasLine && phoneNumber ? (
                <p className="text-xs text-muted-foreground">
                  {ACTIVATION_PENDING_COPY.browserTestDetail}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
          {step !== "complete" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={dismiss}
              disabled={provisioning}
            >
              Skip for now
            </Button>
          ) : null}
          {step === "test" ? (
            <Button type="button" size="sm" onClick={finish}>
              {testStarted ? POST_CREATE_WIZARD_COPY.steps.test.primary : "Finish without a test"}
            </Button>
          ) : null}
          {step === "complete" ? (
            <>
              {!hasLine ? (
                <Button asChild variant="secondary" size="sm">
                  <Link to="/settings/phone">{POST_CREATE_WIZARD_COPY.complete.phoneCta}</Link>
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={dismiss} disabled={provisioning}>
                {POST_CREATE_WIZARD_COPY.complete.studioCta}
              </Button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
