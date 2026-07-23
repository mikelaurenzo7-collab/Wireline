/**
 * SubscriptionGateModal - the direct paid-activation path.
 *
 * Listens for the global `wireline:trial-gate-block` event emitted by authFetch
 * when a paid action receives a 402. Legacy trial tenants retain their existing
 * upgrade path; new accounts receive an explicit activation path instead of a
 * hidden free trial.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, CreditCard, AlertTriangle, Sparkles, Mail, Check } from "lucide-react";
import { authFetch, safeJson, TRIAL_GATE_EVENT, type TrialGateBlockDetail } from "../lib/api";
import { cn } from "../lib/utils";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { useModalFocusTrap } from "../lib/use-modal-focus-trap";
import { getStoredSignupIntent, recommendedPlanFromIntent } from "../lib/signup-intent";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import { ShadButton } from "./ui/shadcn/ShadButton";

const TIER_PITCH: Record<string, string> = {
  team: "Shared inbox, routing, connected numbers, and core integrations",
  business: "Approvals, analytics, CRM sync, roles, and pooled live work",
  enterprise: "Governed rollout, security review, custom policy, and committed usage",
};

/** Public self-serve plans only. Retained plans stay serviceable but are never reacquired accidentally. */
const SELF_SERVE_TIERS = STRIPE_PLANS.filter(
  (plan) => plan.price_usd_monthly > 0 && plan.public !== false,
).map((plan) => ({
  id: plan.id,
  label: plan.name,
  price: plan.price_usd_monthly,
  pitch: TIER_PITCH[plan.id] ?? plan.features[0] ?? "",
}));

function headlineForCode(detail: TrialGateBlockDetail): { title: string; body: string } {
  switch (detail.code) {
    case "ACTIVATION_REQUIRED":
      return {
        title: "Activate live work",
        body: "Create and train stay free. Choose a live plan to add a production number and paid provider actions.",
      };
    case "EMAIL_UNVERIFIED":
      return {
        title: "Verify your email first",
        body: "We sent you a link from Wireline. Click it to unlock paid activation and agent deployment. Check your inbox and spam folder, or resend the link below.",
      };
    case "TRIAL_LIMIT_HIT":
      return {
        title: "Trial limit reached",
        body:
          typeof detail.limit === "number" && typeof detail.current === "number"
            ? `You've used ${detail.current} of ${detail.limit} during your legacy trial. Choose a live plan to keep going — your data and agent stay exactly as they are.`
            : "You've hit your legacy trial limit. Choose a live plan to keep going.",
      };
    case "TRIAL_EXPIRED":
      return {
        title: "Your legacy trial ended",
        body: "Choose a live plan to restore your agent. Your settings and call history stay exactly as you left them.",
      };
    case "SUBSCRIPTION_REQUIRED":
      return {
        title: "Subscription paused",
        body: "Your subscription is past due. Open Stripe billing to update your payment method and restore live work.",
      };
    default:
      return { title: "Capacity required", body: detail.error };
  }
}

type ResendOutcome = "idle" | "pending" | "sent" | "no-transport" | "error";

