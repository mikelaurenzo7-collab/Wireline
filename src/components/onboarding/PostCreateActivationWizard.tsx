import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Phone, Sparkles, X } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useModalFocusTrap } from "../../lib/use-modal-focus-trap";
import { useBodyScrollLock } from "../../lib/use-body-scroll-lock";

import RoleplaySandbox from "../RoleplaySandbox";
import { Button } from "../atoms";
import { StatusNotice } from "../molecules";
import SoftOpenCheckoutNote from "./SoftOpenCheckoutNote";
import { authFetch } from "../../lib/api";
import { fetchSelfServeCheckoutAvailable } from "../../lib/checkout-availability";
import {
  ACTIVATION_PENDING_COPY,
  POST_CREATE_WIZARD_COPY,
  SOFT_OPEN_CHECKOUT_COPY,
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
import { planById } from "../../lib/plan-catalog";
import { activationBillingHref, getStoredSignupIntent } from "../../lib/signup-intent";

type WizardStep = PostCreateWizardStep | "complete";

function isWizardStep(value: string | null): value is PostCreateWizardStep {
  return (
    value === "train" ||
    value === "channels" ||
    value === "wire" ||
    value === "test" ||
    value === "launch"
  );
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
  const navigate = useNavigate();
  const [step, setStepState] = useState<WizardStep>(() => {
    const stored = readPostCreateWizardStep();
    if (stored === "channels") return "test";
    if (stored === "wire") return "launch";
    return isWizardStep(stored) ? stored : "train";
  });
  const [phoneLookup, setPhoneLookup] = useState<{
    phoneNumber: string | null;
    active: boolean;
    status: string | null;
  } | null>(null);
  const phoneRequestId = useRef(0);
  const [refreshingPhone, setLoadingPhone] = useState(true);
  const [phoneLookupFailed, setPhoneLookupFailed] = useState(false);
  // A reserved number is not proof of working routing. A successful inventory
  // read is authoritative, including when an older payload's line was removed.
  const phoneNumber = phoneLookup ? phoneLookup.phoneNumber : payload.phoneNumber || null;
  const loadingPhone = refreshingPhone;
  const hasLiveLine = Boolean(phoneLookup?.active && !refreshingPhone && !phoneLookupFailed);
  const [wireError, setWireError] = useState<string | null>(null);
  // 402 ACTIVATION_REQUIRED is not an error — it is the go-live moment for a
  // customer who just built and trained a Bot. When checkout is open it is a
  // plan-choice panel. When checkout is closed it must not imply Stripe works.
  const [checkoutAvailable, setCheckoutAvailable] = useState<boolean | null>(null);
  const activationNeeded = !phoneNumber && payload.phoneActivationRequired === true;
  const [testStarted, setTestStarted] = useState(false);

  const stepOrder: WizardStep[] = ["train", "test", "launch", "complete"];
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

  const refreshPhone = useCallback(async (): Promise<{
    ok: boolean;
    phoneNumber: string | null;
    active: boolean;
  }> => {
    const requestId = ++phoneRequestId.current;
    setLoadingPhone(true);
    try {
      const response = await authFetch("/api/phone-numbers");
      if (!response.ok) throw new Error("Phone inventory unavailable");
      const body = await response.json();
      if (!Array.isArray(body?.numbers)) throw new Error("Invalid phone inventory");
      if (requestId !== phoneRequestId.current)
        return { ok: false, phoneNumber: null, active: false };
      const numbers = body.numbers;
      const match = numbers.find((row: { agent_id?: string }) => row.agent_id === payload.agentId);
      const next =
        typeof match?.phone_number === "string" ? match.phone_number.trim() || null : null;
      const active = Boolean(next && match?.native_voice_status === "active");
      setPhoneLookupFailed(false);
      setPhoneLookup({ phoneNumber: next, active, status: match?.native_voice_status ?? null });
      setWireError(null);
      return { ok: true, phoneNumber: next, active };
    } catch {
      if (requestId === phoneRequestId.current) {
        setPhoneLookupFailed(true);
        setWireError("Couldn't refresh phone lines. Retry before provisioning another number.");
      }
      return { ok: false, phoneNumber: null, active: false };
    } finally {
      if (requestId === phoneRequestId.current) setLoadingPhone(false);
    }
  }, [payload.agentId]);

  useEffect(() => {
    setPostSignupFlowActive(true);
    void refreshPhone();
    void fetchSelfServeCheckoutAvailable().then(setCheckoutAvailable);
    return () => {
      phoneRequestId.current += 1;
      setPostSignupFlowActive(false);
    };
    // Verify background provisioning without remounting or resetting the step.
  }, [
    refreshPhone,
    payload.phoneNumber,
    payload.phoneProvisioned,
    payload.phoneActivationRequired,
  ]);

  function chooseNumber() {
    if (refreshingPhone || phoneLookupFailed) return;
    dismiss();
    navigate(`/phone?tab=setup&agent=${encodeURIComponent(payload.agentId)}`);
  }

  function finish(line: string | null = hasLiveLine ? phoneNumber : null) {
    setStep("complete");
    if (line && testStarted) {
      emitProductEventOnce({
        event: "agent_launch_completed",
        agentId: payload.agentId,
        metadata: {
          has_line: true,
          test_started: true,
          source: "post_create_wizard",
        },
      });
    }
  }

  function dismiss() {
    if (step === "complete" && hasLiveLine && testStarted) {
      emitProductEventOnce({
        event: "agent_launch_completed",
        agentId: payload.agentId,
        metadata: {
          has_line: true,
          test_started: true,
          source: "post_create_wizard_dismiss",
        },
      });
    }
    setPostSignupFlowActive(false);
    clearPostCreateWizard();
    onClose();
  }

  const hasLine = Boolean(phoneNumber);
  const starterPriceUsd = planById("starter")?.price_usd_monthly ?? 19;
  // Preselect the PAID plan the customer told us about at signup. A Free
  // Builder signup's stored intent (and the no-intent default) is "personal",
  // which cannot activate a number — the CTA promising "$19/mo" must land on
  // Starter, never on the free tier.
  const activationPlanPath = useMemo(() => activationBillingHref(getStoredSignupIntent()), []);

  const markWireFunnelEvents = useCallback(() => {
    if (!hasLiveLine) return;
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
  }, [payload.agentId, phoneNumber, hasLiveLine]);

  const completeCopy = useMemo(() => {
    if (hasLiveLine && phoneNumber) {
      return {
        title: POST_CREATE_WIZARD_COPY.complete.liveTitle,
        detail: POST_CREATE_WIZARD_COPY.complete.liveDetail(
          payload.agentName,
          formatPhone(phoneNumber),
        ),
      };
    }
    if (hasLine) {
      return {
        title: "Your Number Is Reserved",
        detail: "Calling is not confirmed yet. Open Phone setup to finish connecting this number.",
      };
    }
    if (activationNeeded && checkoutAvailable === false) {
      return {
        title: POST_CREATE_WIZARD_COPY.complete.deferredTitle,
        detail: SOFT_OPEN_CHECKOUT_COPY.savedDetail(payload.agentName),
      };
    }
    return {
      title: POST_CREATE_WIZARD_COPY.complete.deferredTitle,
      detail: POST_CREATE_WIZARD_COPY.complete.deferredDetail(payload.agentName),
    };
  }, [hasLine, hasLiveLine, phoneNumber, payload.agentName, checkoutAvailable, activationNeeded]);

  // A sales pause must not prevent an existing paid customer from choosing
  // their line. The Phone picker checks current server-owned entitlement.
  const checkoutClosed = activationNeeded && checkoutAvailable === false;
  const canProvisionNumber = !activationNeeded || checkoutAvailable === true;
  const waitingForLaunch =
    loadingPhone ||
    (activationNeeded &&
      !hasLiveLine &&
      !hasLine &&
      !phoneLookupFailed &&
      checkoutAvailable === null);

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
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            aria-label="Close setup guide"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <nav
          aria-label="Setup steps"
          className="flex items-center gap-2 border-b border-border px-5 py-3.5 sm:px-6"
        >
          {(["train", "test", "launch"] as const).map((id, index) => {
            const active = step === id;
            const done = stepIndex > index || step === "complete";
            return (
              <div key={id} className="flex min-w-0 flex-1 items-center gap-2">
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className={`h-px min-w-3 flex-1 ${
                      done || active ? "bg-primary/35" : "bg-border"
                    }`}
                  />
                ) : null}
                <p
                  className={`wl-overline truncate ${
                    active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {POST_CREATE_WIZARD_COPY.steps[id].label}
                </p>
              </div>
            );
          })}
        </nav>

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
                    setStep("test");
                  }}
                >
                  {POST_CREATE_WIZARD_COPY.steps.train.secondary}
                </Button>
              </div>
            </section>
          ) : null}

          {step === "launch" ? (
            <section className="grid gap-4">
              {waitingForLaunch ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Checking your line…
                </div>
              ) : checkoutClosed && !hasLiveLine && !hasLine && !phoneLookupFailed ? (
                <SoftOpenCheckoutNote />
              ) : (
                <>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {POST_CREATE_WIZARD_COPY.steps.launch.title}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {POST_CREATE_WIZARD_COPY.steps.launch.detail}
                    </p>
                  </div>

                  {hasLiveLine && phoneNumber ? (
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
                          : "This number is connected to this Bot."}
                      </p>
                    </div>
                  ) : hasLine && phoneNumber ? (
                    <div className="rounded-xl border border-border bg-card px-4 py-3">
                      <p className="text-xs font-semibold text-foreground">Number reserved</p>
                      <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
                        {formatPhone(phoneNumber)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {phoneLookup?.status === "configuration_required"
                          ? "Calling needs platform setup. Open Phone setup or contact BotBound support."
                          : "Calling is not confirmed yet. Retry the connection without purchasing another number."}
                      </p>
                    </div>
                  ) : phoneLookupFailed ? null : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                      No live line yet. Connect one to receive real calls with this Bot.
                    </div>
                  )}

                  {activationNeeded && !phoneLookupFailed && canProvisionNumber ? (
                    <div className="rounded-xl border border-primary/25 bg-[var(--wireline-color-action-primary-container)] px-4 py-4">
                      <p className="text-sm font-semibold text-foreground">
                        {POST_CREATE_WIZARD_COPY.steps.launch.activationRequired}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {POST_CREATE_WIZARD_COPY.steps.launch.activationDetail(starterPriceUsd)}
                      </p>
                      <Button asChild size="sm" className="mt-3">
                        <Link
                          to={activationPlanPath}
                          onClick={() => stashPostCreateWizardStep("launch")}
                        >
                          {POST_CREATE_WIZARD_COPY.steps.launch.activationCta}
                        </Link>
                      </Button>
                    </div>
                  ) : wireError ? (
                    <StatusNotice
                      tone="destructive"
                      title={wireError}
                      action={
                        phoneLookupFailed ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void refreshPhone()}
                            disabled={refreshingPhone}
                          >
                            Retry line lookup
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : null}
                </>
              )}

              <div className="flex flex-wrap gap-2">
                {hasLiveLine ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      markWireFunnelEvents();
                      finish();
                    }}
                  >
                    Continue
                  </Button>
                ) : hasLine ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={refreshingPhone}
                      onClick={() => void refreshPhone()}
                    >
                      Retry connection
                    </Button>
                    <Button asChild variant="secondary" size="sm">
                      <Link
                        to={`/phone?tab=setup&agent=${encodeURIComponent(payload.agentId)}`}
                        onClick={dismiss}
                      >
                        Open Phone setup
                      </Link>
                    </Button>
                  </>
                ) : checkoutClosed ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => finish()}>
                    {POST_CREATE_WIZARD_COPY.steps.launch.skip}
                  </Button>
                ) : (
                  <>
                    {canProvisionNumber ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={refreshingPhone || phoneLookupFailed}
                        onClick={chooseNumber}
                      >
                        <Phone size={14} aria-hidden="true" />
                        {POST_CREATE_WIZARD_COPY.steps.launch.primary}
                      </Button>
                    ) : null}
                    <Button type="button" variant="secondary" size="sm" onClick={() => finish()}>
                      {POST_CREATE_WIZARD_COPY.steps.launch.skip}
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
                markKey={payload.markKey}
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
              {hasLiveLine && phoneNumber ? (
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
              {hasLiveLine && phoneNumber ? (
                <p className="text-xs text-muted-foreground">
                  {ACTIVATION_PENDING_COPY.browserTestDetail}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
          {step !== "complete" ? (
            <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
              Skip for now
            </Button>
          ) : null}
          {step === "test" ? (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setStep("launch")}>
                {POST_CREATE_WIZARD_COPY.steps.test.skip}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!testStarted}
                onClick={() => setStep("launch")}
              >
                {POST_CREATE_WIZARD_COPY.steps.test.primary}
              </Button>
            </>
          ) : null}
          {step === "complete" ? (
            <>
              {!hasLiveLine ? (
                <Button asChild variant="secondary" size="sm">
                  <Link
                    to={
                      checkoutClosed && !hasLine ? SOFT_OPEN_CHECKOUT_COPY.href : "/phone?tab=setup"
                    }
                  >
                    {hasLine
                      ? "Open Phone setup"
                      : checkoutClosed
                        ? SOFT_OPEN_CHECKOUT_COPY.cta
                        : POST_CREATE_WIZARD_COPY.complete.phoneCta}
                  </Link>
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={dismiss}>
                {POST_CREATE_WIZARD_COPY.complete.studioCta}
              </Button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
