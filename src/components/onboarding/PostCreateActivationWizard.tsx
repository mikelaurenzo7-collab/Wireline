import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Phone, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";

import RoleplaySandbox from "../RoleplaySandbox";
import { Button } from "../atoms";
import { authFetch } from "../../lib/api";
import {
  ACTIVATION_PENDING_COPY,
  POST_CREATE_WIZARD_COPY,
  YOURE_LIVE_COPY,
} from "../../lib/wireline-onboarding-copy";
import { setPostSignupFlowActive } from "../../lib/post-signup-onboarding";
import type { PostCreateWizardPayload } from "../../lib/wireline-create-flow";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";

type WizardStep = "train" | "wire" | "test" | "complete";

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
  const [step, setStep] = useState<WizardStep>("train");
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [loadingPhone, setLoadingPhone] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [wireError, setWireError] = useState<string | null>(null);

  const stepOrder: WizardStep[] = ["train", "wire", "test", "complete"];
  const stepIndex = stepOrder.indexOf(step);

  const refreshPhone = useCallback(async () => {
    setLoadingPhone(true);
    try {
      const response = await authFetch("/api/phone-numbers");
      const body = response.ok ? await response.json() : null;
      const numbers = Array.isArray(body?.numbers) ? body.numbers : [];
      const match =
        numbers.find((row: { agent_id?: string }) => row.agent_id === payload.agentId) ??
        numbers[0];
      setPhoneNumber(match?.phone_number ?? null);
    } catch {
      setPhoneNumber(null);
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
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error || body?.message || "Could not provision a number.");
      }
      await refreshPhone();
      setStep("test");
    } catch (reason) {
      setWireError(reason instanceof Error ? reason.message : "Could not provision a number.");
    } finally {
      setProvisioning(false);
    }
  }

  function finish() {
    setStep("complete");
  }

  function dismiss() {
    setPostSignupFlowActive(false);
    onClose();
  }

  const hasLine = Boolean(phoneNumber);
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

  return (
    <div
      className="fixed inset-0 z-[var(--wireline-z-modal,80)] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
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
              className="mt-1 font-[var(--wireline-font-family-display)] text-xl tracking-[-0.02em] text-foreground sm:text-2xl"
            >
              {POST_CREATE_WIZARD_COPY.title} {payload.agentName}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
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
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/knowledge?agent=${encodeURIComponent(payload.agentId)}`}>
                    {POST_CREATE_WIZARD_COPY.steps.train.primary}
                  </Link>
                </Button>
                <Button type="button" size="sm" onClick={() => setStep("wire")}>
                  {POST_CREATE_WIZARD_COPY.steps.train.secondary}
                </Button>
              </div>
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
                    {payload.phoneProvisionRequested
                      ? "Your line is connected from Fast Start."
                      : "A number is already on this workspace."}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  No live line yet. Provision one to receive real calls on this agent.
                </div>
              )}

              {wireError ? (
                <p className="text-sm text-destructive" role="alert">
                  {wireError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {hasLine ? (
                  <Button type="button" size="sm" onClick={() => setStep("test")}>
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
              <RoleplaySandbox agentId={payload.agentId} agentName={payload.agentName} />
              {hasLine && phoneNumber ? (
                <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
                  <p className="text-xs font-semibold text-foreground">
                    {ACTIVATION_PENDING_COPY.browserTestTitle}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {ACTIVATION_PENDING_COPY.subtitle(payload.agentName)}
                  </p>
                  <a
                    href={formatTel(phoneNumber)}
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
              <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-primary sm:mx-0">
                <Sparkles size={22} aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{completeCopy.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {completeCopy.detail}
                </p>
              </div>
              {hasLine && phoneNumber ? (
                <p className="text-xs text-muted-foreground">{YOURE_LIVE_COPY.testCallDetail}</p>
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
            <Button type="button" size="sm" onClick={finish}>
              {POST_CREATE_WIZARD_COPY.steps.test.primary}
            </Button>
          ) : null}
          {step === "complete" ? (
            <>
              {!hasLine ? (
                <Button asChild variant="secondary" size="sm">
                  <Link to="/settings/phone">{POST_CREATE_WIZARD_COPY.complete.phoneCta}</Link>
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