export default function TrialGateModal() {
  const [detail, setDetail] = useState<TrialGateBlockDetail | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resend, setResend] = useState<ResendOutcome>("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const checkoutAbortRef = useRef<AbortController | null>(null);

  function closeModal() {
    checkoutAbortRef.current?.abort();
    checkoutAbortRef.current = null;
    setPending(null);
    setDetail(null);
  }

  useBodyScrollLock(detail !== null);
  useModalFocusTrap(dialogRef, {
    active: detail !== null,
    onEscape: closeModal,
  });

  useEffect(() => {
    const onBlock = (event: Event) => {
      const customEvent = event as CustomEvent<TrialGateBlockDetail>;
      if (!customEvent.detail) return;
      checkoutAbortRef.current?.abort();
      checkoutAbortRef.current = null;
      setPending(null);
      setDetail(customEvent.detail);
      setError(null);
      setResend("idle");
    };
    window.addEventListener(TRIAL_GATE_EVENT, onBlock);
    return () => {
      window.removeEventListener(TRIAL_GATE_EVENT, onBlock);
      checkoutAbortRef.current?.abort();
      checkoutAbortRef.current = null;
    };
  }, []);

  if (!detail) return null;

  const { title, body } = headlineForCode(detail);
  const recommendedPlanId = recommendedPlanFromIntent(getStoredSignupIntent());
  const eyebrow =
    detail.code === "ACTIVATION_REQUIRED"
      ? "Activate live work"
      : detail.code === "SUBSCRIPTION_REQUIRED"
        ? "Restore billing"
        : "Choose a live plan";
  const showBillingPortal = detail.code === "SUBSCRIPTION_REQUIRED";
  const showPlanCheckout =
    detail.code !== "EMAIL_UNVERIFIED" && detail.code !== "SUBSCRIPTION_REQUIRED";

  async function checkout(planId: string) {
    checkoutAbortRef.current?.abort();
    const controller = new AbortController();
    checkoutAbortRef.current = controller;
    setPending(planId);
    setError(null);
    try {
      const response = await authFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
        signal: controller.signal,
      });
      const data = (await safeJson<{ url?: string; error?: string }>(response)) as {
        url?: string;
        error?: string;
      } | null;
      const checkoutUrl = data?.url;
      if (!response.ok || !checkoutUrl) {
        setError(data?.error || "Checkout couldn't be opened. Try again or contact support.");
        setPending(null);
        return;
      }

      if (typeof window !== "undefined") {
        try {
          const prices: Record<string, number> = Object.fromEntries(
            STRIPE_PLANS.map((plan) => [plan.id, plan.price_usd_monthly]),
          );
          const windowWithAnalytics = window as unknown as {
            fbq?: (event: string, action: string, data?: Record<string, unknown>) => void;
            dataLayer?: { push: (data: Record<string, unknown>) => void };
          };
          if (typeof windowWithAnalytics.fbq === "function") {
            windowWithAnalytics.fbq("track", "InitiateCheckout", {
              content_category: "Subscription",
              content_ids: [planId],
              value: prices[planId] || 0,
              currency: "USD",
            });
          }
          if (typeof window.plausible === "function") {
            window.plausible("CheckoutInitiated", { props: { plan: planId } });
          }
          if (
            windowWithAnalytics.dataLayer &&
            typeof windowWithAnalytics.dataLayer.push === "function"
          ) {
            windowWithAnalytics.dataLayer.push({ event: "checkout_initiated", planId });
          }
        } catch (analyticsError) {
          console.error("[wireline:analytics] Failed to log checkout initiation:", analyticsError);
        }
      }

      window.location.href = checkoutUrl;
    } catch (checkoutError: unknown) {
      // Ignore only intentional dismissals via checkoutAbortRef. authFetch also
      // aborts on its own timeout with AbortError — those must surface.
      if (controller.signal.aborted) return;
      setError(
        checkoutError instanceof Error ? checkoutError.message : "Network error opening checkout.",
      );
      setPending(null);
    } finally {
      if (checkoutAbortRef.current === controller) checkoutAbortRef.current = null;
    }
  }

  async function openBillingPortal() {
    checkoutAbortRef.current?.abort();
    const controller = new AbortController();
    checkoutAbortRef.current = controller;
    setPending("billing-portal");
    setError(null);
    try {
      const response = await authFetch("/api/billing/portal", {
        method: "POST",
        signal: controller.signal,
      });
      const data = (await safeJson<{ url?: string; error?: string }>(response)) as {
        url?: string;
        error?: string;
      } | null;
      const portalUrl = data?.url;
      if (!response.ok || !portalUrl) {
        setError(data?.error || "Stripe billing could not be opened. Try again shortly.");
        setPending(null);
        return;
      }
      window.location.href = portalUrl;
    } catch (portalError: unknown) {
      if (controller.signal.aborted) return;
      setError(
        portalError instanceof Error ? portalError.message : "Network error opening Stripe billing.",
      );
      setPending(null);
    } finally {
      if (checkoutAbortRef.current === controller) checkoutAbortRef.current = null;
    }
  }

  async function resendVerification() {
    setResend("pending");
    try {
      const response = await authFetch("/api/auth/resend-verification", { method: "POST" });
      const data = (await safeJson<{ ok?: boolean; sent?: boolean; reason?: string }>(
        response,
      )) as { ok?: boolean; sent?: boolean; reason?: string } | null;
      if (data?.ok && data.sent) setResend("sent");
      else if (data?.reason === "transport_unavailable") setResend("no-transport");
      else setResend("error");
    } catch {
      setResend("error");
    }
  }

  return (
    <AnimatePresence>
      {detail && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 px-0 pt-[env(safe-area-inset-top,0)] pb-[env(safe-area-inset-bottom,0)] backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="trial-gate-title"
          aria-describedby="trial-gate-description"
          aria-busy={pending !== null || resend === "pending"}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-0.75rem)] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-t-md border border-border bg-card shadow-2xl sm:rounded-md"
          >
            <ShadButton
              type="button"
              disableAnimations
              variant="ghost"
              size="icon"
              onClick={closeModal}
              aria-label="Close"
              className="absolute top-4 right-4 z-10 h-11 w-11 rounded-full text-muted hover:bg-muted/10 hover:text-foreground after:hidden sm:h-9 sm:w-9"
            >
              <X className="h-4 w-4" />
            </ShadButton>

            <div className="px-6 pt-8 pb-6 sm:px-8">
              <div className="mb-3 flex items-center gap-2 font-medium text-brand wl-label">
                <Sparkles className="h-3 w-3" />
                {eyebrow}
              </div>
              <h2
                id="trial-gate-title"
                className="mb-2 text-balance font-display text-2xl italic text-foreground sm:text-3xl"
              >
                {title}
              </h2>
              <p
                id="trial-gate-description"
                className="max-w-xl text-sm leading-relaxed text-foreground/75 sm:text-base"
              >
                {body}
              </p>
            </div>

            <div className="px-6 pb-6 sm:px-8">
              {detail.code === "EMAIL_UNVERIFIED" && (
                <div className="flex flex-col items-start gap-3">
                  <ShadButton
                    type="button"
                    disableAnimations
                    onClick={resendVerification}
                    disabled={resend === "pending" || resend === "sent"}
                    className="h-11 rounded-md px-5"
                  >
                    {resend === "pending" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending
                      </span>
                    ) : resend === "sent" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="h-4 w-4" />
                        Verification email sent
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-4 w-4" />
                        Resend verification email
                      </span>
                    )}
                  </ShadButton>
                  {resend === "sent" && (
                    <p className="text-xs leading-relaxed text-foreground/65">
                      Sent — check your inbox and spam folder for a link from Wireline.
                    </p>
                  )}
                  {resend === "no-transport" && (
                    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-600">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Mail is temporarily unavailable. Try again in a few minutes — your account
                      isn&apos;t affected.
                    </p>
                  )}
                  {resend === "error" && (
                    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-rose-600">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Couldn&apos;t send the email. Refresh and try again, or contact support.
                    </p>
                  )}
                </div>
              )}
              {showBillingPortal && (
                <div className="flex flex-col items-start gap-3">
                  <ShadButton
                    type="button"
                    disableAnimations
                    onClick={openBillingPortal}
                    disabled={pending !== null}
                    className="h-11 rounded-md px-5"
                  >
                    {pending === "billing-portal" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening Stripe billing
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        Update payment in Stripe
                      </>
                    )}
                  </ShadButton>
                  <a
                    href="/settings/billing"
                    className="text-xs text-brand underline-offset-2 hover:underline"
                  >
                    View Wireline billing details
                  </a>
                </div>
              )}
              {showPlanCheckout && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {SELF_SERVE_TIERS.map((tier) => {
                    const isPending = pending === tier.id;
                    const isRecommended = tier.id === recommendedPlanId;
                    return (
                      <ShadButton
                        key={tier.id}
                        type="button"
                        disableAnimations
                        variant="outline"
                        onClick={() => checkout(tier.id)}
                        disabled={!!pending}
                        className={cn(
                          "relative h-auto w-full justify-start rounded-md p-4 text-left touch-manipulation",
                          isRecommended
                            ? "border-brand/50 bg-brand/5 hover:border-brand hover:bg-brand/10"
                            : "hover:border-brand/30 hover:bg-black/3",
                        )}
                      >
                        {isRecommended && (
                          <div className="absolute -top-2 left-4 rounded-full bg-brand px-2 py-0.5 font-medium text-on-brand wl-label">
                            Recommended
                          </div>
                        )}
                        <div className="mb-1 font-display text-lg italic text-foreground">
                          {tier.label}
                        </div>
                        <div className="mb-2 flex items-baseline gap-1">
                          <span className="font-display text-2xl italic text-foreground">
                            ${tier.price}
                          </span>
                          <span className="wl-label-muted/70">/mo</span>
                        </div>
                        <p className="mb-3 text-[var(--wireline-typography-overline-size)] leading-relaxed text-foreground/65">
                          {tier.pitch}
                        </p>
                        <div className="inline-flex items-center gap-1.5 text-brand wl-label">
                          {isPending ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Opening
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-3 w-3" />
                              Pick {tier.label}
                            </>
                          )}
                        </div>
                      </ShadButton>
                    );
                  })}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-rose-600"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {showPlanCheckout && (
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted/70 wl-label">
                  <span>Secure checkout in Stripe</span>
                  <span>&middot;</span>
                  <span>Cancel anytime</span>
                  <span>&middot;</span>
                  <a
                    href="mailto:sales@trywireline.com?subject=Enterprise%20pricing"
                    className="text-brand transition-colors hover:text-brand/80"
                  >
                    Need Enterprise?
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
